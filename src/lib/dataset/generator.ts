/**
 * Synthetic Dataset Generator.
 *
 * Produces 50,000–100,000 realistic synthetic transaction records.
 * All data is SYNTHETIC — clearly labeled.
 * Reproducible via seeded PRNG.
 */

import type {
  Transaction,
  PaymentStatus,
  FailureCode,
  PaymentMethod,
  DeviceType,
  Platform,
  BankType,
  MandateStatus,
  RefundStatus,
  SubscriptionStatus,
  PaymentHistoryEntry,
  Money,
  Currency,
} from '@/types';
import { SeededRandom } from '@/lib/random';

const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'card', 'netbanking', 'wallet', 'emandate'];
const FAILURE_CODES: (FailureCode | null)[] = [
  'TEMPORARY_NETWORK_FAILURE',
  'BANK_DECLINE',
  'INSUFFICIENT_FUNDS',
  'EXPIRED_MANDATE',
  'AUTHENTICATION_FAILURE',
  'CHECKOUT_ABANDONMENT',
  'REPEATED_FAILURE',
  'RATE_LIMITED',
  'UNKNOWN',
  null,
];
const DEVICE_TYPES: DeviceType[] = ['mobile', 'desktop', 'tablet'];
const PLATFORMS: Platform[] = ['android', 'ios', 'web', 'windows'];
const BANK_TYPES: BankType[] = ['public', 'private', 'payments', 'cooperative'];
const MANDATE_STATUSES: MandateStatus[] = ['active', 'expired', 'cancelled', 'none'];
const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['none', 'active', 'cancelled', 'past_due', 'trialing'];

const FAILURE_REASONS: Record<FailureCode, string> = {
  TEMPORARY_NETWORK_FAILURE: 'Gateway timeout — network connectivity issue',
  BANK_DECLINE: 'Bank declined the transaction',
  INSUFFICIENT_FUNDS: 'Customer account has insufficient funds',
  EXPIRED_MANDATE: 'Mandate has expired — re-authentication required',
  AUTHENTICATION_FAILURE: '3DS authentication failed',
  CHECKOUT_ABANDONMENT: 'Customer abandoned the checkout flow',
  REPEATED_FAILURE: 'Multiple consecutive payment failures',
  RATE_LIMITED: 'Too many requests — rate limit exceeded',
  UNKNOWN: 'Unknown error from payment gateway',
};

export interface DatasetGeneratorConfig {
  size: number;
  seed: number;
  failureRate: number; // proportion of failed/abandoned transactions
  currency: Currency;
}

export const DEFAULT_DATASET_CONFIG: DatasetGeneratorConfig = {
  size: 50000,
  seed: 42,
  failureRate: 0.35,
  currency: 'INR',
};

export function generateDataset(config: DatasetGeneratorConfig = DEFAULT_DATASET_CONFIG): Transaction[] {
  const rng = new SeededRandom(config.seed);
  const transactions: Transaction[] = [];

  // Fixed base time for reproducibility — derived from seed, not wall clock
  const BASE_TIME = 1700000000000; // 2023-11-14T22:13:20Z
  const now = BASE_TIME;

  const customerPool = generateCustomerPool(Math.min(config.size / 5, 10000), rng, now);
  const merchantPool = generateMerchantPool(Math.min(config.size / 50, 1000), rng);

  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < config.size; i++) {
    const customer = customerPool[rng.nextInt(0, customerPool.length - 1)];
    const merchant = merchantPool[rng.nextInt(0, merchantPool.length - 1)];

    const amount = generateAmount(rng);
    const timestamp = new Date(now - rng.nextInt(0, ninetyDays)).toISOString();

    const isFailed = rng.nextBool(config.failureRate);
    let paymentStatus: PaymentStatus;
    let failureCode: FailureCode | null;
    let failureReason: string | null;

    if (isFailed) {
      failureCode = rng.pick(FAILURE_CODES.filter((c): c is FailureCode => c !== null));
      failureReason = FAILURE_REASONS[failureCode];

      if (failureCode === 'CHECKOUT_ABANDONMENT') {
        paymentStatus = 'abandoned';
      } else if (rng.nextBool(0.15)) {
        paymentStatus = 'pending';
      } else {
        paymentStatus = 'failed';
      }
    } else {
      paymentStatus = 'succeeded';
      failureCode = null;
      failureReason = null;
    }

    const retryCount = isFailed ? rng.nextInt(0, 4) : 0;
    const previousFailures = generatePreviousFailures(customer.customerId, rng, Math.min(retryCount, 3), amount, now);

    const subscriptionStatus = rng.pick(SUBSCRIPTION_STATUSES);
    const subscriptionAmount = subscriptionStatus === 'none' ? 0 : rng.nextInt(10000, 100000) as Money;

    const mandateStatus = paymentMethodRequiresMandate('emandate', rng)
      ? rng.pick(MANDATE_STATUSES)
      : 'none';

    const txn: Transaction = {
      transaction_id: `TXN_${String(i + 1).padStart(6, '0')}`,
      customer_id: customer.customerId,
      merchant_id: merchant.merchantId,
      amount,
      currency: config.currency,
      timestamp,
      payment_method: rng.pick(PAYMENT_METHODS),
      payment_status: paymentStatus,
      failure_code: failureCode,
      failure_reason: failureReason,
      retry_count: retryCount,
      previous_failures: previousFailures,
      customer_payment_history: customer.history,
      customer_age_days: customer.ageDays,
      subscription_status: subscriptionStatus,
      subscription_amount: subscriptionAmount,
      days_since_last_payment: customer.lastPaymentDate
        ? Math.max(0, Math.floor((now - customer.lastPaymentDate) / (24 * 60 * 60 * 1000)))
        : null,
      checkout_duration: rng.nextInt(10, 300),
      device_type: rng.pick(DEVICE_TYPES),
      platform: rng.pick(PLATFORMS),
      bank_type: rng.pick(BANK_TYPES),
      mandate_status: mandateStatus,
      refund_status: 'none' as RefundStatus,
      is_synthetic: true,
    };

    transactions.push(txn);
  }

  return transactions;
}

function generateAmount(rng: SeededRandom): Money {
  // Most transactions are small-to-medium, with a long tail
  const tier = rng.next();
  if (tier < 0.5) return rng.nextInt(100, 5000) as Money; // ₹1–₹50
  if (tier < 0.8) return rng.nextInt(5000, 50000) as Money; // ₹50–₹500
  if (tier < 0.95) return rng.nextInt(50000, 500000) as Money; // ₹500–₹5,000
  return rng.nextInt(500000, 2000000) as Money; // ₹5,000–₹20,000
}

function generatePreviousFailures(
  customerId: string,
  rng: SeededRandom,
  count: number,
  amount: Money,
  now: number,
): PaymentHistoryEntry[] {
  const entries: PaymentHistoryEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      transaction_id: `PREV_${customerId}_${i}`,
      amount,
      status: 'failed',
      timestamp: new Date(now - rng.nextInt(1, 30) * 24 * 60 * 60 * 1000).toISOString(),
      failure_code: rng.pick(FAILURE_CODES.filter((c): c is FailureCode => c !== null)),
    });
  }
  return entries;
}

function paymentMethodRequiresMandate(method: PaymentMethod, rng: SeededRandom): boolean {
  return method === 'emandate' && rng.nextBool(0.5);
}

interface CustomerInfo {
  customerId: string;
  ageDays: number;
  history: PaymentHistoryEntry[];
  lastPaymentDate: number | null;
}

function generateCustomerPool(size: number, rng: SeededRandom, now: number): CustomerInfo[] {
  const pool: CustomerInfo[] = [];
  for (let i = 0; i < size; i++) {
    const ageDays = rng.nextInt(1, 365 * 3);
    const historyCount = rng.nextInt(0, 10);
    const history: PaymentHistoryEntry[] = [];
    let lastPaymentDate: number | null = null;

    for (let j = 0; j < historyCount; j++) {
      const ts = now - rng.nextInt(1, 365) * 24 * 60 * 60 * 1000;
      history.push({
        transaction_id: `HIST_${i}_${j}`,
        amount: rng.nextInt(100, 50000) as Money,
        status: rng.nextBool(0.7) ? 'succeeded' : 'failed',
        timestamp: new Date(ts).toISOString(),
        failure_code: rng.nextBool(0.3) ? rng.pick(FAILURE_CODES.filter((c): c is FailureCode => c !== null)) : null,
      });
      if (j === 0) lastPaymentDate = ts;
    }

    pool.push({
      customerId: `CUST_${String(i + 1).padStart(5, '0')}`,
      ageDays,
      history,
      lastPaymentDate,
    });
  }
  return pool;
}

interface MerchantInfo {
  merchantId: string;
}

function generateMerchantPool(size: number, rng: SeededRandom): MerchantInfo[] {
  const pool: MerchantInfo[] = [];
  for (let i = 0; i < size; i++) {
    pool.push({ merchantId: `MERCH_${String(i + 1).padStart(4, '0')}` });
  }
  return pool;
}

/**
 * Split dataset into train/validation/test using a seeded shuffle.
 */
export function splitDataset<T>(data: T[], seed: number, ratios = [0.6, 0.2, 0.2]): {
  train: T[];
  validation: T[];
  test: T[];
} {
  const rng = new SeededRandom(seed);
  const shuffled = [...data];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const trainEnd = Math.floor(shuffled.length * ratios[0]);
  const valEnd = trainEnd + Math.floor(shuffled.length * ratios[1]);

  return {
    train: shuffled.slice(0, trainEnd),
    validation: shuffled.slice(trainEnd, valEnd),
    test: shuffled.slice(valEnd),
  };
}
