/**
 * Recovery Probability Model — interpretable logistic regression.
 *
 * Features (all deterministic, derived from transaction context):
 *   1. retry_count (normalized: retry_count / 5)
 *   2. customer_age_days (normalized: min(age/365, 1))
 *   3. days_since_last_payment (normalized: min(days/30, 1))
 *   4. checkout_duration (normalized: min(duration/300, 1))
 *   5. is_subscription_active (0/1)
 *   6. failure_category_enc (one-hot: temporary=1, insufficient=0.8, auth=0.6, others=0.2)
 *   7. previous_failure_count (normalized: count/5)
 *
 * The model is trained on synthetic data with known recovery outcomes.
 * Weights are learned via gradient descent on the training split.
 */

import type { Transaction, FailureDiagnosis } from '@/types';
import { SeededRandom } from '@/lib/random';

export interface ModelFeatures {
  retry_count: number;
  customer_age: number;
  days_since_last_payment: number;
  checkout_duration: number;
  is_subscription_active: number;
  failure_category_score: number;
  previous_failure_count: number;
}

export interface TrainingExample {
  features: number[];
  label: number; // 1 = recovered, 0 = not recovered
}

export class RecoveryProbabilityModel {
  private weights: number[];
  private bias: number;
  readonly featureCount = 7;
  readonly modelVersion = 'logreg-v1';

  constructor() {
    this.weights = new Array(this.featureCount).fill(0);
    this.bias = 0;
  }

  extractFeatures(txn: Transaction, diagnosis: FailureDiagnosis): ModelFeatures {
    const categoryScores: Record<string, number> = {
      temporary_network_failure: 1.0,
      insufficient_funds: 0.8,
      authentication_failure: 0.6,
      checkout_abandonment: 0.4,
      expired_mandate: 0.2,
      bank_decline: 0.1,
      repeated_failure: 0.15,
      unknown: 0.2,
    };

    return {
      retry_count: Math.min(txn.retry_count / 5, 1),
      customer_age: Math.min(txn.customer_age_days / 365, 1),
      days_since_last_payment: txn.days_since_last_payment != null
        ? Math.min(txn.days_since_last_payment / 30, 1)
        : 1,
      checkout_duration: Math.min(txn.checkout_duration / 300, 1),
      is_subscription_active: txn.subscription_status === 'active' ? 1 : 0,
      failure_category_score: categoryScores[diagnosis.category] ?? 0.2,
      previous_failure_count: Math.min(txn.previous_failures.length / 5, 1),
    };
  }

  featuresToVector(f: ModelFeatures): number[] {
    return [
      f.retry_count,
      f.customer_age,
      f.days_since_last_payment,
      f.checkout_duration,
      f.is_subscription_active,
      f.failure_category_score,
      f.previous_failure_count,
    ];
  }

  private sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-z));
  }

  predict(txn: Transaction, diagnosis: FailureDiagnosis): number {
    const features = this.featuresToVector(this.extractFeatures(txn, diagnosis));
    const z = this.bias + features.reduce((sum, f, i) => sum + f * this.weights[i], 0);
    return this.sigmoid(z);
  }

  predictVector(features: number[]): number {
    const z = this.bias + features.reduce((sum, f, i) => sum + f * this.weights[i], 0);
    return this.sigmoid(z);
  }

  /**
   * Train via gradient descent.
   * Returns final loss.
   */
  train(examples: TrainingExample[], epochs = 200, lr = 0.1): number {
    const n = examples.length;
    let lastLoss = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const gradW = new Array(this.featureCount).fill(0);
      let gradB = 0;
      let loss = 0;

      for (const ex of examples) {
        const z = this.bias + ex.features.reduce((s, f, i) => s + f * this.weights[i], 0);
        const pred = this.sigmoid(z);
        const error = pred - ex.label;
        for (let i = 0; i < this.featureCount; i++) {
          gradW[i] += error * ex.features[i];
        }
        gradB += error;
        loss += -ex.label * Math.log(pred + 1e-10) - (1 - ex.label) * Math.log(1 - pred + 1e-10);
      }

      for (let i = 0; i < this.featureCount; i++) {
        this.weights[i] -= (lr * gradW[i]) / n;
      }
      this.bias -= (lr * gradB) / n;
      lastLoss = loss / n;
    }

    return lastLoss;
  }

  getWeights(): { weights: number[]; bias: number } {
    return { weights: [...this.weights], bias: this.bias };
  }

  /**
   * Generate synthetic training labels for a transaction.
   * The "ground truth" recovery outcome is deterministic given the seed and features.
   */
  static generateLabel(txn: Transaction, diagnosis: FailureDiagnosis, rng: SeededRandom): number {
    const categoryRecoveryRates: Record<string, number> = {
      temporary_network_failure: 0.85,
      insufficient_funds: 0.55,
      authentication_failure: 0.65,
      checkout_abandonment: 0.35,
      expired_mandate: 0.25,
      bank_decline: 0.10,
      repeated_failure: 0.15,
      unknown: 0.20,
    };

    let baseRate = categoryRecoveryRates[diagnosis.category] ?? 0.2;

    // Adjust by retry count — diminishing returns
    baseRate *= Math.pow(0.7, txn.retry_count);

    // Older customers with good history recover more
    if (txn.customer_age_days > 365) baseRate += 0.05;
    if (txn.subscription_status === 'active') baseRate += 0.10;

    // High checkout duration suggests hesitation — less likely
    if (txn.checkout_duration > 180) baseRate -= 0.05;

    baseRate = Math.max(0.02, Math.min(0.95, baseRate));
    return rng.nextBool(baseRate) ? 1 : 0;
  }
}
