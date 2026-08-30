/**
 * Batch Recovery Simulation Runner.
 *
 * Runs the full recovery pipeline on a batch of at-risk transactions
 * and produces a summary with real numbers from the simulation.
 */

import type { Transaction, SimulationSummary, Money } from '@/types';
import { createRecoveryEngine, type RecoveryOutcome } from '@/lib/engine/recoveryEngine';
import { detectRevenueAtRisk } from '@/lib/detection/revenueAtRisk';
import type { LLMProvider } from '@/lib/agent/recoveryAgent';

export interface BatchSimulationConfig {
  transactions: Transaction[];
  seed: number;
  llmProvider: LLMProvider | null;
  batchSize?: number;
}

export async function runBatchSimulation(config: BatchSimulationConfig): Promise<{
  summary: SimulationSummary;
  outcomes: RecoveryOutcome[];
}> {
  const { transactions, seed, llmProvider, batchSize } = config;
  const limit = batchSize ?? transactions.length;

  const startTime = Date.now();
  const engine = createRecoveryEngine(seed, llmProvider);

  // Detect revenue at risk
  const atRiskItems = detectRevenueAtRisk(transactions).slice(0, limit);
  const atRiskTxns = atRiskItems.map((item) => item.transaction);

  let revenueAtRisk = 0;
  let interventionsAttempted = 0;
  let successfulRecoveries = 0;
  let revenueRecovered = 0;
  let escalations = 0;
  let stoppedCases = 0;
  let failedInterventions = 0;

  const outcomes = [];

  for (const txn of atRiskTxns) {
    revenueAtRisk += txn.amount;
    const outcome = await engine.processTransaction(txn);
    outcomes.push(outcome);

    switch (outcome.finalOutcome) {
      case 'recovered':
        successfulRecoveries++;
        revenueRecovered += txn.amount;
        break;
      case 'escalated':
        escalations++;
        break;
      case 'stopped':
        stoppedCases++;
        break;
      case 'failed':
        failedInterventions++;
        break;
    }

    if (outcome.agentDecision.decision !== 'escalate_to_human' && outcome.agentDecision.decision !== 'stop_recovery') {
      interventionsAttempted++;
    }
  }

  const durationMs = Date.now() - startTime;

  const summary: SimulationSummary = {
    transactions_analyzed: atRiskTxns.length,
    revenue_at_risk: revenueAtRisk as Money,
    interventions_attempted: interventionsAttempted,
    successful_recoveries: successfulRecoveries,
    revenue_recovered: revenueRecovered as Money,
    recovery_percentage: revenueAtRisk > 0 ? (revenueRecovered / revenueAtRisk) * 100 : 0,
    escalations,
    stopped_cases: stoppedCases,
    failed_interventions: failedInterventions,
    duration_ms: durationMs,
    seed,
  };

  return { summary, outcomes };
}
