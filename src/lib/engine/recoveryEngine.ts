/**
 * Recovery Engine — orchestrates the full recovery workflow.
 *
 * Transaction → Detection → Diagnosis → ML Prediction → Agent Decision
 * → Policy Engine → Simulator → Audit → Outcome
 */

import type {
  Transaction,
  AgentContext,
  AgentDecision,
  PolicyEvaluation,
  SimulatorResult,
  Money,
  RecoveryAction,
} from '@/types';
import { diagnoseFailure } from '@/lib/detection/diagnosis';
import { RecoveryProbabilityModel } from '@/lib/ml/recoveryModel';
import { RecoveryAgent, type LLMProvider } from '@/lib/agent/recoveryAgent';
import { PolicyEngine, deterministicFallback } from '@/lib/policy/policyEngine';
import { PaymentSimulator } from '@/lib/simulator/paymentSimulator';
import { AuditTrail } from '@/lib/audit/auditTrail';
import { HumanReviewQueue } from '@/lib/audit/humanReview';
import { SeededRandom } from '@/lib/random';

export interface RecoveryOutcome {
  transaction: Transaction;
  diagnosis: ReturnType<typeof diagnoseFailure>;
  recoveryProbability: number;
  agentDecision: AgentDecision;
  policyEvaluation: PolicyEvaluation;
  simulatorResult: SimulatorResult | null;
  finalOutcome: 'recovered' | 'failed' | 'escalated' | 'stopped' | 'blocked';
  recoveredAmount: Money;
}

export class RecoveryEngine {
  private model: RecoveryProbabilityModel;
  private agent: RecoveryAgent;
  private policy: PolicyEngine;
  private simulator: PaymentSimulator;
  private audit: AuditTrail;
  private reviewQueue: HumanReviewQueue;
  private rng: SeededRandom;

  constructor(
    model: RecoveryProbabilityModel,
    agent: RecoveryAgent,
    policy: PolicyEngine,
    simulator: PaymentSimulator,
    audit: AuditTrail,
    reviewQueue: HumanReviewQueue,
    seed: number,
  ) {
    this.model = model;
    this.agent = agent;
    this.policy = policy;
    this.simulator = simulator;
    this.audit = audit;
    this.reviewQueue = reviewQueue;
    this.rng = new SeededRandom(seed);
  }

  getAudit(): AuditTrail {
    return this.audit;
  }

  getReviewQueue(): HumanReviewQueue {
    return this.reviewQueue;
  }

  getSimulator(): PaymentSimulator {
    return this.simulator;
  }

  getPolicy(): PolicyEngine {
    return this.policy;
  }

  /**
   * Process a single transaction through the full recovery pipeline.
   */
  async processTransaction(txn: Transaction): Promise<RecoveryOutcome> {
    // 1. Diagnose failure
    const diagnosis = diagnoseFailure(txn);

    // 2. Predict recovery probability
    const recoveryProbability = this.model.predict(txn, diagnosis);

    // 3. Build agent context
    const context: AgentContext = {
      transaction: txn,
      diagnosis,
      recovery_probability: recoveryProbability,
      retry_count: txn.retry_count,
      last_action_timestamp: null,
      is_in_cooldown: false,
    };

    // 4. Agent decision
    const agentDecision = await this.agent.decide(context);

    this.audit.logAgentDecision(
      txn.transaction_id,
      agentDecision.decision,
      agentDecision.reason,
      this.agent.modelVersion,
      agentDecision.confidence,
    );

    // 5. Policy evaluation
    const policyResult = this.policy.evaluate(agentDecision, context);
    const idempotencyKey = this.policy.idempotencyKey(txn.transaction_id, txn.retry_count + 1);

    const policyEvaluation: PolicyEvaluation = {
      decision: agentDecision,
      result: policyResult,
      idempotency_key: idempotencyKey,
      timestamp: new Date().toISOString(),
    };

    this.audit.logPolicyResult(
      txn.transaction_id,
      policyEvaluation,
      policyResult.approved ? null : policyResult.violation,
      policyResult.approved,
      policyResult.reason,
      this.agent.modelVersion,
      agentDecision.confidence,
    );

    // 6. Execute or escalate
    if (!policyResult.approved) {
      // Check if it should be escalated
      if (
        policyResult.violation === 'high_value_requires_human' ||
        policyResult.violation === 'low_confidence' ||
        policyResult.violation === 'max_retries_exceeded'
      ) {
        this.reviewQueue.enqueue(
          txn.transaction_id,
          txn.amount,
          policyResult.reason,
          agentDecision,
          policyEvaluation,
        );
        this.audit.logFinalOutcome(txn.transaction_id, 'escalated');
        return {
          transaction: txn,
          diagnosis,
          recoveryProbability,
          agentDecision,
          policyEvaluation,
          simulatorResult: null,
          finalOutcome: 'escalated',
          recoveredAmount: 0,
        };
      }

      this.audit.logFinalOutcome(txn.transaction_id, `blocked: ${policyResult.violation}`);
      return {
        transaction: txn,
        diagnosis,
        recoveryProbability,
        agentDecision,
        policyEvaluation,
        simulatorResult: null,
        finalOutcome: 'blocked',
        recoveredAmount: 0,
      };
    }

    // 7. Execute the approved action
    const result = await this.executeAction(txn, agentDecision.decision, idempotencyKey);

    // 8. Handle timeout / state verification
    if (result && this.policy.requiresStateVerification(result.outcome)) {
      this.audit.logStateCheck(txn.transaction_id, 'unknown');
      const state = this.simulator.verifyState(txn.transaction_id);

      if (state === 'succeeded') {
        this.audit.logStateCheck(txn.transaction_id, 'succeeded');
        this.audit.logFinalOutcome(txn.transaction_id, 'recovered');
        return {
          transaction: txn,
          diagnosis,
          recoveryProbability,
          agentDecision,
          policyEvaluation,
          simulatorResult: result,
          finalOutcome: 'recovered',
          recoveredAmount: txn.amount,
        };
      }

      if (state === null || state === 'pending') {
        // Cannot verify — escalate
        this.audit.logStateCheck(txn.transaction_id, 'unverifiable');
        this.reviewQueue.enqueue(
          txn.transaction_id,
          txn.amount,
          'Transaction state could not be verified after timeout',
          agentDecision,
          policyEvaluation,
        );
        this.audit.logFinalOutcome(txn.transaction_id, 'escalated');
        return {
          transaction: txn,
          diagnosis,
          recoveryProbability,
          agentDecision,
          policyEvaluation,
          simulatorResult: result,
          finalOutcome: 'escalated',
          recoveredAmount: 0,
        };
      }
    }

    // 9. Determine final outcome
    if (result && result.outcome === 'success') {
      this.audit.logFinalOutcome(txn.transaction_id, 'recovered');
      return {
        transaction: txn,
        diagnosis,
        recoveryProbability,
        agentDecision,
        policyEvaluation,
        simulatorResult: result,
        finalOutcome: 'recovered',
        recoveredAmount: txn.amount,
      };
    }

    if (agentDecision.decision === 'stop_recovery') {
      this.audit.logFinalOutcome(txn.transaction_id, 'stopped');
      return {
        transaction: txn,
        diagnosis,
        recoveryProbability,
        agentDecision,
        policyEvaluation,
        simulatorResult: result,
        finalOutcome: 'stopped',
        recoveredAmount: 0,
      };
    }

    this.audit.logFinalOutcome(txn.transaction_id, 'failed');
    return {
      transaction: txn,
      diagnosis,
      recoveryProbability,
      agentDecision,
      policyEvaluation,
      simulatorResult: result,
      finalOutcome: 'failed',
      recoveredAmount: 0,
    };
  }

  private async executeAction(
    txn: Transaction,
    action: RecoveryAction,
    idempotencyKey: string,
  ): Promise<SimulatorResult | null> {
    // Non-money actions don't go through the simulator
    if (action === 'send_reminder' || action === 'send_payment_link' || action === 'suggest_alternate_method') {
      this.audit.logToolCall(txn.transaction_id, action, idempotencyKey);
      this.policy.recordAction(txn.transaction_id, action, txn.retry_count + 1);

      // Simulate whether the customer re-engagement succeeds
      const reengaged = this.rng.nextBool(0.4);
      const result: SimulatorResult = {
        outcome: reengaged ? 'success' : 'permanent_failure',
        transaction_id: txn.transaction_id,
        idempotency_key: idempotencyKey,
        amount: txn.amount,
        timestamp: new Date().toISOString(),
        latency_ms: 100,
        message: reengaged ? 'Customer re-engaged successfully' : 'Customer did not re-engage',
        new_state: reengaged ? 'succeeded' : 'failed',
      };
      this.audit.logToolResult(txn.transaction_id, result);
      return result;
    }

    if (action === 'escalate_to_human' || action === 'stop_recovery') {
      this.audit.logToolCall(txn.transaction_id, action, idempotencyKey);
      return null;
    }

    // Money actions: retry_payment, schedule_retry
    this.audit.logToolCall(txn.transaction_id, action, idempotencyKey);
    this.policy.recordAction(txn.transaction_id, action, txn.retry_count + 1);

    const result = this.simulator.processPayment(txn.transaction_id, txn.amount, idempotencyKey);
    this.audit.logToolResult(txn.transaction_id, result);
    return result;
  }
}

/**
 * Factory: create a fully wired recovery engine with sensible defaults.
 */
export function createRecoveryEngine(
  seed: number,
  llmProvider: LLMProvider | null = null,
): RecoveryEngine {
  const model = new RecoveryProbabilityModel();
  const agent = new RecoveryAgent(llmProvider);
  const policy = new PolicyEngine();
  const simulator = new PaymentSimulator();
  const audit = new AuditTrail();
  const reviewQueue = new HumanReviewQueue();

  return new RecoveryEngine(model, agent, policy, simulator, audit, reviewQueue, seed);
}
