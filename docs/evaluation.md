# Evaluation Methodology

## Data Splits

The synthetic dataset is split into three sets using a deterministic seeded shuffle:

| Split | Purpose | Ratio |
|-------|---------|-------|
| Training | Model training | 60% |
| Validation | Hyperparameter tuning, early stopping | 20% |
| Held-out Test | Final evaluation | 20% |

The split is stratified by `payment_status` and `failure_code` to ensure balanced representation.

## ML Metrics

The recovery probability model is evaluated as a binary classifier: will this transaction be successfully recovered?

| Metric | What it measures |
|--------|-----------------|
| Precision | Of predicted recoveries, how many actually recovered |
| Recall | Of actual recoveries, how many we predicted |
| F1 | Harmonic mean of precision and recall |
| ROC-AUC | Ranking quality across thresholds |

## Business Metrics

Computed from the batch simulation on the held-out test set:

| Metric | What it measures |
|--------|-----------------|
| Total Revenue | Sum of all transaction amounts |
| Revenue at Risk | Sum of amounts for failed/recoverable transactions |
| Revenue Recovered | Sum of amounts for transactions successfully recovered |
| Recovery Rate | Revenue Recovered / Revenue at Risk |
| Intervention Count | Number of recovery actions attempted |
| False Intervention Cost | Cost of interventions that did not recover revenue |
| Escalation Rate | Escalations / Total at-risk transactions |
| Average Recovery Attempts | Mean attempts per at-risk transaction |

## Agent Metrics

| Metric | What it measures |
|--------|-----------------|
| Valid Action Rate | Agent outputs that pass schema validation |
| Invalid Output Rate | Agent outputs that fall back to deterministic |
| Guardrail Violation Rate | Actions rejected by the policy engine |
| Successful Tool Execution | Tool calls that completed successfully |
| Correct Escalation Rate | Escalations that were appropriate (high-value or low-confidence) |

## Evaluation Pipeline

```
Held-out test set
  → Revenue-at-Risk Detection (identify recoverable transactions)
  → Recovery Probability Model (predict P(recovery))
  → AI Recovery Agent (select action)
  → Policy Engine (approve/reject)
  → Payment Simulator (execute approved actions)
  → Audit Trail (record everything)
  → Metrics Aggregation (compute all metrics)
  → Report
```

## Running Evaluation

```bash
npm run evaluate
```

This runs the full pipeline on the held-out test set and prints a metrics report. The same pipeline powers the dashboard's Evaluation page.

## No Fabricated Metrics

All metrics are computed from actual simulation results. The evaluation pipeline does not hardcode or estimate any number. If a metric cannot be computed (e.g., no model trained yet), it is reported as N/A.
