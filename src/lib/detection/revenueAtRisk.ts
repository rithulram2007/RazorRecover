/**
 * Revenue-at-risk detection.
 * Deterministic rules identify transactions that may contain recoverable revenue.
 */

import type { Money, RevenueAtRiskItem, Transaction } from '@/types';
import { diagnoseFailure } from './diagnosis';

export function isAtRisk(txn: Transaction): boolean {
  if (txn.payment_status === 'succeeded') return false;
  if (txn.payment_status === 'refunded') return false;
  if (txn.refund_status === 'completed') return false;

  // Failed, pending, or abandoned transactions are at risk
  return txn.payment_status === 'failed' ||
    txn.payment_status === 'pending' ||
    txn.payment_status === 'abandoned';
}

export function detectRevenueAtRisk(txns: Transaction[]): RevenueAtRiskItem[] {
  return txns
    .filter(isAtRisk)
    .map((txn) => {
      const diagnosis = diagnoseFailure(txn);
      return {
        transaction: txn,
        diagnosis,
        recovery_probability: 0, // filled by ML model
        revenue_at_risk: txn.amount as Money,
      };
    });
}
