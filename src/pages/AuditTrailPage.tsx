import { useState, useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import type { DashboardData } from '@/lib/dataService';
import { PageHeader, Badge } from '@/components/ui';
import type { AuditEvent, AuditEventType } from '@/types';

const EVENT_VARIANTS: Record<string, 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent'> = {
  AGENT_DECISION: 'brand',
  POLICY_RESULT: 'accent',
  TOOL_CALLED: 'neutral',
  TOOL_RESULT: 'neutral',
  STATE_CHECK: 'warning',
  HUMAN_REVIEW: 'warning',
  FINAL_OUTCOME: 'success',
};

export default function AuditTrailPage({ data }: { data: DashboardData }) {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [txnSearch, setTxnSearch] = useState('');

  const eventTypes: AuditEventType[] = [
    'AGENT_DECISION',
    'POLICY_RESULT',
    'TOOL_CALLED',
    'TOOL_RESULT',
    'STATE_CHECK',
    'HUMAN_REVIEW',
    'FINAL_OUTCOME',
  ];

  const filtered = useMemo(() => {
    let events: AuditEvent[] = data.auditEvents;
    if (eventTypeFilter !== 'all') {
      events = events.filter((e) => e.event_type === eventTypeFilter);
    }
    if (txnSearch.trim()) {
      const q = txnSearch.toLowerCase();
      events = events.filter((e) => e.transaction_id.toLowerCase().includes(q));
    }
    return events.slice(0, 300);
  }, [data.auditEvents, eventTypeFilter, txnSearch]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Audit Trail"
        subtitle={`${data.auditEvents.length.toLocaleString()} audit events · Append-only · Immutable`}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="input min-w-[180px]"
        >
          <option value="all">All Event Types</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by transaction ID..."
          value={txnSearch}
          onChange={(e) => setTxnSearch(e.target.value)}
          className="input flex-1"
        />
      </div>

      {/* Event list */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-800 text-ink-500 text-xs">
                <th className="text-left font-medium px-4 py-3">Timestamp</th>
                <th className="text-left font-medium px-4 py-3">Event Type</th>
                <th className="text-left font-medium px-4 py-3">Transaction</th>
                <th className="text-left font-medium px-4 py-3">Decision</th>
                <th className="text-left font-medium px-4 py-3 max-w-xs">Reason</th>
                <th className="text-center font-medium px-4 py-3">Confidence</th>
                <th className="text-center font-medium px-4 py-3">Policy</th>
                <th className="text-left font-medium px-4 py-3">Tool</th>
                <th className="text-left font-medium px-4 py-3">Idempotency Key</th>
                <th className="text-left font-medium px-4 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.event_id} className="border-b border-ink-800/50 hover:bg-ink-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-ink-500 whitespace-nowrap">
                    {new Date(event.timestamp).toLocaleString('en-IN', { hour12: false })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={EVENT_VARIANTS[event.event_type] ?? 'neutral'}>
                      {event.event_type.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-300">{event.transaction_id}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-400 capitalize">
                    {event.agent_decision ? event.agent_decision.replace(/_/g, ' ') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-500 truncate max-w-xs">{event.reason ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-ink-400 tabular-nums">
                    {event.confidence != null ? `${(event.confidence * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {event.policy_approved != null ? (
                      <Badge variant={event.policy_approved ? 'success' : 'danger'}>
                        {event.policy_approved ? '✓' : '✗'}
                      </Badge>
                    ) : (
                      <span className="text-ink-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-400">
                    {event.tool_called ? event.tool_called.replace(/_/g, ' ') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-ink-500">
                    {event.idempotency_key ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-400">{event.final_outcome ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-ink-500 text-sm">
            <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No audit events match your filters.
          </div>
        )}
        {filtered.length === 300 && (
          <div className="py-3 text-center text-xs text-ink-500 border-t border-ink-800">
            Showing first 300 events. Refine filters to see more.
          </div>
        )}
      </div>
    </div>
  );
}
