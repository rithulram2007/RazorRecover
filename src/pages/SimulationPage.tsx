import { useState } from 'react';
import { PlayCircle, Loader2, CheckCircle2 } from 'lucide-react';
import type { DashboardData, } from '@/lib/dataService';
import { runSimulation, formatMoney, formatNumber, formatPercent } from '@/lib/dataService';
import { PageHeader, Badge } from '@/components/ui';
import type { SimulationSummary } from '@/types';

const BATCH_OPTIONS = [100, 500, 1000, 5000];

export default function SimulationPage({ data }: { data: DashboardData }) {
  const [batchSize, setBatchSize] = useState(500);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationSummary | null>(data.lastSimulation);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const summary = await runSimulation(batchSize);
      setResult(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Revenue Recovery Simulation"
        subtitle="Run a batch recovery simulation on at-risk transactions with real outcomes"
      />

      {/* Controls */}
      <div className="card p-5 mb-6">
        <h3 className="text-sm font-semibold text-ink-200 mb-4">Configuration</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <label className="text-xs text-ink-500 mb-2 block">Batch Size (at-risk transactions)</label>
            <div className="flex gap-2">
              {BATCH_OPTIONS.map((size) => (
                <button
                  key={size}
                  onClick={() => setBatchSize(size)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    batchSize === size
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink-800 text-ink-400 hover:bg-ink-700'
                  }`}
                >
                  {size.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed mt-6 sm:mt-0"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                Run Simulation
              </>
            )}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
          <Badge variant="neutral">SEED: 42</Badge>
          <Badge variant="neutral">SIMULATOR</Badge>
          <span>Reproducible · All outcomes from actual simulation</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 mb-4 border-danger-500/30 bg-danger-500/5">
          <p className="text-sm text-danger-400">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && !running && (
        <div className="animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-success-400" />
            <h3 className="text-sm font-semibold text-ink-200">Simulation Results</h3>
            <span className="text-xs text-ink-500">· {(result.duration_ms / 1000).toFixed(2)}s</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <ResultCard label="Transactions Analyzed" value={formatNumber(result.transactions_analyzed)} />
            <ResultCard label="Revenue at Risk" value={formatMoney(result.revenue_at_risk)} variant="danger" />
            <ResultCard label="Revenue Recovered" value={formatMoney(result.revenue_recovered)} variant="success" />
            <ResultCard label="Recovery Percentage" value={formatPercent(result.recovery_percentage / 100)} variant="brand" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <ResultCard label="Interventions Attempted" value={formatNumber(result.interventions_attempted)} />
            <ResultCard label="Successful Recoveries" value={formatNumber(result.successful_recoveries)} variant="success" />
            <ResultCard label="Escalations" value={formatNumber(result.escalations)} variant="warning" />
            <ResultCard label="Stopped Cases" value={formatNumber(result.stopped_cases)} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <ResultCard label="Failed Interventions" value={formatNumber(result.failed_interventions)} variant="danger" />
            <ResultCard label="Duration" value={`${(result.duration_ms / 1000).toFixed(2)}s`} />
            <ResultCard label="Seed" value={String(result.seed)} />
          </div>

          {/* Progress bar */}
          <div className="card p-5 mt-4">
            <h4 className="text-xs text-ink-500 mb-2">Recovery Rate</h4>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-ink-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-success-500 to-success-400 rounded-full transition-all duration-500"
                  style={{ width: `${result.recovery_percentage}%` }}
                />
              </div>
              <span className="text-lg font-bold text-success-400 tabular-nums">
                {result.recovery_percentage.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-ink-500 mt-2">
              <span>{formatMoney(result.revenue_recovered)} recovered</span>
              <span>{formatMoney(result.revenue_at_risk)} at risk</span>
            </div>
          </div>
        </div>
      )}

      {!result && !running && !error && (
        <div className="card p-12 text-center">
          <PlayCircle className="w-10 h-10 mx-auto mb-3 text-ink-600" />
          <p className="text-ink-400 text-sm">Run a simulation to see recovery results.</p>
          <p className="text-ink-600 text-xs mt-1">All numbers come from actual simulation outcomes.</p>
        </div>
      )}
    </div>
  );
}

function ResultCard({ label, value, variant = 'neutral' }: { label: string; value: string; variant?: 'neutral' | 'success' | 'danger' | 'warning' | 'brand' }) {
  const colors: Record<string, string> = {
    neutral: 'text-ink-100',
    success: 'text-success-400',
    danger: 'text-danger-400',
    warning: 'text-warning-400',
    brand: 'text-brand-400',
  };
  return (
    <div className="card card-hover p-4">
      <p className={`text-xl font-bold tabular-nums ${colors[variant]}`}>{value}</p>
      <p className="text-xs text-ink-500 mt-1">{label}</p>
    </div>
  );
}
