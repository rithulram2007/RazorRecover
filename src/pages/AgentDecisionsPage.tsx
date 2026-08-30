import { useState, useMemo } from 'react';
import { Bot, ChevronDown, ChevronRight } from 'lucide-react';
import type { DashboardData } from '@/lib/dataService';
import { formatMoney } from '@/lib/dataService';
import { PageHeader, Badge } from '@/components/ui';
import type { RecoveryOutcome } from '@/lib/engine/recoveryEngine';

export default function AgentDecisionsPage({ data }: { data: DashboardData }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('all');

  const filtered = useMemo(() => {
    if (actionFilter === 'all') return data.outcomes;
    return data.outcomes.filter((o) => o.agentDecision.decision === actionFilter);
  }, [data.outcomes, actionFilter]);

  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of data.outcomes) {
      counts[o.agentDecision.decision] = (counts[o.agentDecision.decision] ?? 0) + 1;
    }
    return counts;
  }, [data.outcomes]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Agent Decisions"
        subtitle="AI recovery agent decisions with confidence, expected recovery, and policy results"
      />

      {/* Action distribution */}
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-ink-200 mb-4">Action Distribution</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {Object.entries(actionCounts).map(([action, count]) => (
            <button
              key={action}
              onClick={() => setActionFilter(actionFilter === action ? 'all' : action)}
              className={`card p-3 text-center transition-all ${
                actionFilter === action ? 'border-brand-500/40 bg-brand-500/5' : 'card-hover'
              }`}
            >
              <p className="text-lg font-bold text-ink-100 tabular-nums">{count}</p>
              <p className="text-[10px] text-ink-500 mt-0.5 capitalize">{action.replace(/_/g, ' ')}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Decision list */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-800 text-ink-500 text-xs">
                <th className="text-left font-medium px-4 py-3 w-8"></th>
                <th className="text-left font-medium px-4 py-3">Transaction</th>
                <th className="text-left font-medium px-4 py-3">Action</th>
                <th className="text-left font-medium px-4 py-3 max-w-xs">Reason</th>
                <th className="text-right font-medium px-4 py-3">Confidence</th>
                <th className="text-right font-medium px-4 py-3">Expected Recovery</th>
                <th className="text-left font-medium px-4 py-3">Risk</th>
                <th className="text-left font-medium px-4 py-3">Policy</th>
                <th className="text-left font-medium px-4 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((o) => {
                const id = o.transaction.transaction_id;
                const isExpanded = expanded === id;
                return (
                  <>
                    <tr
                      key={id}
                      onClick={() => setExpanded(isExpanded ? null : id)}
                      className="border-b border-ink-800/50 hover:bg-ink-800/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-ink-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-ink-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-300">{id}</td>
                      <td className="px-4 py-3">
                        <Badge variant="brand">{o.agentDecision.decision.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-400 text-xs truncate max-w-xs">{o.agentDecision.reason}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <ConfidenceBar value={o.agentDecision.confidence} />
                      </td>
                      <td className="px-4 py-3 text-right text-ink-300 tabular-nums text-xs">
                        {(o.agentDecision.expected_recovery * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={o.agentDecision.risk_level === 'high' ? 'danger' : o.agentDecision.risk_level === 'medium' ? 'warning' : 'success'}>
                          {o.agentDecision.risk_level}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={o.policyEvaluation.result.approved ? 'success' : 'danger'}>
                          {o.policyEvaluation.result.approved ? 'Approved' : 'Rejected'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={outcomeVariant(o.finalOutcome)}>{o.finalOutcome}</Badge>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-ink-900/50">
                        <td colSpan={9} className="px-12 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                            <div>
                              <p className="text-ink-500 mb-1">Amount</p>
                              <p className="text-ink-200">{formatMoney(o.transaction.amount)}</p>
                            </div>
                            <div>
                              <p className="text-ink-500 mb-1">Recovery Probability</p>
                              <p className="text-ink-200">{(o.recoveryProbability * 100).toFixed(1)}%</p>
                            </div>
                            <div>
                              <p className="text-ink-500 mb-1">Failure Category</p>
                              <p className="text-ink-200 capitalize">{o.diagnosis.category.replace(/_/g, ' ')}</p>
                            </div>
                            <div>
                              <p className="text-ink-500 mb-1">Idempotency Key</p>
                              <p className="text-ink-400 font-mono">{o.policyEvaluation.idempotency_key}</p>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-4">
                              <p className="text-ink-500 mb-1">Full Reason</p>
                              <p className="text-ink-300">{o.agentDecision.reason}</p>
                            </div>
                            {!o.policyEvaluation.result.approved && (
                              <div className="sm:col-span-2 lg:col-span-4">
                                <p className="text-ink-500 mb-1">Policy Violation</p>
                                <p className="text-danger-400">{o.policyEvaluation.result.violation.replace(/_/g, ' ')}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-ink-500 text-sm">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No decisions match the selected action.
          </div>
        )}
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = (value * 100).toFixed(0);
  const color = value >= 0.7 ? 'bg-success-500' : value >= 0.5 ? 'bg-warning-500' : 'bg-danger-500';
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 bg-ink-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-ink-300 tabular-nums text-xs w-8 text-right">{pct}%</span>
    </div>
  );
}

function outcomeVariant(outcome: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (outcome) {
    case 'recovered': return 'success';
    case 'escalated': return 'warning';
    case 'failed': return 'danger';
    case 'stopped': return 'neutral';
    case 'blocked': return 'danger';
    default: return 'neutral';
  }
}
