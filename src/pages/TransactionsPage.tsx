import { useState, useMemo } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import type { DashboardData } from '@/lib/dataService';
import { formatMoney, formatNumber } from '@/lib/dataService';
import { PageHeader, Badge } from '@/components/ui';
import type { Transaction } from '@/types';
import type { RecoveryOutcome } from '@/lib/engine/recoveryEngine';

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  succeeded: 'success',
  failed: 'danger',
  pending: 'warning',
  abandoned: 'neutral',
  refunded: 'neutral',
};

export default function TransactionsPage({ data }: { data: DashboardData }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  const outcomeMap = useMemo(() => {
    const m = new Map<string, RecoveryOutcome>();
    for (const o of data.outcomes) m.set(o.transaction.transaction_id, o);
    return m;
  }, [data.outcomes]);

  const filtered = useMemo(() => {
    let txns = data.transactions;
    if (statusFilter !== 'all') {
      txns = txns.filter((t) => t.payment_status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      txns = txns.filter(
        (t) =>
          t.transaction_id.toLowerCase().includes(q) ||
          t.customer_id.toLowerCase().includes(q) ||
          t.merchant_id.toLowerCase().includes(q) ||
          (t.failure_code ?? '').toLowerCase().includes(q),
      );
    }
    return txns.slice(0, 200);
  }, [data.transactions, search, statusFilter]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Transactions"
        subtitle={`${formatNumber(data.transactions.length)} synthetic transactions · ${formatNumber(data.outcomes.length)} at-risk`}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
          <input
            type="text"
            placeholder="Search by transaction ID, customer, merchant, or failure code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full pl-10"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input min-w-[140px]"
        >
          <option value="all">All Statuses</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="abandoned">Abandoned</option>
          <option value="succeeded">Succeeded</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-800 text-ink-500 text-xs">
                <th className="text-left font-medium px-4 py-3">Transaction ID</th>
                <th className="text-left font-medium px-4 py-3">Customer</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Method</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Failure Code</th>
                <th className="text-center font-medium px-4 py-3">Retries</th>
                <th className="text-left font-medium px-4 py-3">Outcome</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((txn) => {
                const outcome = outcomeMap.get(txn.transaction_id);
                return (
                  <tr
                    key={txn.transaction_id}
                    onClick={() => setSelectedTxn(txn)}
                    className="border-b border-ink-800/50 hover:bg-ink-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-ink-300">{txn.transaction_id}</td>
                    <td className="px-4 py-3 text-ink-400 text-xs">{txn.customer_id}</td>
                    <td className="px-4 py-3 text-right text-ink-200 tabular-nums">{formatMoney(txn.amount)}</td>
                    <td className="px-4 py-3 text-ink-400 capitalize text-xs">{txn.payment_method}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[txn.payment_status] ?? 'neutral'}>
                        {txn.payment_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-500 text-xs">
                      {txn.failure_code ? txn.failure_code.replace(/_/g, ' ').toLowerCase() : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-400 tabular-nums">{txn.retry_count}</td>
                    <td className="px-4 py-3">
                      {outcome ? (
                        <Badge variant={outcomeVariant(outcome.finalOutcome)}>
                          {outcome.finalOutcome}
                        </Badge>
                      ) : (
                        <span className="text-ink-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-ink-600" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-ink-500 text-sm">No transactions match your filters.</div>
        )}
        {filtered.length === 200 && (
          <div className="py-3 text-center text-xs text-ink-500 border-t border-ink-800">
            Showing first 200 results. Refine your search to see more.
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedTxn && (
        <TransactionDetail
          txn={selectedTxn}
          outcome={outcomeMap.get(selectedTxn.transaction_id) ?? null}
          onClose={() => setSelectedTxn(null)}
        />
      )}
    </div>
  );
}

function outcomeVariant(outcome: string): 'success' | 'warning' | 'danger' | 'neutral' | 'brand' {
  switch (outcome) {
    case 'recovered': return 'success';
    case 'escalated': return 'warning';
    case 'failed': return 'danger';
    case 'stopped': return 'neutral';
    case 'blocked': return 'danger';
    default: return 'neutral';
  }
}

function TransactionDetail({
  txn,
  outcome,
  onClose,
}: {
  txn: Transaction;
  outcome: RecoveryOutcome | null;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-ink-900 border-l border-ink-800 z-50 overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-ink-900 border-b border-ink-800 p-5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink-100">{txn.transaction_id}</h3>
            <p className="text-xs text-ink-500 mt-0.5">Transaction Details</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-ink-800 text-ink-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <DetailItem label="Amount" value={formatMoney(txn.amount)} />
            <DetailItem label="Currency" value={txn.currency} />
            <DetailItem label="Customer ID" value={txn.customer_id} />
            <DetailItem label="Merchant ID" value={txn.merchant_id} />
            <DetailItem label="Payment Method" value={txn.payment_method} />
            <DetailItem label="Status" value={txn.payment_status} />
            <DetailItem label="Failure Code" value={txn.failure_code ?? '—'} />
            <DetailItem label="Failure Reason" value={txn.failure_reason ?? '—'} />
            <DetailItem label="Retry Count" value={String(txn.retry_count)} />
            <DetailItem label="Customer Age" value={`${txn.customer_age_days} days`} />
            <DetailItem label="Subscription" value={txn.subscription_status} />
            <DetailItem label="Mandate Status" value={txn.mandate_status} />
          </div>

          {/* Recovery probability */}
          {outcome && (
            <div className="card p-4">
              <h4 className="text-sm font-semibold text-ink-200 mb-3">Recovery Analysis</h4>
              <div className="grid grid-cols-2 gap-3">
                <DetailItem label="Recovery Probability" value={`${(outcome.recoveryProbability * 100).toFixed(1)}%`} />
                <DetailItem label="Failure Category" value={outcome.diagnosis.category.replace(/_/g, ' ')} />
                <DetailItem label="Recoverable" value={outcome.diagnosis.is_recoverable ? 'Yes' : 'No'} />
                <DetailItem label="Final Outcome" value={outcome.finalOutcome} />
              </div>
            </div>
          )}

          {/* AI decision */}
          {outcome && (
            <div className="card p-4">
              <h4 className="text-sm font-semibold text-ink-200 mb-3">AI Decision</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Action</span>
                  <Badge variant="brand">{outcome.agentDecision.decision.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Confidence</span>
                  <span className="text-sm text-ink-200 tabular-nums">{(outcome.agentDecision.confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Expected Recovery</span>
                  <span className="text-sm text-ink-200 tabular-nums">{(outcome.agentDecision.expected_recovery * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Risk Level</span>
                  <Badge variant={outcome.agentDecision.risk_level === 'high' ? 'danger' : outcome.agentDecision.risk_level === 'medium' ? 'warning' : 'success'}>
                    {outcome.agentDecision.risk_level}
                  </Badge>
                </div>
                <div className="pt-2 border-t border-ink-800">
                  <span className="text-xs text-ink-500">Reason</span>
                  <p className="text-sm text-ink-300 mt-1">{outcome.agentDecision.reason}</p>
                </div>
              </div>
            </div>
          )}

          {/* Policy decision */}
          {outcome && (
            <div className="card p-4">
              <h4 className="text-sm font-semibold text-ink-200 mb-3">Policy Decision</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Approved</span>
                  <Badge variant={outcome.policyEvaluation.result.approved ? 'success' : 'danger'}>
                    {outcome.policyEvaluation.result.approved ? 'Approved' : 'Rejected'}
                  </Badge>
                </div>
                {!outcome.policyEvaluation.result.approved && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-500">Violation</span>
                    <span className="text-sm text-danger-400">{outcome.policyEvaluation.result.violation.replace(/_/g, ' ')}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Reason</span>
                  <span className="text-sm text-ink-300 text-right">{outcome.policyEvaluation.result.reason}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Idempotency Key</span>
                  <span className="text-xs font-mono text-ink-400">{outcome.policyEvaluation.idempotency_key}</span>
                </div>
              </div>
            </div>
          )}

          {/* Payment history */}
          {txn.previous_failures.length > 0 && (
            <div className="card p-4">
              <h4 className="text-sm font-semibold text-ink-200 mb-3">Previous Failures ({txn.previous_failures.length})</h4>
              <div className="space-y-2">
                {txn.previous_failures.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-ink-400">{f.transaction_id}</span>
                    <span className="text-ink-500">{f.failure_code?.replace(/_/g, ' ').toLowerCase() ?? 'unknown'}</span>
                    <span className="text-ink-400">{formatMoney(f.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-500 mb-0.5">{label}</p>
      <p className="text-sm text-ink-200 capitalize">{value}</p>
    </div>
  );
}
