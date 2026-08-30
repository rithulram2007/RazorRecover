/*
# RazorRecover — Core Schema

Creates the foundational tables for the RazorRecover AI Revenue Recovery system.

1. New Tables
- `transactions` — synthetic payment transaction records (50k-100k rows)
  - transaction_id (text, PK), customer_id, merchant_id, amount (integer cents),
    currency, timestamp, payment_method, payment_status, failure_code,
    failure_reason, retry_count, customer_age_days, subscription_status,
    subscription_amount, days_since_last_payment, checkout_duration,
    device_type, platform, bank_type, mandate_status, refund_status,
    is_synthetic (always true), recovery_probability, failure_category,
    is_recoverable, created_at
- `audit_events` — append-only audit trail for every AI decision and money action
  - event_id (uuid, PK), timestamp, event_type, transaction_id (FK),
    agent_decision, reason, model_version, confidence, policy_approved,
    policy_violation, tool_called, tool_result, idempotency_key,
    human_approval_state, final_outcome
- `human_reviews` — human escalation queue
  - review_id (uuid, PK), transaction_id (FK), amount, reason,
    agent_decision (jsonb), policy_evaluation (jsonb), created_at,
    resolved_at, resolution, reviewer
- `simulation_runs` — batch simulation results
  - run_id (uuid, PK), seed, transactions_analyzed, revenue_at_risk,
    interventions_attempted, successful_recoveries, revenue_recovered,
    recovery_percentage, escalations, stopped_cases, failed_interventions,
    duration_ms, created_at, summary (jsonb)
- `idempotency_records` — idempotency key store for payment actions
  - key (text, PK), transaction_id (FK), attempt_number, result (jsonb),
    created_at

2. Security
- RLS enabled on all tables.
- This is a single-tenant demo app with no sign-in screen, so policies
  allow anon + authenticated CRUD (data is intentionally shared/public).
- All data is SYNTHETIC — no real customer data.

3. Indexes
- transactions: payment_status, failure_code, customer_id, merchant_id, timestamp
- audit_events: transaction_id, timestamp, event_type
- human_reviews: resolution (for pending queue), transaction_id
*/

-- ── Transactions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id text PRIMARY KEY,
  customer_id text NOT NULL,
  merchant_id text NOT NULL,
  amount bigint NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  timestamp timestamptz NOT NULL,
  payment_method text NOT NULL,
  payment_status text NOT NULL,
  failure_code text,
  failure_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  customer_age_days integer NOT NULL DEFAULT 0,
  subscription_status text NOT NULL DEFAULT 'none',
  subscription_amount bigint NOT NULL DEFAULT 0,
  days_since_last_payment integer,
  checkout_duration integer NOT NULL DEFAULT 0,
  device_type text NOT NULL DEFAULT 'desktop',
  platform text NOT NULL DEFAULT 'web',
  bank_type text NOT NULL DEFAULT 'private',
  mandate_status text NOT NULL DEFAULT 'none',
  refund_status text NOT NULL DEFAULT 'none',
  is_synthetic boolean NOT NULL DEFAULT true,
  recovery_probability double precision,
  failure_category text,
  is_recoverable boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_status ON transactions (payment_status);
CREATE INDEX IF NOT EXISTS idx_transactions_failure_code ON transactions (failure_code);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_id ON transactions (merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions (timestamp);

-- ── Audit Events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  transaction_id text NOT NULL REFERENCES transactions (transaction_id) ON DELETE CASCADE,
  agent_decision text,
  reason text,
  model_version text,
  confidence double precision,
  policy_approved boolean,
  policy_violation text,
  tool_called text,
  tool_result text,
  idempotency_key text,
  human_approval_state text,
  final_outcome text
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_audit_events" ON audit_events;
CREATE POLICY "anon_select_audit_events" ON audit_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_audit_events" ON audit_events;
CREATE POLICY "anon_insert_audit_events" ON audit_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_events_transaction_id ON audit_events (transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events (event_type);

-- ── Human Reviews ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS human_reviews (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL REFERENCES transactions (transaction_id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  reason text NOT NULL,
  agent_decision jsonb,
  policy_evaluation jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text,
  reviewer text
);

ALTER TABLE human_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_human_reviews" ON human_reviews;
CREATE POLICY "anon_select_human_reviews" ON human_reviews FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_human_reviews" ON human_reviews;
CREATE POLICY "anon_insert_human_reviews" ON human_reviews FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_human_reviews" ON human_reviews;
CREATE POLICY "anon_update_human_reviews" ON human_reviews FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_human_reviews" ON human_reviews;
CREATE POLICY "anon_delete_human_reviews" ON human_reviews FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_human_reviews_resolution ON human_reviews (resolution);
CREATE INDEX IF NOT EXISTS idx_human_reviews_transaction_id ON human_reviews (transaction_id);

-- ── Simulation Runs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulation_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed bigint NOT NULL,
  transactions_analyzed integer NOT NULL,
  revenue_at_risk bigint NOT NULL,
  interventions_attempted integer NOT NULL,
  successful_recoveries integer NOT NULL,
  revenue_recovered bigint NOT NULL,
  recovery_percentage double precision NOT NULL,
  escalations integer NOT NULL,
  stopped_cases integer NOT NULL,
  failed_interventions integer NOT NULL,
  duration_ms bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  summary jsonb
);

ALTER TABLE simulation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_simulation_runs" ON simulation_runs;
CREATE POLICY "anon_select_simulation_runs" ON simulation_runs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_simulation_runs" ON simulation_runs;
CREATE POLICY "anon_insert_simulation_runs" ON simulation_runs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- ── Idempotency Records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_records (
  key text PRIMARY KEY,
  transaction_id text NOT NULL REFERENCES transactions (transaction_id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_idempotency" ON idempotency_records;
CREATE POLICY "anon_select_idempotency" ON idempotency_records FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_idempotency" ON idempotency_records;
CREATE POLICY "anon_insert_idempotency" ON idempotency_records FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_idempotency" ON idempotency_records;
CREATE POLICY "anon_update_idempotency" ON idempotency_records FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
