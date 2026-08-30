# Security

## Environment Variables

All secrets and configuration are loaded from environment variables. The `.env.example` file documents every variable without containing real values. `.env` is gitignored and never committed.

## No Secrets in Source

- API keys are read from `process.env` at runtime.
- No hardcoded keys, tokens, or credentials in source code.
- The Supabase service role key is never exposed to the frontend.

## Input Validation

- All agent outputs are schema-validated before use.
- All API inputs are validated at the boundary.
- Transaction IDs, amounts, and action types are type-checked.

## Safe API Handling

- Razorpay API calls use the Test Mode key only.
- All provider calls go through a provider abstraction layer.
- Timeouts are handled with state verification, not blind retries.

## Rate Limiting

- The policy engine enforces cooldown periods between retries.
- Maximum retry counts are configurable and enforced deterministically.
- The simulator supports rate-limit responses for testing.

## Idempotency

- Every money-related action carries an idempotency key.
- The provider stores the key-result mapping and returns cached results for duplicate keys.
- This prevents double-charging from network retries.

## Audit Logging

- Every AI decision and money-related action produces an audit event.
- Audit events are append-only (no updates or deletes).
- Events include: timestamp, transaction ID, agent decision, reason, model version, confidence, policy result, tool called, tool result, idempotency key, human approval state, final outcome.

## Row-Level Security (Supabase)

- All database tables have RLS enabled.
- Policies enforce ownership checks via `auth.uid()`.
- The service role key is used only in server-side / edge function contexts.

## Terminal-State Protection

- The policy engine never retries a transaction in a terminal state (`succeeded`, `refunded`, `stopped`).
- This is checked before any action is approved.

## Duplicate-Action Protection

- The policy engine checks whether an action has already been attempted for this transaction and attempt number.
- Duplicate actions are rejected and logged.
