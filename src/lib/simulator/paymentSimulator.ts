/**
 * Local Payment Simulator.
 *
 * Supports: success, temporary failure, permanent failure, timeout,
 * network error, duplicate request, already-successful, rate-limited,
 * delayed response.
 *
 * All outcomes are reproducible via a seeded PRNG.
 * Idempotency keys prevent duplicate execution.
 */

import type {
  SimulatorConfig,
  SimulatorResult,
  SimulatorOutcome,
  PaymentStatus,
  Money,
} from '@/types';
import { DEFAULT_SIMULATOR_CONFIG } from '@/types';
import { SeededRandom } from '@/lib/random';

export class PaymentSimulator {
  private config: SimulatorConfig;
  private rng: SeededRandom;
  private idempotencyStore: Map<string, SimulatorResult> = new Map();
  private transactionStates: Map<string, PaymentStatus> = new Map();

  constructor(config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG) {
    this.config = config;
    this.rng = new SeededRandom(config.seed);
  }

  getConfig(): SimulatorConfig {
    return { ...this.config };
  }

  /**
   * Process a payment action with idempotency protection.
   * If the idempotency key already exists, returns the stored result (duplicate_request).
   */
  processPayment(
    transactionId: string,
    amount: Money,
    idempotencyKey: string,
  ): SimulatorResult {
    // Idempotency check — return cached result if key exists
    const existing = this.idempotencyStore.get(idempotencyKey);
    if (existing) {
      return {
        ...existing,
        outcome: 'duplicate_request',
        message: 'Duplicate request — returning cached result (idempotency protection)',
        latency_ms: 1,
      };
    }

    // Check if transaction is already successful
    const currentState = this.transactionStates.get(transactionId);
    if (currentState === 'succeeded') {
      const result = this.makeResult(
        'already_successful',
        transactionId,
        idempotencyKey,
        amount,
        'Transaction already succeeded',
        'succeeded',
      );
      this.idempotencyStore.set(idempotencyKey, result);
      return result;
    }

    // Determine outcome via seeded PRNG
    const outcome = this.rollOutcome();
    const latency = this.rng.nextInt(50, this.config.max_latency_ms);

    const stateMap: Record<SimulatorOutcome, PaymentStatus> = {
      success: 'succeeded',
      temporary_failure: 'failed',
      permanent_failure: 'failed',
      timeout: 'pending',
      network_error: 'pending',
      duplicate_request: currentState ?? 'pending',
      already_successful: 'succeeded',
      rate_limited: 'pending',
      delayed_response: 'pending',
    };

    const messageMap: Record<SimulatorOutcome, string> = {
      success: 'Payment succeeded',
      temporary_failure: 'Temporary failure — retryable',
      permanent_failure: 'Permanent failure — not retryable',
      timeout: 'Request timed out — state unknown',
      network_error: 'Network error — state unknown',
      duplicate_request: 'Duplicate request',
      already_successful: 'Transaction already succeeded',
      rate_limited: 'Rate limited — too many requests',
      delayed_response: 'Delayed response — state unknown',
    };

    const result = this.makeResult(
      outcome,
      transactionId,
      idempotencyKey,
      amount,
      messageMap[outcome],
      stateMap[outcome],
    );
    result.latency_ms = latency;

    // Store idempotency record
    this.idempotencyStore.set(idempotencyKey, result);

    // Update transaction state
    this.transactionStates.set(transactionId, stateMap[outcome]);

    return result;
  }

  /**
   * Verify the state of a transaction (for timeout recovery).
   */
  verifyState(transactionId: string): PaymentStatus | null {
    return this.transactionStates.get(transactionId) ?? null;
  }

  /**
   * Set a transaction's state directly (for testing).
   */
  setTransactionState(transactionId: string, state: PaymentStatus): void {
    this.transactionStates.set(transactionId, state);
  }

  /**
   * Force a specific outcome on the next call (for testing).
   */
  private forcedOutcome: SimulatorOutcome | null = null;
  forceNextOutcome(outcome: SimulatorOutcome | null): void {
    this.forcedOutcome = outcome;
  }

  private rollOutcome(): SimulatorOutcome {
    if (this.forcedOutcome) {
      const forced = this.forcedOutcome;
      this.forcedOutcome = null;
      return forced;
    }

    const roll = this.rng.next();

    if (roll < this.config.timeout_rate) return 'timeout';
    if (roll < this.config.timeout_rate + this.config.network_error_rate) return 'network_error';
    if (roll < this.config.timeout_rate + this.config.network_error_rate + this.config.rate_limit_rate)
      return 'rate_limited';
    if (roll < this.config.success_rate) return 'success';

    // Remaining: split between temporary and permanent failure
    return this.rng.nextBool(0.6) ? 'temporary_failure' : 'permanent_failure';
  }

  private makeResult(
    outcome: SimulatorOutcome,
    transactionId: string,
    idempotencyKey: string,
    amount: Money,
    message: string,
    newState: PaymentStatus,
  ): SimulatorResult {
    return {
      outcome,
      transaction_id: transactionId,
      idempotency_key: idempotencyKey,
      amount,
      timestamp: new Date().toISOString(),
      latency_ms: 0,
      message,
      new_state: newState,
    };
  }

  reset(): void {
    this.rng = new SeededRandom(this.config.seed);
    this.idempotencyStore.clear();
    this.transactionStates.clear();
  }
}
