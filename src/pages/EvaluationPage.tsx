import { BarChart3, TrendingUp, Bot, DollarSign } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { DashboardData } from '@/lib/dataService';
import { formatMoney, formatNumber, formatPercent } from '@/lib/dataService';
import { PageHeader, Badge } from '@/components/ui';

export default function EvaluationPage({ data }: { data: DashboardData }) {
  const { evaluation } = data;
  if (!evaluation) return null;

  const ml = evaluation.ml;
  const biz = evaluation.business;
  const agent = evaluation.agent;

  const mlChartData = [
    { metric: 'Precision', value: ml.precision * 100 },
    { metric: 'Recall', value: ml.recall * 100 },
    { metric: 'F1', value: ml.f1 * 100 },
    { metric: 'ROC-AUC', value: ml.roc_auc * 100 },
  ];

  const agentChartData = [
    { metric: 'Valid Actions', value: agent.valid_action_rate * 100 },
    { metric: 'Guardrail Violations', value: agent.guardrail_violation_rate * 100 },
    { metric: 'Correct Escalations', value: agent.correct_escalation_rate * 100 },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Evaluation"
        subtitle={`Actual metrics from ${evaluation.sample_count.toLocaleString()} held-out test transactions`}
        actions={<Badge variant="neutral">{evaluation.split.toUpperCase()} SET</Badge>}
      />

      {/* ML Metrics */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-ink-200">ML Metrics — Recovery Probability Model</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mlChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="metric" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(v) => `${Number(v).toFixed(1)}%`}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-5">
            <div className="space-y-3">
              <MetricRow label="Precision" value={formatPercent(ml.precision)} description="Of predicted recoveries, how many actually recovered" />
              <MetricRow label="Recall" value={formatPercent(ml.recall)} description="Of actual recoveries, how many we predicted" />
              <MetricRow label="F1 Score" value={formatPercent(ml.f1)} description="Harmonic mean of precision and recall" />
              <MetricRow label="ROC-AUC" value={formatPercent(ml.roc_auc)} description="Ranking quality across thresholds" />
              <MetricRow label="Sample Count" value={formatNumber(ml.sample_count)} description="Held-out test set size" />
            </div>
          </div>
        </div>
      </div>

      {/* Business Metrics */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-success-400" />
          <h3 className="text-sm font-semibold text-ink-200">Business Metrics — Recovery Simulation</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Revenue" value={formatMoney(biz.total_revenue)} />
          <StatCard label="Revenue at Risk" value={formatMoney(biz.revenue_at_risk)} variant="danger" />
          <StatCard label="Revenue Recovered" value={formatMoney(biz.revenue_recovered)} variant="success" />
          <StatCard label="Recovery Rate" value={formatPercent(biz.recovery_rate)} variant="brand" />
          <StatCard label="Transactions Analyzed" value={formatNumber(biz.transactions_analyzed)} />
          <StatCard label="Transactions Recovered" value={formatNumber(biz.transactions_recovered)} variant="success" />
          <StatCard label="Interventions Attempted" value={formatNumber(biz.interventions_attempted)} />
          <StatCard label="False Intervention Cost" value={formatMoney(biz.false_intervention_cost)} variant="warning" />
          <StatCard label="Escalation Count" value={formatNumber(biz.escalation_count)} variant="warning" />
          <StatCard label="Escalation Rate" value={formatPercent(biz.escalation_rate)} variant="warning" />
          <StatCard label="Stopped Cases" value={formatNumber(biz.stopped_count)} />
          <StatCard label="Failed Interventions" value={formatNumber(biz.failed_interventions)} variant="danger" />
          <StatCard label="Avg Recovery Attempts" value={biz.average_recovery_attempts.toFixed(2)} />
        </div>
      </div>

      {/* Agent Metrics */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-accent-400" />
          <h3 className="text-sm font-semibold text-ink-200">Agent Metrics — Decision Quality</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={agentChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="metric" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(v) => `${Number(v).toFixed(1)}%`}
                />
                <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-5">
            <div className="space-y-3">
              <MetricRow label="Valid Action Rate" value={formatPercent(agent.valid_action_rate)} description="Agent outputs that passed schema validation" />
              <MetricRow label="Invalid Output Rate" value={formatPercent(agent.invalid_output_rate)} description="Agent outputs that fell back to deterministic" />
              <MetricRow label="Guardrail Violation Rate" value={formatPercent(agent.guardrail_violation_rate)} description="Actions rejected by the policy engine" />
              <MetricRow label="Successful Tool Executions" value={formatNumber(agent.successful_tool_executions)} description="Tool calls that completed successfully" />
              <MetricRow label="Correct Escalation Rate" value={formatPercent(agent.correct_escalation_rate)} description="Escalations that were appropriate" />
              <MetricRow label="Total Decisions" value={formatNumber(agent.total_decisions)} description="Total agent decisions evaluated" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-500">
        <BarChart3 className="w-3.5 h-3.5" />
        <span>All metrics computed from actual simulation results. No fabricated numbers.</span>
      </div>
    </div>
  );
}

function MetricRow({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-ink-800/50 last:border-0">
      <div>
        <p className="text-sm text-ink-200 font-medium">{label}</p>
        <p className="text-xs text-ink-500">{description}</p>
      </div>
      <p className="text-lg font-bold text-ink-100 tabular-nums">{value}</p>
    </div>
  );
}

function StatCard({ label, value, variant = 'neutral' }: { label: string; value: string; variant?: 'neutral' | 'success' | 'danger' | 'warning' | 'brand' }) {
  const colors: Record<string, string> = {
    neutral: 'text-ink-100',
    success: 'text-success-400',
    danger: 'text-danger-400',
    warning: 'text-warning-400',
    brand: 'text-brand-400',
  };
  return (
    <div className="card card-hover p-4">
      <p className={`text-lg font-bold tabular-nums ${colors[variant]}`}>{value}</p>
      <p className="text-xs text-ink-500 mt-1">{label}</p>
    </div>
  );
}
