import { useState, useEffect, type ReactNode } from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Bot,
  UserCheck,
  ScrollText,
  BarChart3,
  PlayCircle,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import { getDashboardData, type DashboardData } from '@/lib/dataService';
import OverviewPage from '@/pages/OverviewPage';
import TransactionsPage from '@/pages/TransactionsPage';
import AgentDecisionsPage from '@/pages/AgentDecisionsPage';
import HumanReviewPage from '@/pages/HumanReviewPage';
import AuditTrailPage from '@/pages/AuditTrailPage';
import EvaluationPage from '@/pages/EvaluationPage';
import SimulationPage from '@/pages/SimulationPage';

type PageId = 'overview' | 'transactions' | 'agent' | 'review' | 'audit' | 'evaluation' | 'simulation';

const NAV_ITEMS: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'agent', label: 'Agent Decisions', icon: Bot },
  { id: 'review', label: 'Human Review', icon: UserCheck },
  { id: 'audit', label: 'Audit Trail', icon: ScrollText },
  { id: 'evaluation', label: 'Evaluation', icon: BarChart3 },
  { id: 'simulation', label: 'Simulation', icon: PlayCircle },
];

function App() {
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    getDashboardData().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  const handlePageChange = (page: PageId) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  const renderPage = (): ReactNode => {
    if (loading || !data) return <LoadingScreen />;
    switch (activePage) {
      case 'overview': return <OverviewPage data={data} />;
      case 'transactions': return <TransactionsPage data={data} />;
      case 'agent': return <AgentDecisionsPage data={data} />;
      case 'review': return <HumanReviewPage data={data} />;
      case 'audit': return <AuditTrailPage data={data} />;
      case 'evaluation': return <EvaluationPage data={data} />;
      case 'simulation': return <SimulationPage data={data} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-ink-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-ink-900 border-r border-ink-800 flex flex-col z-40 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5 border-b border-ink-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-ink-100 text-sm leading-tight">RazorRecover</h1>
              <p className="text-[10px] text-ink-500 leading-tight">AI Revenue Recovery</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handlePageChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-brand-600/15 text-brand-400 border border-brand-500/20'
                    : 'text-ink-400 hover:text-ink-200 hover:bg-ink-800/50 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-ink-800">
          <div className="flex items-center gap-2 text-[10px] text-ink-500">
            <ShieldCheck className="w-3.5 h-3.5 text-success-500" />
            <span>Guardrails Active · Synthetic Data</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-ink-800 bg-ink-900 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-ink-800 text-ink-300"
          >
            <LayoutDashboard className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-ink-200">RazorRecover</span>
          <div className="w-9" />
        </header>

        <div className="flex-1 p-4 lg:p-6 max-w-[1400px] w-full mx-auto">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center animate-pulse-soft">
        <Activity className="w-6 h-6 text-white" />
      </div>
      <div className="text-center">
        <p className="text-ink-200 font-medium text-sm">Generating synthetic dataset...</p>
        <p className="text-ink-500 text-xs mt-1">Training ML model · Running recovery engine</p>
      </div>
    </div>
  );
}

export default App;
