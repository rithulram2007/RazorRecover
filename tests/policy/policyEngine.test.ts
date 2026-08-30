import { describe, it, expect } from 'vitest';
import { PolicyEngine, deterministicFallback } from '@/lib/policy/policyEngine';
import { DEFAULT_POLICY_CONFIG } from '@/types';
import type { AgentDecision, AgentContext, Transaction } from '@/types';

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    transaction_id: 'TXN_TEST',
    customer_id: 'CUST_001',
    merchant_id: 'MERCH_001',
    amount: 10000,
    currency: 'INR',
    timestamp: new Date().toISOString(),
    payment_method: 'upi',
    payment_status: 'failed',
    failure_code: 'TEMPORARY_NETWORK_FAILURE',
    failure_reason: 'timeout',
    retry_count: 0,
    previous_failures: [],
    customer_payment_history: [],
    customer_age_days: 100,
    subscription_status: 'none',
    subscription_amount: 0,
    days_since_last_payment: 5,
    checkout_duration: 60,
    device_type: 'mobile',
    platform: 'android',
    bank_type: 'private',
    mandate_status: 'none',
    refund_status: 'none',
    is_synthetic: true,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    decision: 'retry_payment',
    reason: 'Temporary failure — retrying',
    confidence: 0.8,
    expected_recovery: 0.7,
    risk_level: 'low',
    next_action: 'Execute retry',
    requires_human: false,
    ...overrides,
  };
}

function makeContext(txn: Transaction, overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    transaction: txn,
    diagnosis: {
      category: 'temporary_network_failure',
      is_recoverable: true,
      reason: 'transient',
      recommended_approach: 'retry',
      source: 'rule',
    },
    recovery_probability: 0.7,
    retry_count: 0,
    last_action_timestamp: null,
    is_in_cooldown: false,
    ...overrides,
  };
}

describe('Policy Engine', () => {
  it('approves a valid retry for a failed transaction', () => {
    const engine = new PolicyEngine();
    const txn = makeTxn();
    const decision = makeDecision();
    const context = makeContext(txn);

    const result = engine.evaluate(decision, context);
    expect(result.approved).toBe(true);
  });

  it('rejects retries on terminal states (succeeded)', () => {
    const engine = new PolicyEngine();
    const txn = makeTxn({ payment_status: 'succeeded' });
    const decision = makeDecision();
    const context = makeContext(txn);

    const result = engine.evaluate(decision, context);
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.violation).toBe('terminal_state');
  });

  it('rejects retries when max retry count is exceeded', () => {
    const engine = new PolicyEngine();
    const txn = makeTxn({ retry_count: 5 });
    const decision = makeDecision();
    const context = makeContext(txn, { retry_count: 5 });

    const result = engine.evaluate(decision, context);
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.violation).toBe('max_retries_exceeded');
  });

  it('rejects actions during cooldown', () => {
    const engine = new PolicyEngine();
    const txn = makeTxn();
    const decision = makeDecision();
    const context = makeContext(txn, { is_in_cooldown: true });

    const result = engine.evaluate(decision, context);
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.violation).toBe('in_cooldown');
  });

  it('rejects low-confidence decisions that are not escalations', () => {
    const engine = new PolicyEngine();
    const txn = makeTxn();
    const decision = makeDecision({ confidence: 0.3 });
    const context = makeContext(txn);

    const result = engine.evaluate(decision, context);
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.violation).toBe('low_confidence');
  });

  it('requires human approval for high-value retries', () => {
    const engine = new PolicyEngine();
    const txn = makeTxn({ amount: 600000 }); // above 500000 threshold
    const decision = makeDecision({ confidence: 0.9 });
    const context = makeContext(txn);

    const result = engine.evaluate(decision, context);
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.violation).toBe('high_value_requires_human');
  });

  it('allows reminders for high-value transactions (no charge)', () => {
    const engine = new PolicyEngine();
    const txn = makeTxn({ amount: 600000 });
    const decision = makeDecision({ decision: 'send_reminder', confidence: 0.9 });
    const context = makeContext(txn);

    const result = engine.evaluate(decision, context);
    expect(result.approved).toBe(true);
  });

  it('allows stop_recovery and escalate_to_human even in cooldown', () => {
    const engine = new PolicyEngine();
    const txn = makeTxn();

    const stopDecision = makeDecision({ decision: 'stop_recovery' });
    const stopResult = engine.evaluate(stopDecision, makeContext(txn, { is_in_cooldown: true }));
    expect(stopResult.approved).toBe(true);

    const escalateDecision = makeDecision({ decision: 'escalate_to_human' });
    const escalateResult = engine.evaluate(escalateDecision, makeContext(txn, { is_in_cooldown: true }));
    expect(escalateResult.approved).toBe(true);
  });

  it('rejects duplicate actions for the same transaction and attempt', () => {
    const engine = new PolicyEngine();
    const txn = makeTxn();
    const decision = makeDecision();
    const context = makeContext(txn);

    engine.recordAction(txn.transaction_id, 'retry_payment', 1);
    const result = engine.evaluate(decision, context);
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.violation).toBe('duplicate_action');
  });

  it('generates deterministic idempotency keys', () => {
    const engine = new PolicyEngine();
    const key1 = engine.idempotencyKey('TXN_001', 1);
    const key2 = engine.idempotencyKey('TXN_001', 1);
    expect(key1).toBe('txn_TXN_001_attempt_1');
    expect(key1).toBe(key2);
  });

  it('deterministic fallback returns stop_recovery for non-recoverable failures', () => {
    const txn = makeTxn();
    const context = makeContext(txn, {
      diagnosis: {
        category: 'bank_decline',
        is_recoverable: false,
        reason: 'bank declined',
        recommended_approach: 'alternate method',
        source: 'rule',
      },
    });
    const decision = deterministicFallback(context);
    expect(decision.decision).toBe('stop_recovery');
  });

  it('deterministic fallback escalates when retry count is high', () => {
    const txn = makeTxn({ retry_count: 4 });
    const context = makeContext(txn, { retry_count: 4 });
    const decision = deterministicFallback(context);
    expect(decision.decision).toBe('escalate_to_human');
  });
});
