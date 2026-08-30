/**
 * AI Recovery Agent.
 *
 * Receives structured transaction context and selects an action from a CLOSED set.
 * Validates all output. Falls back to deterministic behavior if output is invalid.
 * Never exposes chain-of-thought — only concise decision explanations.
 */

import type {
  AgentContext,
  AgentDecision,
  RecoveryAction,
  Transaction,
  FailureDiagnosis,
} from '@/types';
import { ALL_RECOVERY_ACTIONS } from '@/types';
import { deterministicFallback } from '@/lib/policy/policyEngine';

export interface LLMProvider {
  generateDecision(context: AgentContext): Promise<AgentDecision | null>;
}

export class RecoveryAgent {
  private provider: LLMProvider | null;
  readonly modelVersion: string;

  constructor(provider: LLMProvider | null = null) {
    this.provider = provider;
    this.modelVersion = provider ? 'llm-v1' : 'deterministic-v1';
  }

  async decide(context: AgentContext): Promise<AgentDecision> {
    if (!this.provider) {
      return deterministicFallback(context);
    }

    try {
      const raw = await this.provider.generateDecision(context);
      if (!raw) return deterministicFallback(context);

      const validated = this.validate(raw, context);
      if (!validated) {
        return deterministicFallback(context);
      }

      return validated;
    } catch {
      return deterministicFallback(context);
    }
  }

  /**
   * Validate agent output against schema and bounds.
   * Returns the decision if valid, null if invalid.
   */
  validate(raw: unknown, _context: AgentContext): AgentDecision | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const d = raw as Record<string, unknown>;

    // Check action is in closed set
    if (!ALL_RECOVERY_ACTIONS.includes(d.decision as RecoveryAction)) return null;

    // Check confidence is in [0, 1]
    const confidence = Number(d.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) return null;

    // Check expected_recovery is in [0, 1]
    const expectedRecovery = Number(d.expected_recovery);
    if (isNaN(expectedRecovery) || expectedRecovery < 0 || expectedRecovery > 1) return null;

    // Check reason is a non-empty string (no chain-of-thought leak)
    const reason = String(d.reason ?? '');
    if (reason.length === 0 || reason.length > 500) return null;

    // Check risk_level
    const riskLevel = d.risk_level;
    if (riskLevel !== 'low' && riskLevel !== 'medium' && riskLevel !== 'high') return null;

    // Check requires_human
    let requiresHuman = Boolean(d.requires_human);

    // If high risk or low confidence, requires_human should be true
    if ((riskLevel === 'high' || confidence < 0.5) && !requiresHuman) {
      requiresHuman = true;
    }

    return {
      decision: d.decision as RecoveryAction,
      reason,
      confidence,
      expected_recovery: expectedRecovery,
      risk_level: riskLevel as 'low' | 'medium' | 'high',
      next_action: String(d.next_action ?? ''),
      requires_human: requiresHuman,
    };
  }
}

/**
 * OpenAI-compatible LLM provider.
 * Uses a structured prompt to get a decision from the closed action set.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor(apiUrl: string, apiKey: string, model: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateDecision(context: AgentContext): Promise<AgentDecision | null> {
    const prompt = this.buildPrompt(context);

    try {
      const response = await fetch(`${this.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a payment recovery agent. Select exactly one action from the closed set. Return only valid JSON with fields: decision, reason, confidence (0-1), expected_recovery (0-1), risk_level (low/medium/high), next_action, requires_human (boolean). Do not include chain-of-thought.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;

      return JSON.parse(content) as AgentDecision;
    } catch {
      return null;
    }
  }

  private buildPrompt(context: AgentContext): string {
    const { transaction: txn, diagnosis, recovery_probability, retry_count } = context;
    return JSON.stringify({
      transaction: {
        transaction_id: txn.transaction_id,
        amount: txn.amount,
        currency: txn.currency,
        payment_method: txn.payment_method,
        payment_status: txn.payment_status,
        failure_code: txn.failure_code,
        retry_count,
        customer_age_days: txn.customer_age_days,
        subscription_status: txn.subscription_status,
        device_type: txn.device_type,
        mandate_status: txn.mandate_status,
      },
      diagnosis: {
        category: diagnosis.category,
        is_recoverable: diagnosis.is_recoverable,
        reason: diagnosis.reason,
      },
      recovery_probability: Number(recovery_probability.toFixed(3)),
      allowed_actions: ALL_RECOVERY_ACTIONS,
    }, null, 2);
  }
}
