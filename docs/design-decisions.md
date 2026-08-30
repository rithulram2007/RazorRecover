# Design Decisions

## 1. Deterministic Policy Engine as Hard Gate

**Decision:** The AI agent's output is a *recommendation*. A separate, deterministic policy engine must approve every action before execution.

**Rationale:** Financial actions require guarantees. An LLM can hallucinate, drift, or produce edge-case outputs. A deterministic engine with explicit rules (retry limits, cooldowns, high-value thresholds, terminal-state checks) provides auditable, testable guarantees that no amount of prompt engineering can match.

**Implication:** The agent and policy engine are separate modules. The agent never calls tools directly. The policy engine is the sole gatekeeper.

## 2. Interpretable ML Model

**Decision:** Use logistic regression or gradient-boosted decision trees for recovery probability prediction, not deep learning.

**Rationale:** Explainability is a hard requirement for financial systems. Logistic regression gives feature weights; GBDT gives feature importance. A reviewer (or Razorpay engineer) can inspect why the model predicts a given probability. Deep learning would add accuracy at the cost of explainability, which is unacceptable for this use case.

## 3. Closed Action Set

**Decision:** The agent selects from exactly 7 actions: `retry_payment`, `schedule_retry`, `send_payment_link`, `send_reminder`, `suggest_alternate_method`, `escalate_to_human`, `stop_recovery`.

**Rationale:** A closed set makes validation trivial (enum check), makes the policy engine rules finite and testable, and prevents the LLM from inventing actions. Open-ended tool calling would require the policy engine to handle arbitrary actions, which is unsafe.

## 4. Output Validation with Deterministic Fallback

**Decision:** Every agent output is schema-validated. If invalid, the system falls back to a deterministic rule-based decision.

**Rationale:** The LLM may produce malformed JSON, out-of-range confidence, or an invalid action. Rather than retrying the LLM (cost, latency, unreliability), we fall back to a deterministic decision based on transaction context. This guarantees the system always produces a valid decision.

## 5. Idempotency Keys for All Money Actions

**Decision:** Every payment retry uses an idempotency key derived from `(transaction_id, attempt_number)`. The simulator and Razorpay provider both check this key before executing.

**Rationale:** Network timeouts can cause duplicate execution. An idempotency key ensures that a retried request either returns the original result or is rejected as a duplicate — never double-charges.

## 6. Integer-Cent Money Arithmetic

**Decision:** All money amounts are stored and computed as integer cents. Floats are never used for money.

**Rationale:** Floating-point rounding errors are unacceptable in financial systems. `100.00` is stored as `10000` (cents). Conversion to display format happens only in the UI layer.

## 7. Seeded Reproducibility

**Decision:** The dataset generator, payment simulator, and evaluation pipeline all accept a random seed. Same seed → same output.

**Rationale:** Reproducibility is essential for evaluation. A Razorpay engineer must be able to re-run the evaluation and get the same metrics. Seeds also make test failures deterministic.

## 8. TypeScript ML Implementation

**Decision:** Implement the recovery probability model in TypeScript rather than Python.

**Rationale:** The models chosen (logistic regression, GBDT) are simple enough to implement in TypeScript without external ML libraries. This avoids a Python runtime dependency, simplifies deployment, and allows type sharing between the model and the rest of the system. If accuracy demands Python in the future, the model interface is provider-swappable.

## 9. Simulator as Default Provider

**Decision:** The payment simulator is the default execution provider. Razorpay Test Mode is an alternative provider behind the same interface.

**Rationale:** The project must work locally without Razorpay credentials. The simulator provides realistic failure modes (timeout, network error, duplicate, rate-limit, delayed response) that are essential for testing the guardrail and idempotency logic. The Razorpay provider is only enabled when valid test-mode keys are present.

## 10. Append-Only Audit Trail

**Decision:** Audit events are append-only. No updates or deletes.

**Rationale:** Audit trails must be tamper-evident. Every decision, policy result, tool call, and human action is recorded as an immutable event. This supports post-hoc investigation and regulatory compliance.
