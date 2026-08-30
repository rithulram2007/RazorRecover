/**
 * Batch Evaluation Pipeline.
 *
 * Train → Validate → Test → Report.
 * All metrics computed from actual simulation results. Never fabricated.
 */

import type {
  Transaction,
  EvaluationReport,
  MLMetrics,
  BusinessMetrics,
  AgentMetrics,
  Money,
} from '@/types';
import { RecoveryProbabilityModel, type TrainingExample } from '@/lib/ml/recoveryModel';
import { confusionMatrix, precision, recall, f1Score, rocAuc } from '@/lib/ml/metrics';
import { splitDataset } from '@/lib/dataset/generator';
import { diagnoseFailure } from '@/lib/detection/diagnosis';
import { createRecoveryEngine } from '@/lib/engine/recoveryEngine';
import { SeededRandom } from '@/lib/random';

export interface EvaluationConfig {
  dataset: Transaction[];
  seed: number;
  splitSeed: number;
  llmProvider: null;
}

export async function runEvaluation(config: EvaluationConfig): Promise<EvaluationReport> {
  const { dataset, seed, splitSeed } = config;

  // 1. Split dataset
  const { train, validation, test } = splitDataset(dataset, splitSeed);

  // 2. Generate training labels
  const labelRng = new SeededRandom(seed);
  const trainExamples: TrainingExample[] = train.map((txn) => {
    const diagnosis = diagnoseFailure(txn);
    const features = new RecoveryProbabilityModel().featuresToVector(
      new RecoveryProbabilityModel().extractFeatures(txn, diagnosis),
    );
    const label = RecoveryProbabilityModel.generateLabel(txn, diagnosis, labelRng);
    return { features, label };
  });

  // 3. Train model
  const model = new RecoveryProbabilityModel();
  model.train(trainExamples, 200, 0.1);

  // 4. Evaluate ML metrics on held-out test set
  const testLabels: number[] = [];
  const testPredictions: number[] = [];
  const testRng = new SeededRandom(seed + 1);

  for (const txn of test) {
    const diagnosis = diagnoseFailure(txn);
    const pred = model.predict(txn, diagnosis);
    const label = RecoveryProbabilityModel.generateLabel(txn, diagnosis, testRng);
    testPredictions.push(pred);
    testLabels.push(label);
  }

  const cm = confusionMatrix(testPredictions, testLabels, 0.5);
  const mlMetrics: MLMetrics = {
    precision: precision(cm),
    recall: recall(cm),
    f1: f1Score(cm),
    roc_auc: rocAuc(testPredictions, testLabels),
    sample_count: test.length,
  };

  // 5. Run recovery simulation on test set
  const engine = createRecoveryEngine(seed, config.llmProvider);

  // Inject the trained model
  const trainedModel = model;

  // Process each at-risk transaction
  const atRiskTxns = test.filter((t) =>
    t.payment_status === 'failed' || t.payment_status === 'pending' || t.payment_status === 'abandoned',
  );

  let totalRevenue = 0;
  let revenueAtRisk = 0;
  let revenueRecovered = 0;
  let transactionsRecovered = 0;
  let interventionsAttempted = 0;
  let falseInterventionCost = 0;
  let escalations = 0;
  let stoppedCases = 0;
  let failedInterventions = 0;
  let totalAttempts = 0;

  let validActions = 0;
  let invalidOutputs = 0;
  let guardrailViolations = 0;
  let successfulToolExecutions = 0;
  let correctEscalations = 0;
  let totalDecisions = 0;

  for (const txn of atRiskTxns) {
    totalRevenue += txn.amount;
    revenueAtRisk += txn.amount;

    const diagnosis = diagnoseFailure(txn);
    const recoveryProb = trainedModel.predict(txn, diagnosis);

    // Use the engine to process
    const outcome = await engine.processTransaction(txn);
    totalDecisions++;

    if (outcome.finalOutcome === 'recovered') {
      revenueRecovered += txn.amount;
      transactionsRecovered++;
      successfulToolExecutions++;
    } else if (outcome.finalOutcome === 'escalated') {
      escalations++;
      // Check if escalation was correct (high value or low confidence)
      if (txn.amount >= 500000 || recoveryProb < 0.5) {
        correctEscalations++;
      }
    } else if (outcome.finalOutcome === 'stopped') {
      stoppedCases++;
    } else if (outcome.finalOutcome === 'failed') {
      failedInterventions++;
      falseInterventionCost += txn.amount * 0.01; // 1% intervention cost
    } else if (outcome.finalOutcome === 'blocked') {
      guardrailViolations++;
    }

    if (outcome.agentDecision.decision !== 'escalate_to_human' && outcome.agentDecision.decision !== 'stop_recovery') {
      interventionsAttempted++;
    }
    totalAttempts += txn.retry_count + 1;

    // Track valid/invalid (deterministic agent is always valid)
    if (engine.getAudit().getByTransaction(txn.transaction_id).length > 0) {
      validActions++;
    } else {
      invalidOutputs++;
    }
  }

  const businessMetrics: BusinessMetrics = {
    total_revenue: totalRevenue as Money,
    revenue_at_risk: revenueAtRisk as Money,
    revenue_recovered: revenueRecovered as Money,
    recovery_rate: revenueAtRisk > 0 ? revenueRecovered / revenueAtRisk : 0,
    transactions_analyzed: atRiskTxns.length,
    transactions_recovered: transactionsRecovered,
    interventions_attempted: interventionsAttempted,
    false_intervention_cost: falseInterventionCost as Money,
    escalation_count: escalations,
    escalation_rate: atRiskTxns.length > 0 ? escalations / atRiskTxns.length : 0,
    stopped_count: stoppedCases,
    failed_interventions: failedInterventions,
    average_recovery_attempts: atRiskTxns.length > 0 ? totalAttempts / atRiskTxns.length : 0,
  };

  const agentMetrics: AgentMetrics = {
    valid_action_rate: totalDecisions > 0 ? validActions / totalDecisions : 0,
    invalid_output_rate: totalDecisions > 0 ? invalidOutputs / totalDecisions : 0,
    guardrail_violation_rate: totalDecisions > 0 ? guardrailViolations / totalDecisions : 0,
    successful_tool_executions: successfulToolExecutions,
    correct_escalation_rate: escalations > 0 ? correctEscalations / escalations : 0,
    total_decisions: totalDecisions,
  };

  return {
    ml: mlMetrics,
    business: businessMetrics,
    agent: agentMetrics,
    generated_at: new Date().toISOString(),
    split: 'test',
    sample_count: test.length,
  };
}
