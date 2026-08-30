# Failure Scenario: API Timeout → Idempotent Retry

## Scenario

A payment retry is sent to the payment provider. The provider accepts the request but the HTTP response times out. The system does not know whether the payment succeeded, failed, or is still pending.

## Risk

If the system naively retries, it may double-charge the customer. If it does not retry, it may lose recoverable revenue.

## Solution

### Step 1: API Timeout

The payment simulator returns a `TIMEOUT` result after a configurable delay. The execution layer catches this and does NOT treat it as a failure.

### Step 2: Verify Transaction State

Before any retry, the system queries the provider's transaction state endpoint (simulated). This returns the current state: `succeeded`, `failed`, `pending`, or `unknown`.

- If `succeeded` → no retry, log success, update transaction.
- If `failed` → proceed to recovery decision.
- If `pending` or `unknown` → wait, do not retry yet.

### Step 3: Idempotency Protection

Every payment action carries an idempotency key: `txn_{transaction_id}_attempt_{attempt_number}`. The provider (simulator or Razorpay) stores this key and its result.

- If the key already exists with a result → return the stored result (no duplicate execution).
- If the key does not exist → execute and store the result.

### Step 4: Safe Retry or Escalate

After state verification:
- If the original attempt is confirmed failed → the policy engine decides whether to retry (within limits, outside cooldown).
- If state cannot be verified after N attempts → escalate to human.

### Step 5: Audit Event

Every step produces an audit event:

```
1. TOOL_CALLED: retry_payment, idempotency_key=txn_T001_attempt_2
2. TOOL_RESULT: TIMEOUT
3. STATE_CHECK: unknown
4. STATE_CHECK: failed (after retry)
5. POLICY_DECISION: approved (retry_count=2, max=3, cooldown_elapsed)
6. TOOL_CALLED: retry_payment, idempotency_key=txn_T001_attempt_3
7. TOOL_RESULT: success
8. FINAL_OUTCOME: recovered
```

## Automated Tests

The test suite includes:

- `tests/simulator/timeout.test.ts` — simulator returns timeout on cue
- `tests/policy/idempotency.test.ts` — duplicate idempotency key returns original result
- `tests/policy/state-verification.test.ts` — state check prevents duplicate execution
- `tests/e2e/timeout-recovery.test.ts` — full timeout → verify → retry → audit flow

## Key Takeaway

The combination of state verification + idempotency keys + policy engine ensures that timeouts never cause double-charges and never silently lose recoverable revenue. The LLM may recommend a retry, but the deterministic layer ensures it is safe.
