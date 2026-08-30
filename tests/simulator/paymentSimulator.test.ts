import { describe, it, expect } from 'vitest';
import { PaymentSimulator } from '@/lib/simulator/paymentSimulator';
import { DEFAULT_SIMULATOR_CONFIG } from '@/types';

describe('Payment Simulator', () => {
  it('returns a duplicate_request result for the same idempotency key', () => {
    const sim = new PaymentSimulator({ ...DEFAULT_SIMULATOR_CONFIG, seed: 42 });
    const r1 = sim.processPayment('TXN_001', 10000, 'key_1');
    const r2 = sim.processPayment('TXN_001', 10000, 'key_1');

    expect(r1.idempotency_key).toBe('key_1');
    expect(r2.outcome).toBe('duplicate_request');
    expect(r2.message).toContain('idempotency protection');
  });

  it('returns already_successful for a transaction that already succeeded', () => {
    const sim = new PaymentSimulator({ ...DEFAULT_SIMULATOR_CONFIG, seed: 42 });
    sim.setTransactionState('TXN_002', 'succeeded');
    const result = sim.processPayment('TXN_002', 5000, 'key_2');

    expect(result.outcome).toBe('already_successful');
    expect(result.new_state).toBe('succeeded');
  });

  it('produces reproducible outcomes with the same seed', () => {
    const sim1 = new PaymentSimulator({ ...DEFAULT_SIMULATOR_CONFIG, seed: 100 });
    const sim2 = new PaymentSimulator({ ...DEFAULT_SIMULATOR_CONFIG, seed: 100 });

    const r1 = sim1.processPayment('TXN_003', 1000, 'key_a');
    const r2 = sim2.processPayment('TXN_003', 1000, 'key_a');

    expect(r1.outcome).toBe(r2.outcome);
  });

  it('can force a specific outcome for testing', () => {
    const sim = new PaymentSimulator({ ...DEFAULT_SIMULATOR_CONFIG, seed: 42 });
    sim.forceNextOutcome('timeout');
    const result = sim.processPayment('TXN_004', 2000, 'key_b');

    expect(result.outcome).toBe('timeout');
    expect(result.new_state).toBe('pending');
  });

  it('can force a rate_limited outcome', () => {
    const sim = new PaymentSimulator({ ...DEFAULT_SIMULATOR_CONFIG, seed: 42 });
    sim.forceNextOutcome('rate_limited');
    const result = sim.processPayment('TXN_005', 3000, 'key_c');

    expect(result.outcome).toBe('rate_limited');
  });

  it('returns null for unknown transaction state verification', () => {
    const sim = new PaymentSimulator({ ...DEFAULT_SIMULATOR_CONFIG, seed: 42 });
    expect(sim.verifyState('UNKNOWN_TXN')).toBeNull();
  });

  it('returns state after processing', () => {
    const sim = new PaymentSimulator({ ...DEFAULT_SIMULATOR_CONFIG, seed: 42 });
    sim.forceNextOutcome('success');
    sim.processPayment('TXN_006', 1000, 'key_d');
    expect(sim.verifyState('TXN_006')).toBe('succeeded');
  });
});
