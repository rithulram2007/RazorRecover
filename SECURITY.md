# Security Policy

## Environment Variables

All secrets and configuration are loaded from environment variables via `.env`. The `.env.example` file documents every variable without containing real values. The `.env` file is gitignored and never committed.

## No Secrets in Source

- API keys are read from environment at runtime.
- No hardcoded keys, tokens, or credentials in source code.
- The Supabase service role key is never exposed to the frontend.

## Input Validation

- All AI agent outputs are schema-validated before use (see `RecoveryAgent.validate`).
- All API inputs are validated at the boundary.
- Transaction IDs, amounts, and action types are type-checked.

## Safe API Handling

- Razorpay API calls use Test Mode key only.
- All provider calls go through a provider abstraction layer.
- Timeouts are handled with state verification, not blind retries.

## Rate Limiting

- The policy engine enforces cooldown periods between retries.
- Maximum retry counts are configurable and enforced deterministically.
- The simulator supports rate-limit responses for testing.

## Idempotency

- Every money-related action carries an idempotency key: `txn_{transaction_id}_attempt_{attempt_number}`.
- The provider stores the key-result mapping and returns cached results for duplicate keys.
- This prevents double-charging from network retries.

## Audit Logging

- Every AI decision and money-related action produces an audit event.
- Audit events are append-only (no updates or deletes).
- Events include: timestamp, transaction ID, agent decision, reason, model version, confidence, policy result, tool called, tool result, idempotency key, human approval state, final outcome.

## Row-Level Security (Supabase)

- All database tables have RLS enabled.
- This is a single-tenant demo app (no sign-in), so policies allow `anon, authenticated` CRUD.
- All data is SYNTHETIC — no real customer data.

## Terminal-State Protection

- The policy engine never retries a transaction in a terminal state (`succeeded`, `refunded`).
- This is checked before any action is approved.

## Duplicate-Action Protection

- The policy engine checks whether an action has already been attempted for this transaction and attempt number.
- Duplicate actions are rejected and logged.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by creating an issue in the repository. Do not publicly disclose security issues until they have been reviewed.
