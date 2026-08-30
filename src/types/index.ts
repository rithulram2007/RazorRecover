/**
 * Core domain types for RazorRecover.
 * All modules import from here — single source of truth for data shapes.
 */

// ── Money ──────────────────────────────────────────────────────────────────

/** Amount in integer cents. Never use floats for money. */
export type Money = number;

export type Currency = 'INR' | 'USD';

// ── Transaction ─────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'succeeded'
  | 'failed'
  | 'pending'
  | 'refunded'
  | 'abandoned';

export type FailureCode =
  | 'TEMPORARY_NETWORK_FAILURE'
  | 'BANK_DECLINE'
  | 'INSUFFICIENT_FUNDS'
  | 'EXPIRED_MANDATE'
  | 'AUTHENTICATION_FAILURE'
  | 'CHECKOUT_ABANDONMENT'
  | 'REPEATED_FAILURE'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export type PaymentMethod =
  | 'upi'
  | 'card'
  | 'netbanking'
  | 'wallet'
  | 'emandate';

export type DeviceType = 'mobile' | 'desktop' | 'tablet';

export type Platform = 'android' | 'ios' | 'web' | 'windows';

export type BankType = 'public' | 'private' | 'payments' | 'cooperative';

export type MandateStatus = 'active' | 'expired' | 'cancelled' | 'none';

export type RefundStatus = 'none' | 'pending' | 'completed' | 'failed';

export type SubscriptionStatus = 'none' | 'active' | 'cancelled' | 'past_due' | 'trialing';

export interface PaymentHistoryEntry {
  transaction_id: string;
  amount: Money;
  status: PaymentStatus;
  timestamp: string; // ISO 8601
  failure_code: FailureCode | null;
}

export interface Transaction {
  transaction_id: string;
  customer_id: string;
  merchant_id: string;
  amount: Money;
  currency: Currency;
  timestamp: string; // ISO 8601
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  failure_code: FailureCode | null;
  failure_reason: string | null;
  retry_count: number;
  previous_failures: PaymentHistoryEntry[];
  customer_payment_history: PaymentHistoryEntry[];
  customer_age_days: number;
  subscription_status: SubscriptionStatus;
  subscription_amount: Money;
  days_since_last_payment: number | null;
  checkout_duration: number; // seconds
  device_type: DeviceType;
  platform: Platform;
  bank_type: BankType;
  mandate_status: MandateStatus;
  refund_status: RefundStatus;
  is_synthetic: true; // always true — this is synthetic data
}

// ── Failure Diagnosis ────────────────────────────────────────────────────────

export type FailureCategory =
  | 'temporary_network_failure'
  | 'bank_decline'
  | 'insufficient_funds'
  | 'expired_mandate'
  | 'authentication_failure'
  | 'checkout_abandonment'
  | 'repeated_failure'
  | 'unknown';

export interface FailureDiagnosis {
  category: FailureCategory;
  is_recoverable: boolean;
  reason: string;
  recommended_approach: string;
  source: 'rule' | 'ml';
}

// ── Revenue at Risk ──────────────────────────────────────────────────────────

export interface RevenueAtRiskItem {
  transaction: Transaction;
  diagnosis: FailureDiagnosis;
  recovery_probability: number; // 0..1, from ML model
  revenue_at_risk: Money;
}

// ── AI Recovery Agent ────────────────────────────────────────────────────────

export type RecoveryAction =
  | 'retry_payment'
  | 'schedule_retry'
  | 'send_payment_link'
  | 'send_reminder'
  | 'suggest_alternate_method'
  | 'escalate_to_human'
  | 'stop_recovery';

export const ALL_RECOVERY_ACTIONS: readonly RecoveryAction[] = [
  'retry_payment',
  'schedule_retry',
  'send_payment_link',
  'send_reminder',
  'suggest_alternate_method',
  'escalate_to_human',
  'stop_recovery',
] as const;

export type RiskLevel = 'low' | 'medium' | 'high';

export interface AgentDecision {
  decision: RecoveryAction;
  reason: string;
  confidence: number; // 0..1
  expected_recovery: number; // 0..1
  risk_level: RiskLevel;
  next_action: string;
  requires_human: boolean;
}

export interface AgentContext {
  transaction: Transaction;
  diagnosis: FailureDiagnosis;
  recovery_probability: number;
  retry_count: number;
  last_action_timestamp: string | null;
  is_in_cooldown: boolean;
}

// ── Policy Engine ────────────────────────────────────────────────────────────

export interface PolicyConfig {
  max_retry_count: number;
  min_retry_interval_seconds: number;
  cooldown_seconds: number;
  high_value_threshold: Money;
  escalation_confidence_threshold: number; // below this → escalate
  max_communication_attempts: number;
  terminal_states: PaymentStatus[];
}

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  max_retry_count: 3,
  min_retry_interval_seconds: 3600, // 1 hour
  cooldown_seconds: 1800, // 30 min
  high_value_threshold: 500000, // ₹5,000 in cents
  escalation_confidence_threshold: 0.5,
  max_communication_attempts: 3,
  terminal_states: ['succeeded', 'refunded'],
};

export type PolicyResult =
  | { approved: true; reason: string }
  | { approved: false; reason: string; violation: PolicyViolation };

export type PolicyViolation =
  | 'terminal_state'
  | 'max_retries_exceeded'
  | 'in_cooldown'
  | 'high_value_requires_human'
  | 'low_confidence'
  | 'duplicate_action'
  | 'max_communications_exceeded'
  | 'state_unverifiable';

export interface PolicyEvaluation {
  decision: AgentDecision;
  result: PolicyResult;
  idempotency_key: string;
  timestamp: string;
}

// ── Payment Simulator ─────────────────────────────────────────────────────────

export type SimulatorOutcome =
  | 'success'
  | 'temporary_failure'
  | 'permanent_failure'
  | 'timeout'
  | 'network_error'
  | 'duplicate_request'
  | 'already_successful'
  | 'rate_limited'
  | 'delayed_response';

export interface SimulatorResult {
  outcome: SimulatorOutcome;
  transaction_id: string;
  idempotency_key: string;
  amount: Money;
  timestamp: string;
  latency_ms: number;
  message: string;
  new_state: PaymentStatus;
}

export interface SimulatorConfig {
  seed: number;
  success_rate: number; // base probability of success
  timeout_rate: number;
  network_error_rate: number;
  rate_limit_rate: number;
  max_latency_ms: number;
}

export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
  seed: 42,
  success_rate: 0.72,
  timeout_rate: 0.05,
  network_error_rate: 0.03,
  rate_limit_rate: 0.02,
  max_latency_ms: 3000,
};

// ── Idempotency ───────────────────────────────────────────────────────────────

export interface IdempotencyRecord {
  key: string;
  transaction_id: string;
  attempt_number: number;
  result: SimulatorResult;
  created_at: string;
}

// ── Audit Trail ───────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'AGENT_DECISION'
  | 'POLICY_RESULT'
  | 'TOOL_CALLED'
  | 'TOOL_RESULT'
  | 'STATE_CHECK'
  | 'HUMAN_REVIEW'
  | 'FINAL_OUTCOME';

export interface AuditEvent {
  event_id: string;
  timestamp: string;
  event_type: AuditEventType;
  transaction_id: string;
  agent_decision: RecoveryAction | null;
  reason: string | null;
  model_version: string | null;
  confidence: number | null;
  policy_approved: boolean | null;
  policy_violation: PolicyViolation | null;
  tool_called: string | null;
  tool_result: string | null;
  idempotency_key: string | null;
  human_approval_state: HumanApprovalState | null;
  final_outcome: string | null;
}

export type HumanApprovalState = 'pending' | 'approved' | 'rejected' | 'stopped' | 'not_required';

// ── Human Review ──────────────────────────────────────────────────────────────

export interface HumanReviewItem {
  review_id: string;
  transaction_id: string;
  amount: Money;
  reason: string;
  agent_decision: AgentDecision;
  policy_evaluation: PolicyEvaluation;
  created_at: string;
  resolved_at: string | null;
  resolution: HumanApprovalState | null;
  reviewer: string | null;
}

// ── Evaluation Metrics ────────────────────────────────────────────────────────

export interface MLMetrics {
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
  sample_count: number;
}

export interface BusinessMetrics {
  total_revenue: Money;
  revenue_at_risk: Money;
  revenue_recovered: Money;
  recovery_rate: number;
  transactions_analyzed: number;
  transactions_recovered: number;
  interventions_attempted: number;
  false_intervention_cost: Money;
  escalation_count: number;
  escalation_rate: number;
  stopped_count: number;
  failed_interventions: number;
  average_recovery_attempts: number;
}

export interface AgentMetrics {
  valid_action_rate: number;
  invalid_output_rate: number;
  guardrail_violation_rate: number;
  successful_tool_executions: number;
  correct_escalation_rate: number;
  total_decisions: number;
}

export interface EvaluationReport {
  ml: MLMetrics;
  business: BusinessMetrics;
  agent: AgentMetrics;
  generated_at: string;
  split: 'train' | 'validation' | 'test';
  sample_count: number;
}

// ── Recovery Simulation ──────────────────────────────────────────────────────

export interface SimulationSummary {
  transactions_analyzed: number;
  revenue_at_risk: Money;
  interventions_attempted: number;
  successful_recoveries: number;
  revenue_recovered: Money;
  recovery_percentage: number;
  escalations: number;
  stopped_cases: number;
  failed_interventions: number;
  duration_ms: number;
  seed: number;
}
