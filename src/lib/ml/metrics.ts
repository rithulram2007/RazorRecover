/**
 * Evaluation metrics — precision, recall, F1, ROC-AUC.
 * All computed from actual predictions, never fabricated.
 */

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export function confusionMatrix(
  predictions: number[],
  labels: number[],
  threshold = 0.5,
): ConfusionMatrix {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < predictions.length; i++) {
    const predicted = predictions[i] >= threshold ? 1 : 0;
    const actual = labels[i];
    if (predicted === 1 && actual === 1) tp++;
    else if (predicted === 1 && actual === 0) fp++;
    else if (predicted === 0 && actual === 1) fn++;
    else tn++;
  }
  return { tp, fp, fn, tn };
}

export function precision(cm: ConfusionMatrix): number {
  const denom = cm.tp + cm.fp;
  return denom === 0 ? 0 : cm.tp / denom;
}

export function recall(cm: ConfusionMatrix): number {
  const denom = cm.tp + cm.fn;
  return denom === 0 ? 0 : cm.tp / denom;
}

export function f1Score(cm: ConfusionMatrix): number {
  const p = precision(cm);
  const r = recall(cm);
  const denom = p + r;
  return denom === 0 ? 0 : (2 * p * r) / denom;
}

/**
 * ROC-AUC via the rank-based method (Mann-Whitney U).
 * Works for binary labels with continuous prediction scores.
 */
export function rocAuc(predictions: number[], labels: number[]): number {
  const positives = predictions.filter((_, i) => labels[i] === 1);
  const negatives = predictions.filter((_, i) => labels[i] === 0);

  if (positives.length === 0 || negatives.length === 0) return 0.5;

  let concordant = 0;
  let ties = 0;

  for (const p of positives) {
    for (const n of negatives) {
      if (p > n) concordant++;
      else if (p === n) ties++;
    }
  }

  return (concordant + 0.5 * ties) / (positives.length * negatives.length);
}
