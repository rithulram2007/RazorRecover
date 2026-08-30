import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h2 className="text-xl font-semibold text-ink-100">{title}</h2>
        <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  accent?: 'brand' | 'success' | 'warning' | 'danger' | 'accent';
}

export function MetricCard({ label, value, subValue, icon, trend, accent = 'brand' }: MetricCardProps) {
  const accentColors: Record<string, string> = {
    brand: 'text-brand-400 bg-brand-500/10',
    success: 'text-success-400 bg-success-500/10',
    warning: 'text-warning-400 bg-warning-500/10',
    danger: 'text-danger-400 bg-danger-500/10',
    accent: 'text-accent-400 bg-accent-500/10',
  };

  const trendColors = {
    up: 'text-success-400',
    down: 'text-danger-400',
    neutral: 'text-ink-500',
  };

  return (
    <div className="card card-hover p-5 animate-slide-up">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentColors[accent]}`}>
          {icon}
        </div>
        {subValue && trend && (
          <span className={`text-xs font-medium ${trendColors[trend]}`}>{subValue}</span>
        )}
      </div>
      <p className="text-2xl font-bold text-ink-100 tabular-nums">{value}</p>
      <p className="text-xs text-ink-500 mt-1">{label}</p>
    </div>
  );
}

interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'brand' | 'neutral' | 'accent';
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  const variants: Record<string, string> = {
    success: 'bg-success-500/15 text-success-400 border border-success-500/20',
    warning: 'bg-warning-500/15 text-warning-400 border border-warning-500/20',
    danger: 'bg-danger-500/15 text-danger-400 border border-danger-500/20',
    brand: 'bg-brand-500/15 text-brand-400 border border-brand-500/20',
    accent: 'bg-accent-500/15 text-accent-400 border border-accent-500/20',
    neutral: 'bg-ink-800 text-ink-400 border border-ink-700',
  };
  return <span className={`badge ${variants[variant]}`}>{children}</span>;
}
