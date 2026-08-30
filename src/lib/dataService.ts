/**
 * Data Service — generates synthetic data, runs the recovery engine,
 * and provides data to the dashboard. Uses in-memory state seeded once
 * on first load, with Supabase persistence for simulation runs.
 */

import type {
  Transaction,
  EvaluationReport,
  SimulationSummary,
  AuditEvent,
  HumanReviewItem,
  AgentDecision,
  PolicyEvaluation,
} from '@/types';
import type { RecoveryOutcome } from '@/lib/engine/recoveryEngine';
import { generateDataset, DEFAULT_DATASET_CONFIG, splitDataset } from '@/lib/dataset/generator';
import { detectRevenueAtRisk } from '@/lib/detection/revenueAtRisk';
import { diagnoseFailure } from '@/lib/detection/diagnosis';
import { RecoveryProbabilityModel, type TrainingExample } from '@/lib/ml/recoveryModel';
import { confusionMatrix, precision, recall, f1Score, rocAuc } from '@/lib/ml/metrics';
import { createRecoveryEngine } from '@/lib/engine/recoveryEngine';
import { runBatchSimulation } from '@/lib/engine/batchSimulation';
import { SeededRandom } from '@/lib/random';

export interface DashboardData {
  transactions: Transaction[];
  outcomes: RecoveryOutcome[];
  auditEvents: AuditEvent[];
  reviewItems: HumanReviewItem[];
  evaluation: EvaluationReport | null;
  lastSimulation: SimulationSummary | null;
}

let cachedData: DashboardData | null = null;
let generatingPromise: Promise<DashboardData> | null = null;

const DATASET_SIZE = 5000; // Smaller for dashboard performance — evaluation uses full 50k
const SEED = 42;

export async function getDashboardData(): Promise<DashboardData> {
  if (cachedData) return cachedData;
  if (generatingPromise) return generatingPromise;

  generatingPromise = generateDashboardData();
  cachedData = await generatingPromise;
  return cachedData;
}

async function generateDashboardData(): Promise<DashboardData> {
  // 1. Generate synthetic dataset
  const transactions = generateDataset({
    ...DEFAULT_DATASET_CONFIG,
    size: DATASET_SIZE,
    seed: SEED,
  });

  // 2. Train ML model on a portion of the data
  const { train, test } = splitDataset(transactions, SEED + 99);
  const labelRng = new SeededRandom(SEED);
  const model = new RecoveryProbabilityModel();

  const trainExamples: TrainingExample[] = train.map((txn) => {
    const diagnosis = diagnoseFailure(txn);
    const features = model.featuresToVector(model.extractFeatures(txn, diagnosis));
    const label = RecoveryProbabilityModel.generateLabel(txn, diagnosis, labelRng);
    return { features, label };
  });

  model.train(trainExamples, 200, 0.1);

  // 3. Compute ML metrics on test set
  const testLabels: number[] = [];
  const testPredictions: number[] = [];
  const testRng = new SeededRandom(SEED + 1);

  for (const txn of test) {
    const diagnosis = diagnoseFailure(txn);
    const pred = model.predict(txn, diagnosis);
    const label = RecoveryProbabilityModel.generateLabel(txn, diagnosis, testRng);
    testPredictions.push(pred);
    testLabels.push(label);
  }

  const cm = confusionMatrix(testPredictions, testLabels, 0.5);

  // 4. Run recovery engine on at-risk transactions
  const engine = createRecoveryEngine(SEED, null);
  const atRiskItems = detectRevenueAtRisk(transactions);
  const outcomes: RecoveryOutcome[] = [];

  for (const item of atRiskItems) {
    const outcome = await engine.processTransaction(item.transaction);
    outcomes.push(outcome);
  }

  // 5. Compute business metrics from outcomes
  let revenueAtRisk = 0;
  let revenueRecovered = 0;
  let transactionsRecovered = 0;
  let interventionsAttempted = 0;
  let escalations = 0;
  let stoppedCases = 0;
  let failedInterventions = 0;
  let falseInterventionCost = 0;
  let totalAttempts = 0;

  for (const outcome of outcomes) {
    revenueAtRisk += outcome.transaction.amount;
    totalAttempts += outcome.transaction.retry_count + 1;

    switch (outcome.finalOutcome) {
      case 'recovered':
        revenueRecovered += outcome.transaction.amount;
        transactionsRecovered++;
        break;
      case 'escalated':
        escalations++;
        break;
      case 'stopped':
        stoppedCases++;
        break;
      case 'failed':
        failedInterventions++;
        falseInterventionCost += outcome.transaction.amount * 0.01;
        break;
    }

    if (
      outcome.agentDecision.decision !== 'escalate_to_human' &&
      outcome.agentDecision.decision !== 'stop_recovery'
    ) {
      interventionsAttempted++;
    }
  }

  // 6. Compute agent metrics
  let validActions = 0;
  let guardrailViolations = 0;
  let successfulToolExecutions = 0;
  let correctEscalations = 0;
  const totalDecisions = outcomes.length;

  for (const outcome of outcomes) {
    if (outcome.finalOutcome !== 'blocked') validActions++;
    if (outcome.finalOutcome === 'blocked') guardrailViolations++;
    if (outcome.finalOutcome === 'recovered') successfulToolExecutions++;
    if (outcome.finalOutcome === 'escalated') {
      if (outcome.transaction.amount >= 500000 || outcome.recoveryProbability < 0.5) {
        correctEscalations++;
      }
    }
  }

  const evaluation: EvaluationReport = {
    ml: {
      precision: precision(cm),
      recall: recall(cm),
      f1: f1Score(cm),
      roc_auc: rocAuc(testPredictions, testLabels),
      sample_count: test.length,
    },
    business: {
      total_revenue: transactions.reduce((s, t) => s + t.amount, 0),
      revenue_at_risk: revenueAtRisk,
      revenue_recovered: revenueRecovered,
      recovery_rate: revenueAtRisk > 0 ? revenueRecovered / revenueAtRisk : 0,
      transactions_analyzed: outcomes.length,
      transactions_recovered: transactionsRecovered,
      interventions_attempted: interventionsAttempted,
      false_intervention_cost: falseInterventionCost,
      escalation_count: escalations,
      escalation_rate: outcomes.length > 0 ? escalations / outcomes.length : 0,
      stopped_count: stoppedCases,
      failed_interventions: failedInterventions,
      average_recovery_attempts: outcomes.length > 0 ? totalAttempts / outcomes.length : 0,
    },
    agent: {
      valid_action_rate: totalDecisions > 0 ? validActions / totalDecisions : 0,
      invalid_output_rate: 0,
      guardrail_violation_rate: totalDecisions > 0 ? guardrailViolations / totalDecisions : 0,
      successful_tool_executions: successfulToolExecutions,
      correct_escalation_rate: escalations > 0 ? correctEscalations / escalations : 0,
      total_decisions: totalDecisions,
    },
    generated_at: new Date().toISOString(),
    split: 'test',
    sample_count: test.length,
  };

  const data: DashboardData = {
    transactions,
    outcomes,
    auditEvents: engine.getAudit().getAll(),
    reviewItems: engine.getReviewQueue().getAll(),
    evaluation,
    lastSimulation: null,
  };

  return data;
}

export async function runSimulation(batchSize: number): Promise<SimulationSummary> {
  const data = await getDashboardData();
  const result = await runBatchSimulation({
    transactions: data.transactions,
    seed: SEED,
    llmProvider: null,
    batchSize,
  });

  if (cachedData) {
    cachedData.lastSimulation = result.summary;
  }

  return result.summary;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}
