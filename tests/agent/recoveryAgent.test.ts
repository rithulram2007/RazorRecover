import { describe, it, expect } from 'vitest';
import { RecoveryAgent, type LLMProvider } from '@/lib/agent/recoveryAgent';
import type { AgentContext, AgentDecision, Transaction } from '@/types';

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

function makeContext(txn: Transaction): AgentContext {
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
  };
}

describe('Recovery Agent Output Validation', () => {
  it('validates a correct agent output', () => {
    const agent = new RecoveryAgent(null);
    const context = makeContext(makeTxn());
    const valid: AgentDecision = {
      decision: 'retry_payment',
      reason: 'Temporary failure',
      confidence: 0.8,
      expected_recovery: 0.7,
      risk_level: 'low',
      next_action: 'Execute retry',
      requires_human: false,
    };

    const result = agent.validate(valid, context);
    expect(result).not.toBeNull();
    expect(result?.decision).toBe('retry_payment');
  });

  it('rejects an invalid action not in the closed set', () => {
    const agent = new RecoveryAgent(null);
    const context = makeContext(makeTxn());
    const invalid = { ...makeContext(makeTxn()).transaction, decision: 'refund_payment' } as unknown as AgentDecision;

    const result = agent.validate({ ...invalid, decision: 'refund_payment', reason: 'test', confidence: 0.5, expected_recovery: 0.5, risk_level: 'low', next_action: 'x', requires_human: false }, context);
    expect(result).toBeNull();
  });

  it('rejects confidence out of range', () => {
    const agent = new RecoveryAgent(null);
    const context = makeContext(makeTxn());
    const invalid = {
      decision: 'retry_payment',
      reason: 'test',
      confidence: 1.5,
      expected_recovery: 0.5,
      risk_level: 'low',
      next_action: 'x',
      requires_human: false,
    };
    expect(agent.validate(invalid, context)).toBeNull();
  });

  it('rejects empty reason', () => {
    const agent = new RecoveryAgent(null);
    const context = makeContext(makeTxn());
    const invalid = {
      decision: 'retry_payment',
      reason: '',
      confidence: 0.8,
      expected_recovery: 0.5,
      risk_level: 'low',
      next_action: 'x',
      requires_human: false,
    };
    expect(agent.validate(invalid, context)).toBeNull();
  });

  it('auto-corrects high-risk decisions to require human', () => {
    const agent = new RecoveryAgent(null);
    const context = makeContext(makeTxn());
    const highRisk = {
      decision: 'retry_payment',
      reason: 'test',
      confidence: 0.8,
      expected_recovery: 0.5,
      risk_level: 'high',
      next_action: 'x',
      requires_human: false,
    };
    const result = agent.validate(highRisk, context);
    expect(result).not.toBeNull();
    expect(result?.requires_human).toBe(true);
  });

  it('falls back to deterministic when no LLM provider is configured', async () => {
    const agent = new RecoveryAgent(null);
    const context = makeContext(makeTxn());
    const decision = await agent.decide(context);
    expect(decision.decision).toBe('retry_payment');
  });

  it('falls back to deterministic when LLM returns invalid output', async () => {
    const badProvider: LLMProvider = {
      async generateDecision() {
        return { decision: 'invalid_action', reason: 'x', confidence: 0.5, expected_recovery: 0.5, risk_level: 'low', next_action: 'x', requires_human: false } as unknown as AgentDecision;
      },
    };
    const agent = new RecoveryAgent(badProvider);
    const context = makeContext(makeTxn());
    const decision = await agent.decide(context);
    // Should fall back to deterministic
    expect(['retry_payment', 'schedule_retry', 'send_reminder', 'send_payment_link', 'suggest_alternate_method', 'escalate_to_human', 'stop_recovery']).toContain(decision.decision);
  });

  it('falls back to deterministic when LLM throws', async () => {
    const throwingProvider: LLMProvider = {
      async generateDecision() {
        throw new Error('API error');
      },
    };
    const agent = new RecoveryAgent(throwingProvider);
    const context = makeContext(makeTxn());
    const decision = await agent.decide(context);
    expect(decision.decision).toBeDefined();
  });
});
