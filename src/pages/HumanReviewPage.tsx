import { useState } from 'react';
import { UserCheck, Check, X, Ban } from 'lucide-react';
import type { DashboardData } from '@/lib/dataService';
import { formatMoney } from '@/lib/dataService';
import { PageHeader, Badge } from '@/components/ui';

export default function HumanReviewPage({ data }: { data: DashboardData }) {
  const [reviews, setReviews] = useState(data.reviewItems);
  const [reviewerName, setReviewerName] = useState('reviewer_1');

  const pending = reviews.filter((r) => r.resolution === null);
  const resolved = reviews.filter((r) => r.resolution !== null);

  const resolve = (reviewId: string, resolution: 'approved' | 'rejected' | 'stopped') => {
    setReviews((prev) =>
      prev.map((r) =>
        r.review_id === reviewId
          ? { ...r, resolution, resolved_at: new Date().toISOString(), reviewer: reviewerName }
          : r,
      ),
    );
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Human Review"
        subtitle={`${pending.length} pending escalations · ${resolved.length} resolved`}
        actions={
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-500">Reviewer:</label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="input w-32"
            />
          </div>
        }
      />

      {/* Pending reviews */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-ink-200 mb-3">Pending Escalations</h3>
        {pending.length === 0 ? (
          <div className="card p-8 text-center">
            <UserCheck className="w-8 h-8 mx-auto mb-2 text-ink-600" />
            <p className="text-ink-500 text-sm">No pending escalations. All cases have been reviewed.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((item) => (
              <div key={item.review_id} className="card p-4 animate-slide-up">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-sm text-ink-200">{item.transaction_id}</span>
                      <Badge variant="warning">Pending</Badge>
                      <span className="text-sm text-ink-300 font-semibold">{formatMoney(item.amount)}</span>
                    </div>
                    <p className="text-xs text-ink-500 mb-2">{item.reason}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-ink-400">
                      <span>Agent: <span className="text-ink-300 capitalize">{item.agent_decision.decision.replace(/_/g, ' ')}</span></span>
                      <span>Confidence: <span className="text-ink-300 tabular-nums">{(item.agent_decision.confidence * 100).toFixed(0)}%</span></span>
                      <span>Risk: <span className="text-ink-300 capitalize">{item.agent_decision.risk_level}</span></span>
                      <span>Escalated: <span className="text-ink-300">{new Date(item.created_at).toLocaleString('en-IN')}</span></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => resolve(item.review_id, 'approved')}
                      className="btn-success"
                    >
                      <Check className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => resolve(item.review_id, 'rejected')}
                      className="btn-danger"
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => resolve(item.review_id, 'stopped')}
                      className="btn-secondary"
                    >
                      <Ban className="w-4 h-4" />
                      Stop
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved reviews */}
      {resolved.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-200 mb-3">Resolved Cases</h3>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-ink-500 text-xs">
                    <th className="text-left font-medium px-4 py-3">Transaction</th>
                    <th className="text-right font-medium px-4 py-3">Amount</th>
                    <th className="text-left font-medium px-4 py-3">Resolution</th>
                    <th className="text-left font-medium px-4 py-3">Reviewer</th>
                    <th className="text-left font-medium px-4 py-3">Resolved At</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((item) => (
                    <tr key={item.review_id} className="border-b border-ink-800/50 hover:bg-ink-800/30">
                      <td className="px-4 py-3 font-mono text-xs text-ink-300">{item.transaction_id}</td>
                      <td className="px-4 py-3 text-right text-ink-200 tabular-nums">{formatMoney(item.amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={item.resolution === 'approved' ? 'success' : item.resolution === 'rejected' ? 'danger' : 'neutral'}>
                          {item.resolution}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-400 text-xs">{item.reviewer}</td>
                      <td className="px-4 py-3 text-ink-500 text-xs">
                        {item.resolved_at ? new Date(item.resolved_at).toLocaleString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
