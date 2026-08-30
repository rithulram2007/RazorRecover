/**
 * Human Review Queue — escalation workflow.
 *
 * Escalates cases when confidence is low, transaction value is high,
 * retry limits are exceeded, policy requires approval, or state
 * cannot be safely verified.
 */

import type { AgentDecision, HumanReviewItem, HumanApprovalState, Money, PolicyEvaluation } from '@/types';

export class HumanReviewQueue {
  private queue: Map<string, HumanReviewItem> = new Map();

  enqueue(
    transactionId: string,
    amount: Money,
    reason: string,
    agentDecision: AgentDecision,
    policyEvaluation: PolicyEvaluation,
  ): HumanReviewItem {
    const item: HumanReviewItem = {
      review_id: crypto.randomUUID(),
      transaction_id: transactionId,
      amount,
      reason,
      agent_decision: agentDecision,
      policy_evaluation: policyEvaluation,
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolution: null,
      reviewer: null,
    };
    this.queue.set(item.review_id, item);
    return item;
  }

  resolve(reviewId: string, resolution: HumanApprovalState, reviewer: string): HumanReviewItem | null {
    const item = this.queue.get(reviewId);
    if (!item) return null;

    item.resolved_at = new Date().toISOString();
    item.resolution = resolution;
    item.reviewer = reviewer;
    return item;
  }

  getPending(): HumanReviewItem[] {
    return Array.from(this.queue.values()).filter((i) => i.resolution === null);
  }

  getAll(): HumanReviewItem[] {
    return Array.from(this.queue.values());
  }

  getById(reviewId: string): HumanReviewItem | null {
    return this.queue.get(reviewId) ?? null;
  }

  count(): number {
    return this.queue.size;
  }

  pendingCount(): number {
    return this.getPending().length;
  }
}
