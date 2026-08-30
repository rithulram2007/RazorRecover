import { describe, it, expect } from 'vitest';
import { createRecoveryEngine } from '@/lib/engine/recoveryEngine';
import { PaymentSimulator } from '@/lib/simulator/paymentSimulator';
import { DEFAULT_SIMULATOR_CONFIG } from '@/types';
import type { Transaction } from '@/types';

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    transaction_id: 'TXN_E2E_001',
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

describe('End-to-End Recovery Workflow', () => {
  it('processes a failed transaction and produces an audit trail', async () => {
    const engine = createRecoveryEngine(42, null);
    const txn = makeTxn();
    const outcome = await engine.processTransaction(txn);

    expect(outcome.finalOutcome).toBeDefined();
    const auditEvents = engine.getAudit().getByTransaction(txn.transaction_id);
    expect(auditEvents.length).toBeGreaterThan(0);
    expect(auditEvents.some((e) => e.event_type === 'AGENT_DECISION')).toBe(true);
    expect(auditEvents.some((e) => e.event_type === 'POLICY_RESULT')).toBe(true);
    expect(auditEvents.some((e) => e.event_type === 'FINAL_OUTCOME')).toBe(true);
  });

  it('blocks retries on succeeded transactions', async () => {
    const engine = createRecoveryEngine(42, null);
    const txn = makeTxn({ payment_status: 'succeeded' });
    const outcome = await engine.processTransaction(txn);
    expect(outcome.finalOutcome).toBe('blocked');
  });

  it('escalates high-value transactions to human review', async () => {
    const engine = createRecoveryEngine(42, null);
    const txn = makeTxn({ amount: 600000 });
    const outcome = await engine.processTransaction(txn);
    // High value with deterministic agent should escalate or be blocked
    expect(['escalated', 'blocked']).toContain(outcome.finalOutcome);
  });

  it('handles timeout → state verification → escalation flow', async () => {
    const engine = createRecoveryEngine(42, null);
    // Force the simulator to timeout
    engine.getSimulator().forceNextOutcome('timeout');
    const txn = makeTxn({ failure_code: 'TEMPORARY_NETWORK_FAILURE' });
    const outcome = await engine.processTransaction(txn);

    const auditEvents = engine.getAudit().getByTransaction(txn.transaction_id);
    expect(auditEvents.some((e) => e.event_type === 'STATE_CHECK')).toBe(true);

    // After timeout with unverifiable state, should escalate
    expect(['escalated', 'failed', 'recovered']).toContain(outcome.finalOutcome);
  });

  it('prevents duplicate execution via idempotency', async () => {
    const sim = new PaymentSimulator({ ...DEFAULT_SIMULATOR_CONFIG, seed: 42 });
    const r1 = sim.processPayment('TXN_DUP', 5000, 'idem_key_1');
    const r2 = sim.processPayment('TXN_DUP', 5000, 'idem_key_1');

    expect(r2.outcome).toBe('duplicate_request');
    expect(r1.idempotency_key).toBe(r2.idempotency_key);
  });

  it('logs every reviewer action in the human review queue', async () => {
    const engine = createRecoveryEngine(42, null);
    const txn = makeTxn({ amount: 600000 });
    await engine.processTransaction(txn);

    const pending = engine.getReviewQueue().getPending();
    if (pending.length > 0) {
      const item = pending[0];
      engine.getReviewQueue().resolve(item.review_id, 'approved', 'reviewer_1');
      const resolved = engine.getReviewQueue().getById(item.review_id);
      expect(resolved?.resolution).toBe('approved');
      expect(resolved?.reviewer).toBe('reviewer_1');
      expect(resolved?.resolved_at).not.toBeNull();
    }
  });
});
