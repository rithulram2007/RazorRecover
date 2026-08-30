/**
 * Deterministic failure diagnosis engine.
 * Rules first, ML classification where it adds value.
 */

import type {
  FailureCategory,
  FailureCode,
  FailureDiagnosis,
  Transaction,
} from '@/types';

const RECOVERABLE: FailureCategory[] = [
  'temporary_network_failure',
  'insufficient_funds',
  'authentication_failure',
];

const NON_RECOVERABLE: FailureCategory[] = [
  'bank_decline',
  'expired_mandate',
  'checkout_abandonment',
  'repeated_failure',
];

export function classifyFailure(code: FailureCode | null, txn: Transaction): FailureCategory {
  if (!code) {
    if (txn.payment_status === 'abandoned') return 'checkout_abandonment';
    return 'unknown';
  }

  const map: Record<FailureCode, FailureCategory> = {
    TEMPORARY_NETWORK_FAILURE: 'temporary_network_failure',
    BANK_DECLINE: 'bank_decline',
    INSUFFICIENT_FUNDS: 'insufficient_funds',
    EXPIRED_MANDATE: 'expired_mandate',
    AUTHENTICATION_FAILURE: 'authentication_failure',
    CHECKOUT_ABANDONMENT: 'checkout_abandonment',
    REPEATED_FAILURE: 'repeated_failure',
    RATE_LIMITED: 'temporary_network_failure',
    UNKNOWN: 'unknown',
  };

  let category = map[code];

  // Repeated failure override: if retry_count >= 3, classify as repeated
  if (txn.retry_count >= 3 && category !== 'checkout_abandonment') {
    category = 'repeated_failure';
  }

  return category;
}

export function diagnoseFailure(txn: Transaction): FailureDiagnosis {
  const category = classifyFailure(txn.failure_code, txn);
  const isRecoverable = RECOVERABLE.includes(category);

  const reasons: Record<FailureCategory, string> = {
    temporary_network_failure: 'Network or gateway timeout — transient, likely to succeed on retry.',
    bank_decline: 'Bank declined the transaction — typically permanent for this method.',
    insufficient_funds: 'Customer has insufficient funds — retry after reminder may succeed.',
    expired_mandate: 'Mandate has expired — requires customer re-authentication.',
    authentication_failure: 'Authentication failed — retry or alternate method may resolve.',
    checkout_abandonment: 'Customer abandoned checkout — requires re-engagement via link or reminder.',
    repeated_failure: 'Multiple consecutive failures — diminishing returns, consider escalation.',
    unknown: 'Unknown failure — cannot determine recoverability automatically.',
  };

  const approaches: Record<FailureCategory, string> = {
    temporary_network_failure: 'Retry payment after cooldown.',
    bank_decline: 'Suggest alternate payment method.',
    insufficient_funds: 'Send reminder and schedule retry for a later date.',
    expired_mandate: 'Send payment link for re-authentication.',
    authentication_failure: 'Retry or suggest alternate method.',
    checkout_abandonment: 'Send payment link or reminder.',
    repeated_failure: 'Escalate to human review.',
    unknown: 'Escalate to human for investigation.',
  };

  return {
    category,
    is_recoverable: isRecoverable,
    reason: reasons[category],
    recommended_approach: approaches[category],
    source: 'rule',
  };
}

export { RECOVERABLE, NON_RECOVERABLE };
