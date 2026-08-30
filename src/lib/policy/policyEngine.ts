/**
 * Deterministic Policy & Guardrail Engine.
 *
 * The AI agent's output is a RECOMMENDATION. This engine approves or rejects
 * every action before execution. Money, retries, cooldowns, idempotency —
 * all enforced deterministically.
 */

import type {
  AgentDecision,
  AgentContext,
  PolicyConfig,
  PolicyResult,
  PolicyViolation,
  RecoveryAction,
  Transaction,
} from '@/types';
import { DEFAULT_POLICY_CONFIG } from '@/types';

export class PolicyEngine {
  private config: PolicyConfig;
  private actionLog: Map<string, Set<string>> = new Map(); // txn_id → set of actions already attempted
  private communicationCounts: Map<string, number> = new Map(); // txn_id → comm count

  constructor(config: PolicyConfig = DEFAULT_POLICY_CONFIG) {
    this.config = config;
  }

  getConfig(): PolicyConfig {
    return { ...this.config };
  }

  evaluate(decision: AgentDecision, context: AgentContext): PolicyResult {
    const txn = context.transaction;

    // 1. Terminal-state protection
    if (this.config.terminal_states.includes(txn.payment_status)) {
      return this.reject('terminal_state', `Transaction is in terminal state: ${txn.payment_status}`);
    }

    // 2. Max retries exceeded
    if (
      (decision.decision === 'retry_payment' || decision.decision === 'schedule_retry') &&
      txn.retry_count >= this.config.max_retry_count
    ) {
      return this.reject('max_retries_exceeded', `Retry count ${txn.retry_count} >= max ${this.config.max_retry_count}`);
    }

    // 3. Cooldown check
    if (context.is_in_cooldown && decision.decision !== 'stop_recovery' && decision.decision !== 'escalate_to_human') {
      return this.reject('in_cooldown', 'Transaction is in cooldown period');
    }

    // 4. High-value requires human approval
    if (
      txn.amount >= this.config.high_value_threshold &&
      decision.decision !== 'escalate_to_human' &&
      decision.decision !== 'stop_recovery' &&
      decision.decision !== 'send_reminder' &&
      decision.decision !== 'send_payment_link'
    ) {
      return this.reject('high_value_requires_human', `Amount ${txn.amount} >= high-value threshold ${this.config.high_value_threshold}`);
    }

    // 5. Low confidence → escalate
    if (
      decision.confidence < this.config.escalation_confidence_threshold &&
      decision.decision !== 'escalate_to_human' &&
      decision.decision !== 'stop_recovery'
    ) {
      return this.reject('low_confidence', `Confidence ${decision.confidence.toFixed(2)} < threshold ${this.config.escalation_confidence_threshold}`);
    }

    // 6. Communication limit
    if (
      (decision.decision === 'send_reminder' || decision.decision === 'send_payment_link') &&
      (this.communicationCounts.get(txn.transaction_id) ?? 0) >= this.config.max_communication_attempts
    ) {
      return this.reject('max_communications_exceeded', `Communication attempts >= max ${this.config.max_communication_attempts}`);
    }

    // 7. Duplicate-action protection
    const actionKey = `${decision.decision}_${txn.retry_count + 1}`;
    const log = this.actionLog.get(txn.transaction_id);
    if (log && log.has(actionKey)) {
      return this.reject('duplicate_action', `Action ${actionKey} already attempted for this transaction`);
    }

    return { approved: true, reason: 'All guardrails passed' };
  }

  /**
   * Record that an action was attempted (for duplicate protection).
   */
  recordAction(transactionId: string, action: RecoveryAction, attemptNumber: number): void {
    const key = `${action}_${attemptNumber}`;
    if (!this.actionLog.has(transactionId)) {
      this.actionLog.set(transactionId, new Set());
    }
    this.actionLog.get(transactionId)!.add(key);

    if (action === 'send_reminder' || action === 'send_payment_link') {
      this.communicationCounts.set(transactionId, (this.communicationCounts.get(transactionId) ?? 0) + 1);
    }
  }

  /**
   * Generate idempotency key for a money-related action.
   */
  idempotencyKey(transactionId: string, attemptNumber: number): string {
    return `txn_${transactionId}_attempt_${attemptNumber}`;
  }

  /**
   * Check if a transaction requires state verification (e.g., after timeout).
   */
  requiresStateVerification(outcome: string): boolean {
    return outcome === 'timeout' || outcome === 'network_error';
  }

  private reject(violation: PolicyViolation, reason: string): PolicyResult {
    return { approved: false, reason, violation };
  }
}

/**
 * Deterministic fallback agent — used when the LLM output is invalid
 * or when no LLM is configured. Produces a safe default decision.
 */
export function deterministicFallback(context: AgentContext): AgentDecision {
  const { transaction: txn, diagnosis, recovery_probability } = context;

  if (!diagnosis.is_recoverable) {
    return {
      decision: 'stop_recovery',
      reason: `Failure category ${diagnosis.category} is not recoverable`,
      confidence: 0.9,
      expected_recovery: 0,
      risk_level: 'low',
      next_action: 'No further action',
      requires_human: false,
    };
  }

  if (txn.retry_count >= 3) {
    return {
      decision: 'escalate_to_human',
      reason: `Retry count ${txn.retry_count} exceeded — escalating to human`,
      confidence: 0.7,
      expected_recovery: recovery_probability * 0.3,
      risk_level: 'medium',
      next_action: 'Human review required',
      requires_human: true,
    };
  }

  if (recovery_probability < 0.4) {
    return {
      decision: 'escalate_to_human',
      reason: `Low recovery probability ${(recovery_probability * 100).toFixed(0)}%`,
      confidence: 0.6,
      expected_recovery: recovery_probability * 0.5,
      risk_level: 'medium',
      next_action: 'Human review required',
      requires_human: true,
    };
  }

  // Category-based default
  const actionMap: Record<string, RecoveryAction> = {
    temporary_network_failure: 'retry_payment',
    insufficient_funds: 'send_reminder',
    authentication_failure: 'retry_payment',
    checkout_abandonment: 'send_payment_link',
    expired_mandate: 'send_payment_link',
    bank_decline: 'suggest_alternate_method',
    repeated_failure: 'escalate_to_human',
    unknown: 'escalate_to_human',
  };

  const decision = actionMap[diagnosis.category] ?? 'escalate_to_human';

  return {
    decision,
    reason: `Deterministic fallback: ${diagnosis.reason}`,
    confidence: 0.65,
    expected_recovery: recovery_probability,
    risk_level: txn.amount >= 500000 ? 'high' : 'medium',
    next_action: decision === 'escalate_to_human' ? 'Human review' : `Execute ${decision}`,
    requires_human: decision === 'escalate_to_human',
  };
}
