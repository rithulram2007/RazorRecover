import {
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Users,
  Ban,
  Percent,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { DashboardData } from '@/lib/dataService';
import { formatMoney, formatNumber, formatPercent } from '@/lib/dataService';
import { PageHeader, MetricCard, Badge } from '@/components/ui';

const CHART_COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function OverviewPage({ data }: { data: DashboardData }) {
  const { evaluation, outcomes } = data;
  if (!evaluation) return null;

  const biz = evaluation.business;

  // Revenue over time chart data — bucket by transaction timestamp
  const timeData = buildTimeSeriesData(outcomes);

  // Recovery by payment method
  const methodData = buildMethodData(outcomes);

  // Recovery by failure reason
  const failureData = buildFailureData(outcomes);

  // Recovery outcomes pie
  const outcomeData = buildOutcomeData(outcomes);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Overview"
        subtitle="Revenue recovery performance across all synthetic transactions"
      />

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <MetricCard
          label="Revenue at Risk"
          value={formatMoney(biz.revenue_at_risk)}
          icon={<TrendingDown className="w-5 h-5" />}
          accent="danger"
        />
        <MetricCard
          label="Revenue Recovered"
          value={formatMoney(biz.revenue_recovered)}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="success"
          trend="up"
        />
        <MetricCard
          label="Recovery Rate"
          value={formatPercent(biz.recovery_rate)}
          icon={<Percent className="w-5 h-5" />}
          accent="brand"
        />
        <MetricCard
          label="Transactions Recovered"
          value={formatNumber(biz.transactions_recovered)}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="success"
        />
        <MetricCard
          label="Human Escalations"
          value={formatNumber(biz.escalation_count)}
          icon={<Users className="w-5 h-5" />}
          accent="warning"
        />
        <MetricCard
          label="Blocked Actions"
          value={formatNumber(evaluation.agent.guardrail_violation_rate > 0 ? Math.round(evaluation.agent.guardrail_violation_rate * evaluation.agent.total_decisions) : 0)}
          icon={<Ban className="w-5 h-5" />}
          accent="accent"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-200 mb-4">Revenue at Risk Over Time</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={timeData}>
              <defs>
                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="recovGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v) => formatMoney(Number(v))}
              />
              <Area type="monotone" dataKey="atRisk" stroke="#ef4444" fill="url(#riskGrad)" strokeWidth={2} name="At Risk" />
              <Area type="monotone" dataKey="recovered" stroke="#22c55e" fill="url(#recovGrad)" strokeWidth={2} name="Recovered" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-200 mb-4">Recovery Outcomes</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={outcomeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                {outcomeData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-3 justify-center">
            {outcomeData.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-xs text-ink-400">{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-200 mb-4">Recovery by Payment Method</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={methodData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}`} />
              <YAxis type="category" dataKey="method" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={80} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v) => formatMoney(Number(v))}
              />
              <Bar dataKey="recovered" fill="#22c55e" radius={[0, 4, 4, 0]} name="Recovered" />
              <Bar dataKey="atRisk" fill="#ef4444" radius={[0, 4, 4, 0]} name="At Risk" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-200 mb-4">Recovery by Failure Reason</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={failureData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="reason" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} width={120} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v) => formatMoney(Number(v))}
              />
              <Bar dataKey="recovered" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Recovered" />
              <Bar dataKey="atRisk" fill="#f59e0b" radius={[0, 4, 4, 0]} name="At Risk" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-500">
        <Badge variant="neutral">SYNTHETIC DATA</Badge>
        <span>All metrics computed from actual simulation results on {evaluation.sample_count.toLocaleString()} held-out test transactions.</span>
      </div>
    </div>
  );
}

function buildTimeSeriesData(outcomes: DashboardData['outcomes']) {
  const buckets: Record<string, { atRisk: number; recovered: number }> = {};
  for (const o of outcomes) {
    const date = new Date(o.transaction.timestamp);
    const label = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    if (!buckets[label]) buckets[label] = { atRisk: 0, recovered: 0 };
    buckets[label].atRisk += o.transaction.amount;
    if (o.finalOutcome === 'recovered') buckets[label].recovered += o.transaction.amount;
  }
  return Object.entries(buckets)
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .slice(-12)
    .map(([label, v]) => ({ label, ...v }));
}

function buildMethodData(outcomes: DashboardData['outcomes']) {
  const map: Record<string, { atRisk: number; recovered: number }> = {};
  for (const o of outcomes) {
    const m = o.transaction.payment_method;
    if (!map[m]) map[m] = { atRisk: 0, recovered: 0 };
    map[m].atRisk += o.transaction.amount;
    if (o.finalOutcome === 'recovered') map[m].recovered += o.transaction.amount;
  }
  return Object.entries(map).map(([method, v]) => ({ method, ...v }));
}

function buildFailureData(outcomes: DashboardData['outcomes']) {
  const map: Record<string, { atRisk: number; recovered: number }> = {};
  for (const o of outcomes) {
    const r = o.diagnosis.category.replace(/_/g, ' ');
    if (!map[r]) map[r] = { atRisk: 0, recovered: 0 };
    map[r].atRisk += o.transaction.amount;
    if (o.finalOutcome === 'recovered') map[r].recovered += o.transaction.amount;
  }
  return Object.entries(map).map(([reason, v]) => ({ reason, ...v }));
}

function buildOutcomeData(outcomes: DashboardData['outcomes']) {
  const counts: Record<string, number> = {};
  for (const o of outcomes) {
    const label = o.finalOutcome.charAt(0).toUpperCase() + o.finalOutcome.slice(1);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}
