/**
 * Audit Trail — append-only event log.
 * Every AI decision and money-related action produces an audit event.
 */

import type { AuditEvent, AuditEventType, PolicyEvaluation, SimulatorResult, RecoveryAction, PolicyViolation, HumanApprovalState } from '@/types';

export class AuditTrail {
  private events: AuditEvent[] = [];

  log(event: Omit<AuditEvent, 'event_id' | 'timestamp'>): AuditEvent {
    const full: AuditEvent = {
      ...event,
      event_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.events.push(full);
    return full;
  }

  logAgentDecision(
    transactionId: string,
    decision: RecoveryAction,
    reason: string,
    modelVersion: string,
    confidence: number,
  ): AuditEvent {
    return this.log({
      event_type: 'AGENT_DECISION',
      transaction_id: transactionId,
      agent_decision: decision,
      reason,
      model_version: modelVersion,
      confidence,
      policy_approved: null,
      policy_violation: null,
      tool_called: null,
      tool_result: null,
      idempotency_key: null,
      human_approval_state: null,
      final_outcome: null,
    });
  }

  logPolicyResult(
    transactionId: string,
    evaluation: PolicyEvaluation,
  violation: PolicyViolation | null,
  approved: boolean,
  reason: string,
  modelVersion: string,
    confidence: number,
  ): AuditEvent {
    return this.log({
      event_type: 'POLICY_RESULT',
      transaction_id: transactionId,
      agent_decision: evaluation.decision.decision,
      reason,
      model_version: modelVersion,
      confidence,
      policy_approved: approved,
      policy_violation: violation,
      tool_called: null,
      tool_result: null,
      idempotency_key: evaluation.idempotency_key,
      human_approval_state: null,
      final_outcome: null,
    });
  }

  logToolCall(
    transactionId: string,
    toolName: string,
    idempotencyKey: string,
  ): AuditEvent {
    return this.log({
      event_type: 'TOOL_CALLED',
      transaction_id: transactionId,
      agent_decision: null,
      reason: null,
      model_version: null,
      confidence: null,
      policy_approved: null,
      policy_violation: null,
      tool_called: toolName,
      tool_result: null,
      idempotency_key: idempotencyKey,
      human_approval_state: null,
      final_outcome: null,
    });
  }

  logToolResult(
    transactionId: string,
    result: SimulatorResult,
  ): AuditEvent {
    return this.log({
      event_type: 'TOOL_RESULT',
      transaction_id: transactionId,
      agent_decision: null,
      reason: null,
      model_version: null,
      confidence: null,
      policy_approved: null,
      policy_violation: null,
      tool_called: null,
      tool_result: result.outcome,
      idempotency_key: result.idempotency_key,
      human_approval_state: null,
      final_outcome: null,
    });
  }

  logStateCheck(
    transactionId: string,
    state: string,
  ): AuditEvent {
    return this.log({
      event_type: 'STATE_CHECK',
      transaction_id: transactionId,
      agent_decision: null,
      reason: `Verified state: ${state}`,
      model_version: null,
      confidence: null,
      policy_approved: null,
      policy_violation: null,
      tool_called: null,
      tool_result: null,
      idempotency_key: null,
      human_approval_state: null,
      final_outcome: null,
    });
  }

  logHumanReview(
    transactionId: string,
    resolution: HumanApprovalState,
    reviewer: string,
  ): AuditEvent {
    return this.log({
      event_type: 'HUMAN_REVIEW',
      transaction_id: transactionId,
      agent_decision: null,
      reason: `Reviewer ${reviewer} ${resolution}`,
      model_version: null,
      confidence: null,
      policy_approved: null,
      policy_violation: null,
      tool_called: null,
      tool_result: null,
      idempotency_key: null,
      human_approval_state: resolution,
      final_outcome: null,
    });
  }

  logFinalOutcome(
    transactionId: string,
    outcome: string,
  ): AuditEvent {
    return this.log({
      event_type: 'FINAL_OUTCOME',
      transaction_id: transactionId,
      agent_decision: null,
      reason: null,
      model_version: null,
      confidence: null,
      policy_approved: null,
      policy_violation: null,
      tool_called: null,
      tool_result: null,
      idempotency_key: null,
      human_approval_state: null,
      final_outcome: outcome,
    });
  }

  getAll(): AuditEvent[] {
    return [...this.events];
  }

  getByTransaction(transactionId: string): AuditEvent[] {
    return this.events.filter((e) => e.transaction_id === transactionId);
  }

  filter(filters: {
    event_type?: AuditEventType;
    transaction_id?: string;
    policy_approved?: boolean;
  }): AuditEvent[] {
    return this.events.filter((e) => {
      if (filters.event_type && e.event_type !== filters.event_type) return false;
      if (filters.transaction_id && e.transaction_id !== filters.transaction_id) return false;
      if (filters.policy_approved !== undefined && e.policy_approved !== filters.policy_approved) return false;
      return true;
    });
  }

  count(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
  }
}
