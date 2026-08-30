import { describe, it, expect } from 'vitest';
import { generateDataset, splitDataset, DEFAULT_DATASET_CONFIG } from '@/lib/dataset/generator';

describe('Dataset Generator', () => {
  it('generates the requested number of transactions', () => {
    const data = generateDataset({ ...DEFAULT_DATASET_CONFIG, size: 100, seed: 42 });
    expect(data).toHaveLength(100);
  });

  it('produces deterministic output with the same seed', () => {
    const a = generateDataset({ ...DEFAULT_DATASET_CONFIG, size: 50, seed: 123 });
    const b = generateDataset({ ...DEFAULT_DATASET_CONFIG, size: 50, seed: 123 });
    expect(a).toEqual(b);
  });

  it('produces different output with different seeds', () => {
    const a = generateDataset({ ...DEFAULT_DATASET_CONFIG, size: 50, seed: 1 });
    const b = generateDataset({ ...DEFAULT_DATASET_CONFIG, size: 50, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('labels all records as synthetic', () => {
    const data = generateDataset({ ...DEFAULT_DATASET_CONFIG, size: 10, seed: 42 });
    expect(data.every((t) => t.is_synthetic === true)).toBe(true);
  });

  it('has unique transaction IDs', () => {
    const data = generateDataset({ ...DEFAULT_DATASET_CONFIG, size: 100, seed: 42 });
    const ids = new Set(data.map((t) => t.transaction_id));
    expect(ids.size).toBe(100);
  });

  it('has valid amounts (positive integers)', () => {
    const data = generateDataset({ ...DEFAULT_DATASET_CONFIG, size: 100, seed: 42 });
    expect(data.every((t) => t.amount > 0 && Number.isInteger(t.amount))).toBe(true);
  });

  it('splits dataset into train/validation/test with correct ratios', () => {
    const data = generateDataset({ ...DEFAULT_DATASET_CONFIG, size: 1000, seed: 42 });
    const { train, validation, test } = splitDataset(data, 99);
    expect(train.length + validation.length + test.length).toBe(1000);
    expect(train.length).toBeGreaterThan(500);
    expect(validation.length).toBeGreaterThan(150);
    expect(test.length).toBeGreaterThan(150);
  });
});
