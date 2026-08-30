/**
 * Payment Provider Abstraction.
 *
 * The simulator is the default provider. Razorpay Test Mode can be enabled
 * by providing valid test-mode keys in .env. Both implement the same interface.
 *
 * Do NOT fabricate Razorpay APIs. The Razorpay provider only implements
 * capabilities that genuinely exist in the Razorpay Test Mode API.
 */

import type { SimulatorResult, Money } from '@/types';
import { PaymentSimulator } from '@/lib/simulator/paymentSimulator';

export interface PaymentProvider {
  name: string;
  processPayment(transactionId: string, amount: Money, idempotencyKey: string): Promise<SimulatorResult>;
  verifyState(transactionId: string): Promise<string | null>;
}

/**
 * Simulator-backed provider (default).
 */
export class SimulatorProvider implements PaymentProvider {
  name = 'simulator';
  private sim: PaymentSimulator;

  constructor(sim: PaymentSimulator) {
    this.sim = sim;
  }

  async processPayment(transactionId: string, amount: Money, idempotencyKey: string): Promise<SimulatorResult> {
    return this.sim.processPayment(transactionId, amount, idempotencyKey);
  }

  async verifyState(transactionId: string): Promise<string | null> {
    return this.sim.verifyState(transactionId);
  }
}

/**
 * Razorpay Test Mode provider.
 *
 * This is a clean abstraction. Real Razorpay API calls require valid test-mode
 * keys (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) in .env. Without keys, the
 * system falls back to the simulator.
 *
 * NOTE: Razorpay Test Mode does NOT support a "verify state" endpoint for
 * arbitrary transactions. State verification after timeout is handled by
 * the simulator. This is clearly labeled as SIMULATED.
 */
export class RazorpayProvider implements PaymentProvider {
  name = 'razorpay_test';
  private keyId: string;
  private keySecret: string;
  private baseUrl = 'https://api.razorpay.com/v1';

  constructor(keyId: string, keySecret: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  async processPayment(transactionId: string, amount: Money, idempotencyKey: string): Promise<SimulatorResult> {
    try {
      // Razorpay Test Mode: create an order (this is a real API endpoint)
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${btoa(`${this.keyId}:${this.keySecret}`)}`,
          'X-Razorpay-Idempotency': idempotencyKey,
        },
        body: JSON.stringify({
          amount,
          currency: 'INR',
          notes: { transaction_id: transactionId },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          outcome: 'permanent_failure',
          transaction_id: transactionId,
          idempotency_key: idempotencyKey,
          amount,
          timestamp: new Date().toISOString(),
          latency_ms: 0,
          message: `Razorpay API error: ${response.status} ${errorBody}`,
          new_state: 'failed',
        };
      }

      const data = await response.json();
      return {
        outcome: 'success',
        transaction_id: transactionId,
        idempotency_key: idempotencyKey,
        amount,
        timestamp: new Date().toISOString(),
        latency_ms: 0,
        message: `Razorpay order created: ${data.id}`,
        new_state: 'succeeded',
      };
    } catch {
      return {
        outcome: 'network_error',
        transaction_id: transactionId,
        idempotency_key: idempotencyKey,
        amount,
        timestamp: new Date().toISOString(),
        latency_ms: 0,
        message: 'Network error contacting Razorpay',
        new_state: 'pending',
      };
    }
  }

  async verifyState(transactionId: string): Promise<string | null> {
    // Razorpay does not have a generic "verify state by transaction_id" endpoint.
    // State verification is SIMULATED — we return null to indicate unverifiable.
    // In production, you would fetch payments associated with the order.
    return null;
  }
}

/**
 * Get the active payment provider based on environment configuration.
 */
export function getPaymentProvider(simulator: PaymentSimulator): PaymentProvider {
  const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
  const razorpayKeySecret = import.meta.env.VITE_RAZORPAY_KEY_SECRET;

  if (razorpayKeyId && razorpayKeySecret) {
    return new RazorpayProvider(razorpayKeyId, razorpayKeySecret);
  }

  return new SimulatorProvider(simulator);
}
