/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Phosphor 的条件导出在 ESLint project service 中被识别为 error type，tsc 已独立校验。 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ThemeToggle } from '@/components/theme-toggle';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise';
import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp';
import { FlaskIcon } from '@phosphor-icons/react/Flask';
import { GearSixIcon } from '@phosphor-icons/react/GearSix';
import { HouseIcon } from '@phosphor-icons/react/House';
import { RobotIcon } from '@phosphor-icons/react/Robot';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { StrategyIcon } from '@phosphor-icons/react/Strategy';
import { UploadSimpleIcon } from '@phosphor-icons/react/UploadSimple';
import { desktopPathForView, desktopRoutes, type DesktopNavigationView } from '../views.js';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'stale';
type PortfolioMode = 'actual' | 'shadow';
interface Position {
  id: string;
  accountId: string;
  symbol: string;
  quantity: number;
  costPrice: number;
  marketValue: number | null;
  pnl: number | null;
  stale: boolean;
  source?: string;
  asset: { name: string };
}
interface Portfolio {
  totalMarketValue: number;
  totalCost: number;
  totalPnl: number;
  cashValue?: number;
  mode?: 'actual' | 'shadow';
  partial: boolean;
  valuedAt: string;
  positions: Position[];
}
interface Account {
  id: string;
  name: string;
  institution?: string | null;
  type: 'securities' | 'fund' | 'cash';
  mode: 'actual' | 'shadow';
  currency: 'CNY' | 'HKD' | 'USD';
  active?: boolean;
}
interface ImportRow {
  rawSymbol: string;
  rawName?: string;
  assetType?: 'stock' | 'etf' | 'fund';
  symbol?: string;
  matchStatus: 'matched' | 'ambiguous' | 'unmatched';
  matchCandidates: string[];
  quantity?: number;
  costPrice?: number;
  marketPrice?: number;
  marketValue?: number;
  profit?: number;
  profitRate?: number;
  confidence: number;
  rawText: Record<string, string>;
  issues: string[];
}
interface ImportDraftRecord {
  id: string;
  accountId: string;
  source: 'alipay' | 'ths' | 'broker' | 'bank' | 'fund-platform' | 'unknown';
  sourceConfidence: number;
  status: 'pending' | 'reviewed' | 'committed' | 'cancelled';
  rows: ImportRow[];
  createdAt: string;
}
type ImportStep = 'account' | 'position' | 'screenshot';
type OnboardingNavigationOptions = { step?: ImportStep };
interface RiskRuleRecord {
  id: string;
  version: number;
  kind: string;
  scope: 'security' | 'account' | 'portfolio';
  severity: 'info' | 'warning' | 'error' | 'critical';
  threshold: number;
  enabled: boolean;
  symbol: string | null;
  accountId: string | null;
  effectiveAt: string;
}
interface RiskEventRecord {
  id: string;
  ruleId: string;
  ruleVersion: number;
  severity: string;
  message: string;
  symbol: string | null;
  marketTime: string | null;
  evaluatedAt: string;
  context: Record<string, unknown>;
}
interface NotificationRecord {
  id: string;
  eventId: string;
  channel: string;
  severity: string;
  status: string;
  attemptCount: number;
  scheduledAt: string;
  lastError: string | null;
}
interface SnapshotRecord {
  id: string;
  capturedAt: string;
  marketValue: number;
  costValue: number;
  cashValue: number;
}
interface PerformanceAllocationRecord {
  category: string;
  value: number;
  weight: number;
}
interface RebalanceGapRecord {
  category: string;
  currentWeight: number;
  targetWeight: number;
  weightGap: number;
  amountGap: number;
  direction: 'increase' | 'decrease' | 'balanced';
}
interface PerformanceLayerRecord {
  accountId: string;
  symbol: string;
  assetType: string;
  costValue: number;
  marketValue: number | null;
  unrealizedPnl: number | null;
}

interface OnboardingProviderRecord {
  enabled?: boolean;
  health?: string;
  capabilities?: unknown;
}

interface OnboardingAutomationRecord {
  enabled?: boolean;
}

interface OnboardingRiskRuleRecord {
  enabled?: boolean;
}

const navIcons: Record<DesktopNavigationView, typeof HouseIcon> = {
  portfolio: HouseIcon,
  'position-entry': UploadSimpleIcon,
  'risk-center': ShieldCheckIcon,
  performance: ChartLineUpIcon,
  strategy: StrategyIcon,
  journal: FlaskIcon,
  'ai-chat': RobotIcon,
  providers: GearSixIcon,
};

const nav = desktopRoutes.map((route) => ({ ...route, icon: navIcons[route.view] }));

const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});

const formText = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

const displayValue = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '不可用';

function LegacyImportReviewRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const step = params.get('step');
  if (step === 'position') params.set('method', 'manual');
  if (step === 'screenshot') params.set('method', 'screenshot');
  const search = params.toString();
  return (
    <Navigate
      to={{ pathname: '/position-entry', ...(search ? { search: `?${search}` } : {}) }}
      replace
    />
  );
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>('loading');
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>('actual');
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const loadSequence = useRef(0);

  const navigateTo = (nextView: DesktopNavigationView, options?: OnboardingNavigationOptions) => {
    const path = desktopPathForView(nextView);
    if (!path) return;
    const params = new URLSearchParams(location.search);
    if (nextView === 'position-entry' && options?.step) params.set('step', options.step);
    if (nextView !== 'position-entry') {
      params.delete('step');
      params.delete('accountId');
    }
    const search = params.toString();
    void navigate({ pathname: path, ...(search ? { search: `?${search}` } : {}) });
  };

  const load = async (requestedMode: PortfolioMode = portfolioMode) => {
    const sequence = ++loadSequence.current;
    setState('loading');
    try {
      const [portfolioResponse, accountsResponse] = await Promise.all([
        fetch('/api/v1/portfolio/valuation?mode=' + requestedMode),
        fetch('/api/v1/accounts'),
      ]);
      if (!portfolioResponse.ok || !accountsResponse.ok)
        throw new Error(`HTTP ${portfolioResponse.status}/${accountsResponse.status}`);
      const data = (await portfolioResponse.json()) as Portfolio;
      const nextAccounts = (await accountsResponse.json()) as Account[];
      if (sequence !== loadSequence.current) return;
      setPortfolio(data);
      setAccounts(nextAccounts);
      setState(data.positions.length === 0 ? 'empty' : data.partial ? 'stale' : 'ready');
    } catch {
      if (sequence === loadSequence.current) setState('error');
    }
  };
  useEffect(() => {
    void load(portfolioMode);
  }, [portfolioMode]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">IO</span>
          <span>ThesisLedger</span>
        </div>
        <nav aria-label="主导航">
          {nav.map(({ view: item, path, label, icon: Icon }) => (
            <NavLink
              key={item}
              to={{ pathname: path, search: location.search }}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  <Icon size={19} weight={isActive ? 'fill' : 'regular'} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="connection-status">
            <span className="status-dot" />
            系统已连接
          </span>
          <ThemeToggle />
        </div>
      </aside>
      <main className="content">
        <div className="content-theme-toggle">
          <ThemeToggle />
        </div>
        <Routes>
          <Route path="/" element={<Navigate to="/portfolio" replace />} />
          <Route
            path="/portfolio"
            element={
              <PortfolioDashboard
                state={state}
                portfolio={portfolio}
                accounts={accounts}
                mode={portfolioMode}
                onModeChange={setPortfolioMode}
                onRetry={() => void load()}
                onNavigate={navigateTo}
              />
            }
          />
          <Route path="/import-review" element={<LegacyImportReviewRedirect />} />
          <Route
            path="/position-entry"
            element={
              <ImportReview
                accounts={accounts}
                positions={portfolio?.positions ?? []}
                cashValue={portfolio?.cashValue ?? 0}
                onPortfolioChanged={() => void load()}
              />
            }
          />
          <Route
            path="/risk-center"
            element={<RiskCenter accounts={accounts} portfolio={portfolio} />}
          />
          <Route path="/performance" element={<PerformanceDashboard accounts={accounts} />} />
          <Route path="/strategy" element={<StrategyDashboard />} />
          <Route path="/journal" element={<JournalDashboard />} />
          <Route path="/ai-chat" element={<AiChat />} />
          <Route path="/providers" element={<ProviderSettings />} />
          <Route path="*" element={<Navigate to="/portfolio" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function StrategyDashboard() {
  const [strategies, setStrategies] = useState<
    Array<{ id: string; name: string; versions: Array<{ id: string; version: number }> }>
  >([]);
  const [jobs, setJobs] = useState<
    Array<{
      id: string;
      strategyVersionId: string;
      status: string;
      progress: number;
      result: unknown;
      warnings: unknown;
    }>
  >([]);
  const [name, setName] = useState('我的第一条策略');
  const [schemaText, setSchemaText] = useState('');
  const [message, setMessage] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const defaultSchema = {
    version: 1,
    name: '我的第一条策略',
    universe: { symbols: ['600519.SH'], asOf: new Date().toISOString() },
    entrySignals: [{ indicator: 'close', operator: 'gt', value: 10 }],
    exitSignals: [{ indicator: 'close', operator: 'lt', value: 9 }],
    stopLoss: { type: 'fixed', value: 0.1 },
    sizing: { type: 'weight', value: 0.5 },
    execution: { price: 'close', tPlusOne: true, lotSize: 100 },
    cost: {
      commissionRate: 0.0003,
      minimumCommission: 5,
      stampDutyRate: 0.0005,
      slippageRate: 0.001,
    },
    riskConstraints: [],
    benchmark: '000300.SH',
  };
  useEffect(() => {
    if (!schemaText) setSchemaText(JSON.stringify(defaultSchema, null, 2));
  }, [schemaText]);
  const load = async () => {
    const sequence = ++loadSequence.current;
    setLoadState('loading');
    try {
      const [strategyResponse, jobResponse] = await Promise.all([
        fetch('/api/v1/backtests/strategies'),
        fetch('/api/v1/backtests/jobs'),
      ]);
      if (!strategyResponse.ok || !jobResponse.ok) throw new Error('backtest');
      const [nextStrategies, nextJobs] = await Promise.all([
        strategyResponse.json() as Promise<typeof strategies>,
        jobResponse.json() as Promise<typeof jobs>,
      ]);
      if (sequence !== loadSequence.current) return;
      setStrategies(nextStrategies);
      setJobs(nextJobs);
      setLoadState(nextStrategies.length === 0 && nextJobs.length === 0 ? 'empty' : 'ready');
    } catch {
      if (sequence !== loadSequence.current) return;
      setLoadState(strategies.length || jobs.length ? 'stale' : 'error');
      setMessage('策略或任务读取失败。');
    }
  };
  useEffect(() => {
    void load().catch(() => {
      setLoadState(strategies.length || jobs.length ? 'stale' : 'error');
      setMessage('策略或任务读取失败。');
    });
  }, []);
  const createStrategy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await fetch('/api/v1/backtests/strategies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, schema: JSON.parse(schemaText) }),
      });
      if (!response.ok) throw new Error('create');
      setMessage('策略已创建，旧版本不会被覆盖。');
      await load();
    } catch {
      setMessage('策略 JSON 或 Schema 不合法。');
    }
  };
  const queue = async (strategy: (typeof strategies)[number]) => {
    const version = strategy.versions.at(-1);
    if (!version) return;
    let schema: Record<string, unknown>;
    try {
      schema = JSON.parse(schemaText) as Record<string, unknown>;
    } catch {
      setMessage('策略 JSON 或 Schema 不合法。');
      return;
    }
    const universe = schema.universe;
    const symbol =
      universe &&
      typeof universe === 'object' &&
      Array.isArray((universe as { symbols?: unknown }).symbols)
        ? (universe as { symbols: unknown[] }).symbols[0]
        : null;
    let bars: unknown[] = [];
    if (typeof symbol === 'string') {
      const barsResponse = await fetch(
        `/api/v1/market/${encodeURIComponent(symbol)}/bars?timeframe=1d&t=${Date.now()}`,
        { cache: 'no-store' },
      );
      if (barsResponse.ok) bars = (await barsResponse.json()) as unknown[];
    }
    const response = await fetch('/api/v1/backtests/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        strategyVersionId: version.id,
        status: 'queued',
        period: { start: '2025-01-01', end: '2025-01-31' },
        dataAsOf: new Date().toISOString(),
        warnings: [],
        strategy: schema,
        bars,
        initialCash: 100000,
      }),
    });
    setMessage(response.ok ? '回测已排队。' : '回测排队失败。');
    await load();
  };
  const run = async (jobId: string) => {
    await fetch(`/api/v1/backtests/jobs/${jobId}/run`, { method: 'POST' });
    await load();
  };
  const cancel = async (jobId: string) => {
    await fetch(`/api/v1/backtests/jobs/${jobId}/cancel`, { method: 'POST' });
    await load();
  };
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedResult =
    selectedJob?.result && typeof selectedJob.result === 'object'
      ? (selectedJob.result as Record<string, unknown>)
      : null;
  const selectedMetrics =
    selectedResult?.metrics && typeof selectedResult.metrics === 'object'
      ? (selectedResult.metrics as Record<string, unknown>)
      : null;
  const equityCurve = Array.isArray(selectedResult?.equityCurve)
    ? (selectedResult.equityCurve as Array<{ date: string; value: number }>)
    : [];
  const trades = Array.isArray(selectedResult?.trades)
    ? (selectedResult.trades as Array<Record<string, unknown>>)
    : [];
  return (
    <section className="module-page">
      <p className="kicker">Strategy Lab</p>
      <h1>策略实验</h1>
      <p className="page-description">
        策略使用版本化 Schema 与可替换 Worker；回测结果保留数据时点、引擎版本、成本和已知偏差提示。
      </p>
      <Button className="secondary" type="button" variant="outline" onClick={() => void load()}>
        刷新策略任务
      </Button>
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <form className="form-card" onSubmit={(event) => void createStrategy(event)}>
        <h3>新建策略</h3>
        <label>
          名称
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Strategy Schema JSON
          <Textarea
            value={schemaText}
            onChange={(event) => setSchemaText(event.target.value)}
            rows={12}
          />
        </label>
        <Button type="submit" variant="default">
          保存新版本
        </Button>
      </form>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>策略版本</h2>
        </div>
        <div className="edit-list">
          {strategies.map((strategy) => (
            <div key={strategy.id}>
              <span>
                <strong>{strategy.name}</strong>
                <small>
                  {strategy.versions.map((version) => `v${version.version}`).join(' · ')}
                </small>
              </span>
              <Button
                className="text-button"
                size="sm"
                variant="link"
                onClick={() => void queue(strategy)}
              >
                排队回测
              </Button>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>回测任务</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>任务</th>
                <th>状态</th>
                <th>进度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      {job.id.slice(0, 8)}
                    </Button>
                    <span>{job.strategyVersionId.slice(0, 8)}</span>
                  </td>
                  <td>{job.status}</td>
                  <td>{job.progress}%</td>
                  <td>
                    {job.status === 'queued' && (
                      <Button
                        className="text-button"
                        size="sm"
                        variant="link"
                        onClick={() => void run(job.id)}
                      >
                        运行
                      </Button>
                    )}
                    {!['succeeded', 'failed', 'cancelled'].includes(job.status) && (
                      <Button
                        className="text-button danger"
                        size="sm"
                        variant="destructive"
                        onClick={() => void cancel(job.id)}
                      >
                        取消
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selectedJob && (
        <section className="panel" aria-live="polite">
          <div className="panel-heading">
            <h2>回测结果 · {selectedJob.id.slice(0, 8)}</h2>
            <p>权益曲线、回撤和交易明细来自已保存的可复现结果。</p>
          </div>
          {!selectedResult ? (
            <p className="empty-state">任务尚未完成，运行后可查看结果。</p>
          ) : (
            <>
              <div className="metrics">
                <Metric
                  label="最终资产"
                  value={
                    typeof selectedResult.finalValue === 'number'
                      ? money.format(selectedResult.finalValue)
                      : '暂无'
                  }
                />
                <Metric
                  label="累计收益"
                  value={
                    typeof selectedMetrics?.cumulativeReturn === 'number'
                      ? `${(selectedMetrics.cumulativeReturn * 100).toFixed(2)}%`
                      : '暂无'
                  }
                />
                <Metric
                  label="最大回撤"
                  value={
                    typeof selectedMetrics?.maxDrawdown === 'number'
                      ? `${(selectedMetrics.maxDrawdown * 100).toFixed(2)}%`
                      : '暂无'
                  }
                  tone="negative"
                />
                <Metric
                  label="交易胜率"
                  value={
                    typeof selectedMetrics?.tradeWinRate === 'number'
                      ? `${(selectedMetrics.tradeWinRate * 100).toFixed(2)}%`
                      : '暂无'
                  }
                />
              </div>
              <div className="module-grid">
                <div>
                  <span>权益曲线</span>
                  <strong>{equityCurve.length} 个数据点</strong>
                </div>
                <div>
                  <span>交易明细</span>
                  <strong>{trades.length} 笔</strong>
                </div>
                <div>
                  <span>引擎</span>
                  <strong>{displayValue(selectedResult.engineVersion ?? '未知')}</strong>
                </div>
                <div>
                  <span>数据时点</span>
                  <strong>{displayValue(selectedResult.dataAsOf ?? '未知')}</strong>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>权益曲线日期</th>
                      <th>组合价值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equityCurve.length === 0 ? (
                      <tr>
                        <td colSpan={2}>当前回测没有权益曲线数据</td>
                      </tr>
                    ) : (
                      equityCurve.slice(-20).map((point) => (
                        <tr key={point.date}>
                          <td>{point.date}</td>
                          <td>{money.format(point.value)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>方向</th>
                      <th>数量</th>
                      <th>价格</th>
                      <th>原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.length === 0 ? (
                      <tr>
                        <td colSpan={5}>暂无交易明细</td>
                      </tr>
                    ) : (
                      trades.map((trade, index) => (
                        <tr key={`${displayValue(trade.date ?? '')}-${index}`}>
                          <td>{displayValue(trade.date ?? '—')}</td>
                          <td>{displayValue(trade.side ?? '—')}</td>
                          <td>{displayValue(trade.quantity ?? '—')}</td>
                          <td>{displayValue(trade.price ?? '—')}</td>
                          <td>{displayValue(trade.reason ?? '—')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </section>
  );
}

function AiChat() {
  const [scope, setScope] = useState<'portfolio' | 'account' | 'position' | 'strategy'>(
    'portfolio',
  );
  const [symbol, setSymbol] = useState('600519.SH');
  const [question, setQuestion] = useState('请收集证据并说明当前主要风险。');
  const [run, setRun] = useState<{
    id: string;
    provider: string;
    model: string;
    promptVersion: string;
  } | null>(null);
  const [history, setHistory] = useState<
    Array<{
      id: string;
      provider: string;
      model: string;
      promptVersion: string;
      status: string;
      context: { scope?: string; symbol?: string } | null;
      createdAt: string;
    }>
  >([]);
  const [message, setMessage] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loadSequence = useRef(0);
  const loadHistory = async () => {
    const sequence = ++loadSequence.current;
    setLoadState('loading');
    try {
      const response = await fetch('/api/v1/ai/runs?limit=20');
      if (!response.ok) throw new Error('ai-history');
      const nextHistory = (await response.json()) as typeof history;
      if (sequence !== loadSequence.current) return;
      setHistory(nextHistory);
      setLoadState(nextHistory.length === 0 ? 'empty' : 'ready');
    } catch {
      if (sequence !== loadSequence.current) return;
      setLoadState(history.length ? 'stale' : 'error');
      setMessage('研究历史读取失败。');
    }
  };
  useEffect(() => {
    void loadHistory();
  }, []);
  const startResearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await fetch('/api/v1/ai/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'mock',
        model: 'research-default',
        promptVersion: 'research-v1',
        context: { scope, ...(scope === 'position' ? { symbol } : {}) },
      }),
    });
    if (!response.ok) {
      setMessage('研究任务创建失败，请检查 Provider 状态。');
      return;
    }
    setRun((await response.json()) as typeof run);
    setMessage(`已记录研究问题：${question}`);
    await loadHistory().catch(() => undefined);
  };
  return (
    <section className="module-page">
      <p className="kicker">Research Assistant</p>
      <h1>研究助手</h1>
      <p className="page-description">
        先选择研究上下文，再由只读 Tool 提供行情、财务、新闻、风险和回测事实；助手不会写入 Ledger
        或生成订单。
      </p>
      <Button
        className="secondary"
        type="button"
        variant="outline"
        onClick={() => void loadHistory()}
      >
        刷新研究历史
      </Button>
      <form className="panel form-card" onSubmit={(event) => void startResearch(event)}>
        <label>
          上下文
          <Select value={scope} onValueChange={(value) => value && setScope(value)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {scope === 'portfolio'
                  ? '全组合'
                  : scope === 'account'
                    ? '账户'
                    : scope === 'position'
                      ? '单个持仓'
                      : '策略版本'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portfolio">全组合</SelectItem>
              <SelectItem value="account">账户</SelectItem>
              <SelectItem value="position">单个持仓</SelectItem>
              <SelectItem value="strategy">策略版本</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {scope === 'position' && (
          <label>
            标的
            <Input value={symbol} onChange={(event) => setSymbol(event.target.value)} />
          </label>
        )}
        <label>
          研究问题
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
          />
        </label>
        <Button type="submit" variant="default">
          创建研究任务
        </Button>
        {message && <p className="form-message">{message}</p>}
      </form>
      <DataStateBanner state={loadState} onRetry={() => void loadHistory()} />
      {run && (
        <section className="panel">
          <div className="panel-heading">
            <h2>研究任务 {run.id.slice(0, 8)}</h2>
            <p>
              {run.provider}/{run.model} · Prompt {run.promptVersion}
            </p>
          </div>
          <div className="module-grid">
            <div>
              <span>上下文</span>
              <strong>{scope}</strong>
            </div>
            <div>
              <span>来源链</span>
              <strong>Tool 调用记录</strong>
            </div>
            <div>
              <span>执行边界</span>
              <strong>只读研究</strong>
            </div>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>研究历史</h2>
          <p>每条任务保留 context metadata，便于区分全组合、账户、持仓和策略研究。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>任务</th>
                <th>上下文</th>
                <th>Provider / Model</th>
                <th>状态</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.id.slice(0, 8)}</strong>
                    <span>{item.promptVersion}</span>
                  </td>
                  <td>
                    {item.context?.scope ?? '未知'}
                    {item.context?.symbol ? ` · ${item.context.symbol}` : ''}
                  </td>
                  <td>
                    {item.provider} / {item.model}
                  </td>
                  <td>{item.status}</td>
                  <td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

interface ReviewTrade {
  symbol: string;
  entryAt: string;
  exitAt: string;
  pnl: number;
  plannedStop?: number;
  actualExit?: number;
  plannedHoldingDays?: number;
  entryPrice?: number;
  exitPrice?: number;
  plannedEntry?: number;
  plannedExit?: number;
  turnover?: number;
  peakWeight?: number;
  targetWeight?: number;
}

type JournalReviewResult = {
  plannedVsActual: unknown;
  behavior: unknown;
  counterfactual: unknown;
  aiRun: { id: string; provider: string; model: string; promptVersion: string } | null;
};

const defaultReviewTrade: ReviewTrade = {
  symbol: '600519.SH',
  entryAt: '2025-01-02T09:30:00.000Z',
  exitAt: '2025-01-06T09:30:00.000Z',
  pnl: -120,
  plannedStop: 1400,
  actualExit: 1388,
  plannedHoldingDays: 2,
  entryPrice: 1450,
  exitPrice: 1388,
  plannedEntry: 1440,
  plannedExit: 1510,
  turnover: 2900,
  peakWeight: 0.18,
  targetWeight: 0.1,
};

const defaultBehaviorTrades: ReviewTrade[] = [
  defaultReviewTrade,
  {
    ...defaultReviewTrade,
    symbol: '000001.SZ',
    entryAt: '2025-01-07T09:30:00.000Z',
    exitAt: '2025-01-08T09:30:00.000Z',
    pnl: 260,
    plannedStop: 10,
    actualExit: 12,
    entryPrice: 10.5,
    exitPrice: 13,
    plannedEntry: 10.5,
    plannedExit: 12.5,
  },
];

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

function JournalDashboard() {
  const [tradeText, setTradeText] = useState(prettyJson(defaultReviewTrade));
  const [tradesText, setTradesText] = useState(prettyJson(defaultBehaviorTrades));
  const [singleReview, setSingleReview] = useState<JournalReviewResult | null>(null);
  const [behaviorReview, setBehaviorReview] = useState<{
    metrics: unknown;
    window: unknown;
    aiRun: JournalReviewResult['aiRun'];
  } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'single' | 'behavior' | null>(null);

  const requestJson = async (url: string, body: unknown) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return (await response.json()) as unknown;
  };

  const startAiExplanation = async (context: unknown) => {
    const record =
      context && typeof context === 'object' ? (context as Record<string, unknown>) : {};
    const trade =
      record.trade && typeof record.trade === 'object'
        ? (record.trade as Record<string, unknown>)
        : undefined;
    const symbol = typeof trade?.symbol === 'string' ? trade.symbol : undefined;
    const response = await fetch('/api/v1/ai/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'mock',
        model: 'behavior-review-default',
        promptVersion: 'journal-review-v1',
        context: { scope: symbol ? 'position' : 'portfolio', ...(symbol ? { symbol } : {}) },
        modelMetadata: { mode: 'deterministic-evidence-only', evidence: context },
      }),
    });
    if (!response.ok) return null;
    return (await response.json()) as JournalReviewResult['aiRun'];
  };

  const reviewSingleTrade = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('single');
    setMessage('');
    try {
      const trade = JSON.parse(tradeText) as ReviewTrade;
      const [plannedVsActual, behavior, counterfactual] = await Promise.all([
        requestJson('/api/v1/journal/analysis/planned-vs-actual', trade),
        requestJson('/api/v1/journal/analysis/behavior', { trades: [trade] }),
        requestJson('/api/v1/journal/analysis/counterfactual', {
          trades: [trade],
          enforceStop: trade.plannedStop !== undefined,
          ...(trade.plannedStop === undefined ? {} : { stopPrice: trade.plannedStop }),
        }),
      ]);
      const aiRun = await startAiExplanation({
        kind: 'single-trade-review',
        trade,
        plannedVsActual,
        behavior,
        counterfactual,
      });
      setSingleReview({ plannedVsActual, behavior, counterfactual, aiRun });
      setMessage(
        aiRun
          ? '单笔复盘完成；AI 解释任务只接收已计算的事实。'
          : '确定性复盘完成；AI Provider 当前不可用。',
      );
    } catch {
      setMessage('复盘失败：请检查交易 JSON 和服务状态。');
    } finally {
      setBusy(null);
    }
  };

  const reviewBehavior = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('behavior');
    setMessage('');
    try {
      const trades = JSON.parse(tradesText) as ReviewTrade[];
      if (!Array.isArray(trades) || trades.length === 0) throw new Error('trades');
      const start = trades.map((trade) => trade.entryAt).sort()[0] ?? new Date().toISOString();
      const end =
        trades
          .map((trade) => trade.exitAt)
          .sort()
          .at(-1) ?? new Date().toISOString();
      const [metrics, window] = await Promise.all([
        requestJson('/api/v1/journal/analysis/behavior', { trades }),
        requestJson('/api/v1/journal/analysis/review', { trades, start, end }),
      ]);
      const aiRun = await startAiExplanation({
        kind: 'behavior-review',
        window: { start, end },
        metrics,
        review: window,
      });
      setBehaviorReview({ metrics, window, aiRun });
      setMessage(
        aiRun
          ? '行为复盘完成；报告引用 Journal/Behavior 的确定性结果。'
          : '确定性行为指标完成；AI Provider 当前不可用。',
      );
    } catch {
      setMessage('行为复盘失败：请检查交易数组 JSON 和服务状态。');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="module-page">
      <p className="kicker">Journal Review</p>
      <h1>投资复盘</h1>
      <p className="page-description">
        先计算计划、执行和行为事实，再交给 AI 做有证据边界的解释；反事实结果会明确假设，不会写入
        Ledger 或生成订单。
      </p>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <form className="panel form-card" onSubmit={(event) => void reviewSingleTrade(event)}>
        <div className="panel-heading">
          <h2>Single Trade Review</h2>
          <p>输入一笔已平仓交易，查看计划偏差、行为指标和止损反事实。</p>
        </div>
        <label>
          CompletedTrade JSON
          <Textarea
            value={tradeText}
            onChange={(event) => setTradeText(event.target.value)}
            rows={12}
            spellCheck={false}
          />
        </label>
        <Button type="submit" variant="default" disabled={busy !== null}>
          {busy === 'single' ? '计算中…' : '分析单笔交易'}
        </Button>
      </form>
      {singleReview && (
        <section className="panel">
          <div className="panel-heading">
            <h2>单笔交易证据</h2>
            <p>以下字段来自 Journal/Behavior API；AI 仅接收这些结构化结果。</p>
          </div>
          <div className="module-grid">
            <div>
              <span>计划与实际</span>
              <pre>{prettyJson(singleReview.plannedVsActual)}</pre>
            </div>
            <div>
              <span>行为指标</span>
              <pre>{prettyJson(singleReview.behavior)}</pre>
            </div>
            <div>
              <span>反事实假设</span>
              <pre>{prettyJson(singleReview.counterfactual)}</pre>
            </div>
          </div>
          <p className="form-message">
            {singleReview.aiRun
              ? `AI 解释任务 ${singleReview.aiRun.id.slice(0, 8)} 已记录（${singleReview.aiRun.promptVersion}）。`
              : 'AI 解释未启动：当前 Provider 不可用。'}
          </p>
        </section>
      )}
      <form className="panel form-card" onSubmit={(event) => void reviewBehavior(event)}>
        <div className="panel-heading">
          <h2>AI Behavior Review</h2>
          <p>输入交易数组，生成明确时间窗口内的行为指标和可追溯解释任务。</p>
        </div>
        <label>
          CompletedTrade[] JSON
          <Textarea
            value={tradesText}
            onChange={(event) => setTradesText(event.target.value)}
            rows={14}
            spellCheck={false}
          />
        </label>
        <Button type="submit" variant="default" disabled={busy !== null}>
          {busy === 'behavior' ? '计算中…' : '生成行为复盘'}
        </Button>
      </form>
      {behaviorReview && (
        <section className="panel">
          <div className="panel-heading">
            <h2>行为复盘结果</h2>
            <p>行为标签不是心理诊断；缺少事实时，结果会保留 insufficient data。</p>
          </div>
          <div className="module-grid">
            <div>
              <span>行为指标</span>
              <pre>{prettyJson(behaviorReview.metrics)}</pre>
            </div>
            <div>
              <span>时间窗口汇总</span>
              <pre>{prettyJson(behaviorReview.window)}</pre>
            </div>
            <div>
              <span>AI 来源边界</span>
              <strong>
                {behaviorReview.aiRun
                  ? `${behaviorReview.aiRun.provider}/${behaviorReview.aiRun.model}`
                  : 'Provider 不可用'}
              </strong>
              <small>只解释已计算的 Journal、Ledger、Risk、Behavior 事实。</small>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

export function ProviderSettings() {
  const [providers, setProviders] = useState<
    Array<{
      name: string;
      type: string;
      enabled: boolean;
      priority: number;
      capabilities: string[];
      health: string;
      credentialConfigured?: boolean;
    }>
  >([]);
  const [issues, setIssues] = useState<
    Array<{
      id: string;
      provider: string;
      symbol: string | null;
      severity: string;
      code: string;
      status: string;
    }>
  >([]);
  const [jobs, setJobs] = useState<
    Array<{ id: string; name: string; type: string; enabled: boolean; nextRunAt: string | null }>
  >([]);
  const [healthHistory, setHealthHistory] = useState<
    Array<{ provider: string; state: string; latencyMs: number | null; checkedAt: string }>
  >([]);
  const [jobHistory, setJobHistory] = useState<
    Array<{ id: string; jobId: string; status: string; startedAt: string; error: string | null }>
  >([]);
  const [notificationFailures, setNotificationFailures] = useState<
    Array<{ id: string; provider: string; status: string; lastError: string | null }>
  >([]);
  const [providerDraft, setProviderDraft] = useState({
    name: 'feishu',
    type: 'notification',
    capabilities: 'notification',
    credentialsRef: '',
  });
  const [message, setMessage] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loadSequence = useRef(0);
  const load = async () => {
    const sequence = ++loadSequence.current;
    setLoadState('loading');
    try {
      const [
        response,
        issueResponse,
        jobsResponse,
        healthResponse,
        historyResponse,
        notificationResponse,
      ] = await Promise.all([
        fetch('/api/v1/providers/config'),
        fetch('/api/v1/data-quality/issues?status=open'),
        fetch('/api/v1/automations'),
        fetch('/api/v1/providers/health/history'),
        fetch('/api/v1/automations/history'),
        fetch('/api/v1/notifications?status=failed'),
      ]);
      if (
        !response.ok ||
        !issueResponse.ok ||
        !jobsResponse.ok ||
        !healthResponse.ok ||
        !historyResponse.ok ||
        !notificationResponse.ok
      )
        throw new Error('providers');
      const [
        nextProviders,
        nextIssues,
        nextJobs,
        nextHealthHistory,
        nextJobHistory,
        nextNotificationFailures,
      ] = await Promise.all([
        response.json() as Promise<typeof providers>,
        issueResponse.json() as Promise<typeof issues>,
        jobsResponse.json() as Promise<typeof jobs>,
        healthResponse.json() as Promise<typeof healthHistory>,
        historyResponse.json() as Promise<typeof jobHistory>,
        notificationResponse.json() as Promise<typeof notificationFailures>,
      ]);
      if (sequence !== loadSequence.current) return;
      setProviders(nextProviders);
      setIssues(nextIssues);
      setJobs(nextJobs);
      setHealthHistory(nextHealthHistory);
      setJobHistory(nextJobHistory);
      setNotificationFailures(nextNotificationFailures);
      setLoadState('ready');
      setMessage((current) => (current === 'Provider 配置读取失败。' ? '' : current));
    } catch {
      if (sequence !== loadSequence.current) return;
      setLoadState(
        providers.length ||
          issues.length ||
          jobs.length ||
          healthHistory.length ||
          jobHistory.length
          ? 'stale'
          : 'error',
      );
      setMessage('Provider 配置读取失败。');
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const test = async (name: string) => {
    const response = await fetch(`/api/v1/providers/config/${encodeURIComponent(name)}/test`, {
      method: 'POST',
    });
    setMessage(response.ok ? `${name} 连通性测试已排队。` : `${name} 测试失败。`);
  };
  const saveProvider = async (provider: (typeof providers)[number], enabled = provider.enabled) => {
    const response = await fetch('/api/v1/providers/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: provider.name,
        type: provider.type,
        enabled,
        priority: provider.priority,
        capabilities: provider.capabilities,
      }),
    });
    setMessage(response.ok ? `${provider.name} 配置已保存。` : `${provider.name} 配置保存失败。`);
    if (response.ok) await load();
  };
  const saveProviderDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = providerDraft.name.trim();
    const capabilities = providerDraft.capabilities
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!name || capabilities.length === 0) {
      setMessage('请填写 Provider 名称和至少一项能力。');
      return;
    }
    const response = await fetch('/api/v1/providers/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        type: providerDraft.type,
        enabled: true,
        priority: 1,
        capabilities,
        ...(providerDraft.credentialsRef ? { credentialsRef: providerDraft.credentialsRef } : {}),
      }),
    });
    if (!response.ok) {
      setMessage('Provider 配置保存失败，请检查名称、能力和凭证引用。');
      return;
    }
    setProviderDraft((current) => ({ ...current, credentialsRef: '' }));
    setMessage(`${name} 配置已保存；页面不会回显凭证。`);
    await load();
  };
  const toggleJob = async (job: (typeof jobs)[number]) => {
    await fetch(`/api/v1/automations/${job.id}/enabled`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !job.enabled }),
    });
    await load();
  };
  return (
    <section className="module-page">
      <p className="kicker">Providers</p>
      <h1>数据与自动化</h1>
      <p className="page-description">
        按能力查看 Provider、优先级、健康和额度；凭证只显示配置状态，不回显密钥。
      </p>
      <Button className="secondary" type="button" variant="outline" onClick={() => void load()}>
        刷新 Provider 与自动化
      </Button>
      {message && <p className="form-message">{message}</p>}
      <form className="form-card provider-form" onSubmit={(event) => void saveProviderDraft(event)}>
        <h3>新增或更新 Provider</h3>
        <p className="form-help">
          只保存凭证引用；输入框提交后会清空，已保存的凭证只显示配置状态，不会回显密钥。
        </p>
        <div className="provider-form-grid">
          <label>
            名称
            <Input
              value={providerDraft.name}
              onChange={(event) =>
                setProviderDraft((current) => ({ ...current, name: event.target.value }))
              }
              required
              maxLength={80}
            />
          </label>
          <label>
            类型
            <Select
              value={providerDraft.type}
              onValueChange={(value) =>
                value && setProviderDraft((current) => ({ ...current, type: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {providerDraft.type === 'notification'
                    ? '通知'
                    : providerDraft.type === 'market'
                      ? '行情'
                      : providerDraft.type === 'ai'
                        ? 'AI'
                        : '图像'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="notification">通知</SelectItem>
                <SelectItem value="market">行情</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
                <SelectItem value="vision">图像</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            能力（逗号分隔）
            <Input
              value={providerDraft.capabilities}
              onChange={(event) =>
                setProviderDraft((current) => ({ ...current, capabilities: event.target.value }))
              }
              placeholder="notification"
              required
            />
          </label>
          <label>
            凭证引用
            <Input
              type="password"
              autoComplete="off"
              value={providerDraft.credentialsRef}
              onChange={(event) =>
                setProviderDraft((current) => ({
                  ...current,
                  credentialsRef: event.target.value,
                }))
              }
              placeholder="可选；提交后不再显示"
            />
          </label>
        </div>
        <Button type="submit" variant="default">
          保存 Provider
        </Button>
      </form>
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>能力</th>
                <th>优先级</th>
                <th>状态</th>
                <th>凭证</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.name}>
                  <td>
                    <strong>{provider.name}</strong>
                    <span>{provider.type}</span>
                  </td>
                  <td>{provider.capabilities.join(' · ')}</td>
                  <td>
                    <Input
                      aria-label={`${provider.name} 优先级`}
                      type="number"
                      min={0}
                      value={provider.priority}
                      onChange={(event) =>
                        setProviders((current) =>
                          current.map((item) =>
                            item.name === provider.name
                              ? { ...item, priority: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                      onBlur={() => void saveProvider(provider)}
                    />
                  </td>
                  <td>{provider.health}</td>
                  <td>{provider.credentialConfigured ? '已配置' : '未配置'}</td>
                  <td>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      onClick={() => void test(provider.name)}
                    >
                      连通性测试
                    </Button>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      onClick={() => void saveProvider(provider, !provider.enabled)}
                    >
                      {provider.enabled ? '停用' : '启用'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>自动化任务</h2>
          <p>启停、下一次运行和失败历史通过同一 API 管理。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>任务</th>
                <th>类型</th>
                <th>下一次运行</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.name}</td>
                  <td>{job.type}</td>
                  <td>
                    {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString('zh-CN') : '未安排'}
                  </td>
                  <td>{job.enabled ? '启用' : '停用'}</td>
                  <td>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      onClick={() => void toggleJob(job)}
                    >
                      {job.enabled ? '停用' : '启用'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Provider 健康历史</h2>
          <p>显示最近状态、延迟和检查时间，便于判断主备切换原因。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>状态</th>
                <th>延迟</th>
                <th>检查时间</th>
              </tr>
            </thead>
            <tbody>
              {healthHistory.map((item, index) => (
                <tr key={`${item.provider}-${item.checkedAt}-${index}`}>
                  <td>{item.provider}</td>
                  <td>{item.state}</td>
                  <td>{item.latencyMs === null ? '不可用' : `${item.latencyMs} ms`}</td>
                  <td>{new Date(item.checkedAt).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>自动化运行历史</h2>
          <p>失败任务和错误摘要可从这里定位，无需直接查数据库。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>任务</th>
                <th>状态</th>
                <th>开始时间</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              {jobHistory.map((item) => (
                <tr key={item.id}>
                  <td>{item.jobId}</td>
                  <td>{item.status}</td>
                  <td>{new Date(item.startedAt).toLocaleString('zh-CN')}</td>
                  <td>{item.error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>通知失败</h2>
          <p>只读展示投递失败状态，重试仍通过 Notification API 处理。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>状态</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              {notificationFailures.map((item) => (
                <tr key={item.id}>
                  <td>{item.provider}</td>
                  <td>{item.status}</td>
                  <td>{item.lastError ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>开放数据质量问题</h2>
          <p>异常不会静默当作完整数据。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>标的</th>
                <th>级别</th>
                <th>问题</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td>{issue.provider}</td>
                  <td>{issue.symbol ?? '全局'}</td>
                  <td>{issue.severity}</td>
                  <td>{issue.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function PerformanceDashboard({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState('');
  const [mode, setMode] = useState<PortfolioMode>('actual');
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [summary, setSummary] = useState<{ ttwror: number; xirr: number | null } | null>(null);
  const [allocationRows, setAllocationRows] = useState<PerformanceAllocationRecord[]>([]);
  const [rebalanceRows, setRebalanceRows] = useState<RebalanceGapRecord[]>([]);
  const [targetText, setTargetText] = useState('{"股票":0.6,"ETF":0.4}');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('success');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loadSequence = useRef(0);
  const showMessage = (nextMessage: string, tone: 'error' | 'success') => {
    setMessage(nextMessage);
    setMessageTone(tone);
  };
  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts]);
  const load = async () => {
    const sequence = ++loadSequence.current;
    setLoadState('loading');
    const queryParams = new URLSearchParams({ mode, t: String(Date.now()) });
    if (accountId) queryParams.set('accountId', accountId);
    const query = '?' + queryParams.toString();
    const [historyResponse, summaryResponse, layersResponse, targetsResponse] = await Promise.all([
      fetch(`/api/v1/performance/history${query}`, { cache: 'no-store' }),
      fetch(`/api/v1/performance/summary${query}`, { cache: 'no-store' }),
      fetch(`/api/v1/performance/layers${query}`, { cache: 'no-store' }),
      fetch(
        `/api/v1/performance/targets?scope=${accountId ? 'account' : 'portfolio'}${
          accountId ? `&accountId=${encodeURIComponent(accountId)}` : ''
        }&t=${Date.now()}`,
        { cache: 'no-store' },
      ),
    ]);
    if (!historyResponse.ok || !summaryResponse.ok || !layersResponse.ok || !targetsResponse.ok)
      throw new Error('performance');
    const [history, nextSummary, layerPayload, targetPayload] = await Promise.all([
      historyResponse.json() as Promise<SnapshotRecord[]>,
      summaryResponse.json() as Promise<{ ttwror: number; xirr: number | null }>,
      layersResponse.json() as Promise<{ security: PerformanceLayerRecord[] }>,
      targetsResponse.text(),
    ]);
    const parsedTargetPayload = targetPayload
      ? (JSON.parse(targetPayload) as { targets?: Record<string, number> })
      : null;
    if (sequence !== loadSequence.current) return;
    setSnapshots(history);
    setSummary(nextSummary);
    const loadedTargets = parsedTargetPayload?.targets ?? {};
    if (Object.keys(loadedTargets).length > 0) setTargetText(JSON.stringify(loadedTargets));
    const positions = layerPayload.security
      .filter((position) => position.marketValue !== null)
      .map((position) => ({ category: position.assetType, marketValue: position.marketValue! }));
    if (positions.length === 0) {
      setAllocationRows([]);
      setRebalanceRows([]);
      setLoadState(history.length === 0 ? 'empty' : 'ready');
      return;
    }
    const allocationResponse = await fetch('/api/v1/performance/allocation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        positions,
        ...(Object.keys(loadedTargets).length > 0 ? { targets: loadedTargets } : {}),
      }),
    });
    if (!allocationResponse.ok) throw new Error('allocation');
    const allocationPayload = (await allocationResponse.json()) as {
      allocation: PerformanceAllocationRecord[];
      rebalance: RebalanceGapRecord[];
    };
    if (sequence !== loadSequence.current) return;
    setAllocationRows(allocationPayload.allocation);
    setRebalanceRows(allocationPayload.rebalance);
    setLoadState(history.length === 0 ? 'empty' : 'ready');
  };
  useEffect(() => {
    if (accountId || accounts.length === 0) {
      const sequence = loadSequence.current + 1;
      void load().catch(() => {
        if (sequence !== loadSequence.current) return;
        setLoadState(snapshots.length > 0 ? 'stale' : 'error');
        showMessage('收益历史读取失败。', 'error');
      });
    }
  }, [accountId, mode]);
  const saveTargets = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const targets = JSON.parse(targetText) as Record<string, number>;
      const response = await fetch('/api/v1/performance/targets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: accountId ? 'account' : 'portfolio',
          accountId: accountId || undefined,
          targets,
        }),
      });
      if (!response.ok) {
        showMessage('目标权重必须合计 100%。', 'error');
        return;
      }
      showMessage('目标配置已保存并生成新版本。', 'success');
      await load();
    } catch {
      showMessage('目标配置必须是 JSON 对象。', 'error');
    }
  };
  const latest = snapshots.at(-1);
  return (
    <section className="module-page">
      <p className="kicker">Performance</p>
      <h1>收益分析</h1>
      <p className="page-description">
        所有收益指标从 Ledger 与带数据质量标记的 Portfolio Snapshot
        计算；指标仅解释历史，不自动下单。
      </p>
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <div className="portfolio-mode-tabs" role="tablist" aria-label="收益范围">
        {(['actual', 'shadow'] as const).map((nextMode) => (
          <Button
            key={nextMode}
            type="button"
            size="sm"
            variant={mode === nextMode ? 'default' : 'outline'}
            role="tab"
            aria-selected={mode === nextMode}
            onClick={() => setMode(nextMode)}
          >
            {nextMode === 'actual' ? '实际收益' : '影子收益'}
          </Button>
        ))}
      </div>
      {mode === 'shadow' ? (
        <p className="mode-note">当前收益只计算影子账户，结果标记为模拟。</p>
      ) : null}
      <label className="inline-control">
        账户
        <Select value={accountId || null} onValueChange={(value) => setAccountId(value ?? '')}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="全组合">
              {accountId
                ? (accounts.find((account) => account.id === accountId)?.name ?? '全组合')
                : '全组合'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="metrics">
        <Metric
          label="最新总资产"
          value={
            latest ? money.format(Number(latest.marketValue) + Number(latest.cashValue)) : '暂无'
          }
          detail="Snapshot 市值 + 现金"
        />
        <Metric
          label="TTWROR"
          value={summary ? `${(summary.ttwror * 100).toFixed(2)}%` : '暂无'}
          detail="时间加权收益，不混入外部现金流"
        />
        <Metric
          label="XIRR"
          value={
            summary?.xirr === null || summary === null
              ? '不可计算'
              : `${(summary.xirr * 100).toFixed(2)}%`
          }
          detail="现金流可解时的年化收益"
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>历史 Snapshot</h2>
          <p>市值、成本、现金和数据时点可回放。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>市值</th>
                <th>成本</th>
                <th>现金</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>{new Date(snapshot.capturedAt).toLocaleString('zh-CN')}</td>
                  <td>{money.format(snapshot.marketValue)}</td>
                  <td>{money.format(snapshot.costValue)}</td>
                  <td>{money.format(snapshot.cashValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>资产配置</h2>
          <p>按资产类型汇总可用市值；缺失行情不会伪装成零值。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>分类</th>
                <th>市值</th>
                <th>当前权重</th>
              </tr>
            </thead>
            <tbody>
              {allocationRows.length === 0 ? (
                <tr>
                  <td colSpan={3}>暂无可用市值</td>
                </tr>
              ) : (
                allocationRows.map((row) => (
                  <tr key={row.category}>
                    <td>{row.category}</td>
                    <td>{money.format(row.value)}</td>
                    <td>{(row.weight * 100).toFixed(2)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>再平衡缺口</h2>
          <p>仅提供增配/减配建议，不会自动下单。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>分类</th>
                <th>当前 / 目标</th>
                <th>缺口金额</th>
                <th>建议</th>
              </tr>
            </thead>
            <tbody>
              {rebalanceRows.length === 0 ? (
                <tr>
                  <td colSpan={4}>保存目标配置后显示缺口</td>
                </tr>
              ) : (
                rebalanceRows.map((row) => (
                  <tr key={row.category}>
                    <td>{row.category}</td>
                    <td>
                      {(row.currentWeight * 100).toFixed(2)}% /{' '}
                      {(row.targetWeight * 100).toFixed(2)}%
                    </td>
                    <td>{money.format(Math.abs(row.amountGap))}</td>
                    <td>
                      {row.direction === 'increase'
                        ? '增配'
                        : row.direction === 'decrease'
                          ? '减配'
                          : '平衡'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <form className="form-card" onSubmit={(event) => void saveTargets(event)}>
        <h3>目标配置</h3>
        <label>
          分类权重 JSON
          <Input
            value={targetText}
            onChange={(event) => setTargetText(event.target.value)}
            aria-describedby="target-help"
          />
        </label>
        <small id="target-help">例如 {`{"股票":0.6,"ETF":0.4}`}，总和必须为 1。</small>
        <Button type="submit" variant="default">
          保存目标
        </Button>
      </form>
      {message && (
        <p
          className="form-message"
          data-tone={messageTone}
          role={messageTone === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
    </section>
  );
}

function RiskCenter({ accounts, portfolio }: { accounts: Account[]; portfolio: Portfolio | null }) {
  const [rules, setRules] = useState<RiskRuleRecord[]>([]);
  const [mode, setMode] = useState<PortfolioMode>('actual');
  const [events, setEvents] = useState<RiskEventRecord[]>([]);
  const [deliveries, setDeliveries] = useState<NotificationRecord[]>([]);
  const [message, setMessage] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [audit, setAudit] = useState<
    Array<{ id: string; action: string; ruleVersion: number; createdAt: string }>
  >([]);
  const loadSequence = useRef(0);

  const loadRisk = async () => {
    const sequence = ++loadSequence.current;
    setLoadState('loading');
    try {
      const cacheBust = `?t=${Date.now()}`;
      const eventQuery = '?mode=' + mode + '&t=' + Date.now();
      const [ruleResponse, eventResponse, deliveryResponse] = await Promise.all([
        fetch(`/api/v1/risk/rules${cacheBust}`),
        fetch('/api/v1/risk/events' + eventQuery),
        fetch(`/api/v1/notifications${cacheBust}`),
      ]);
      if (!ruleResponse.ok || !eventResponse.ok || !deliveryResponse.ok) throw new Error('risk');
      const [nextRules, nextEvents, nextDeliveries] = await Promise.all([
        ruleResponse.json() as Promise<RiskRuleRecord[]>,
        eventResponse.json() as Promise<RiskEventRecord[]>,
        deliveryResponse.json() as Promise<NotificationRecord[]>,
      ]);
      if (sequence !== loadSequence.current) return;
      setRules(nextRules);
      setEvents(nextEvents);
      setDeliveries(nextDeliveries);
      setLoadState(
        nextRules.length === 0 && nextEvents.length === 0 && nextDeliveries.length === 0
          ? 'empty'
          : 'ready',
      );
    } catch {
      if (sequence !== loadSequence.current) return;
      setLoadState(rules.length || events.length || deliveries.length ? 'stale' : 'error');
      setMessage('风险数据读取失败，请稍后重试。');
    }
  };
  useEffect(() => {
    void loadRisk();
  }, [mode]);

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const scope = formText(form, 'scope') as RiskRuleRecord['scope'];
    const response = await fetch('/api/v1/risk/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: formText(form, 'kind'),
        scope,
        severity: formText(form, 'severity'),
        threshold: Number(formText(form, 'threshold')),
        enabled: true,
        ...(scope === 'security' ? { symbol: formText(form, 'symbol') } : {}),
        ...(scope === 'account' ? { accountId: formText(form, 'accountId') } : {}),
      }),
    });
    if (!response.ok) {
      setMessage('规则创建失败，请检查 scope 与目标。');
      return;
    }
    formElement.reset();
    setMessage('规则已创建并记录审计。');
    await loadRisk();
  };

  const patchRule = async (rule: RiskRuleRecord, patch: object) => {
    const response = await fetch(`/api/v1/risk/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setMessage(response.ok ? '规则已生成新版本。' : '规则更新失败。');
    if (response.ok) await loadRisk();
  };

  const testRule = async (rule: RiskRuleRecord) => {
    const contexts = (portfolio?.positions ?? []).map((position) => ({
      symbol: position.symbol,
      accountId: position.accountId,
      mode,
      costPrice: position.costPrice,
      ...(position.marketValue === null || position.quantity <= 0
        ? {}
        : { price: position.marketValue / position.quantity }),
      ...(portfolio && portfolio.totalMarketValue > 0 && position.marketValue !== null
        ? { weight: position.marketValue / portfolio.totalMarketValue }
        : {}),
      marketTime: portfolio?.valuedAt ?? new Date().toISOString(),
      dataQuality: { portfolio: portfolio?.partial ? 'partial' : 'fresh' },
    }));
    const response = await fetch(`/api/v1/risk/rules/${rule.id}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(contexts),
    });
    if (!response.ok) {
      setMessage('人工测试失败，请确认组合中有可用数据。');
      return;
    }
    const result = (await response.json()) as Array<{ triggered: boolean }>;
    setMessage(`人工测试完成：${result.filter((item) => item.triggered).length} 个上下文触发。`);
  };

  const scanRisk = async () => {
    const contexts = (portfolio?.positions ?? []).map((position) => ({
      symbol: position.symbol,
      accountId: position.accountId,
      mode,
      costPrice: position.costPrice,
      ...(position.marketValue === null || position.quantity <= 0
        ? {}
        : { price: position.marketValue / position.quantity }),
      ...(portfolio && portfolio.totalMarketValue > 0 && position.marketValue !== null
        ? { weight: position.marketValue / portfolio.totalMarketValue }
        : {}),
      marketTime: portfolio?.valuedAt ?? new Date().toISOString(),
      dataQuality: { portfolio: portfolio?.partial ? 'partial' : 'fresh' },
    }));
    const response = await fetch('/api/v1/risk/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(contexts),
    });
    if (!response.ok) {
      setMessage('风险扫描失败，请确认当前组合有可用数据。');
      return;
    }
    setMessage('风险扫描已完成，触发事件已写入历史。');
    await loadRisk();
  };

  const showAudit = async (rule: RiskRuleRecord) => {
    const response = await fetch(`/api/v1/risk/rules/${rule.id}/audit`);
    if (!response.ok) return setMessage('审计记录读取失败。');
    setAudit((await response.json()) as typeof audit);
  };

  const criticalCount = events.filter((event) => event.severity === 'critical').length;
  const failedCount = deliveries.filter((delivery) => delivery.status === 'failed').length;
  return (
    <section className="module-page">
      <p className="kicker">Risk Center</p>
      <h1>风险中心</h1>
      <p className="page-description">
        规则负责确定性判断；提醒仅用于辅助研究，不代表交易执行保证。事件保留规则版本、数据时间和触发上下文。
      </p>
      <div className="page-header-actions">
        <div className="portfolio-mode-tabs" role="tablist" aria-label="风险范围">
          {(['actual', 'shadow'] as const).map((nextMode) => (
            <Button
              key={nextMode}
              type="button"
              size="sm"
              variant={mode === nextMode ? 'default' : 'outline'}
              role="tab"
              aria-selected={mode === nextMode}
              onClick={() => setMode(nextMode)}
            >
              {nextMode === 'actual' ? '实际风险' : '影子风险'}
            </Button>
          ))}
        </div>
        <Button
          className="secondary"
          type="button"
          variant="outline"
          onClick={() => void loadRisk()}
        >
          刷新风险数据
        </Button>
      </div>
      {mode === 'shadow' ? (
        <p className="mode-note">当前只显示影子风险事件，通知默认不代表实际资产风险。</p>
      ) : null}
      <div className="metrics">
        <Metric label="启用规则" value={String(rules.filter((rule) => rule.enabled).length)} />
        <Metric
          label="严重事件"
          value={String(criticalCount)}
          {...(criticalCount ? { tone: 'negative' as const } : {})}
        />
        <Metric
          label="通知失败"
          value={String(failedCount)}
          {...(failedCount ? { tone: 'negative' as const } : {})}
        />
      </div>
      <form className="form-card risk-form" onSubmit={(event) => void createRule(event)}>
        <h3>新建规则</h3>
        <label>
          类型
          <Select name="kind" defaultValue="price-below">
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value: string | null) =>
                  value === 'price-above'
                    ? '价格高于'
                    : value === 'cost-stop'
                      ? '成本止损'
                      : value === 'take-profit'
                        ? '止盈'
                        : value === 'position-concentration'
                          ? '持仓集中度'
                          : '价格低于'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price-below">价格低于</SelectItem>
              <SelectItem value="price-above">价格高于</SelectItem>
              <SelectItem value="cost-stop">成本止损</SelectItem>
              <SelectItem value="take-profit">止盈</SelectItem>
              <SelectItem value="position-concentration">持仓集中度</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          范围
          <Select name="scope" defaultValue="security">
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value: string | null) =>
                  value === 'account' ? '账户' : value === 'portfolio' ? '组合' : '证券'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="security">证券</SelectItem>
              <SelectItem value="account">账户</SelectItem>
              <SelectItem value="portfolio">组合</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          阈值
          <Input name="threshold" type="number" step="any" required />
        </label>
        <label>
          严重级别
          <Select name="severity" defaultValue="warning">
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value: string | null) =>
                  value === 'info'
                    ? '提示'
                    : value === 'error'
                      ? '错误'
                      : value === 'critical'
                        ? '严重'
                        : '警告'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">提示</SelectItem>
              <SelectItem value="warning">警告</SelectItem>
              <SelectItem value="error">错误</SelectItem>
              <SelectItem value="critical">严重</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          证券代码
          <Input name="symbol" placeholder="security 时填写" />
        </label>
        <label>
          账户
          <Select name="accountId" defaultValue={null}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="account 时选择">
                {(value: string | null) =>
                  accounts.find((account) => account.id === value)?.name ?? 'account 时选择'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button type="submit" variant="default">
          创建规则
        </Button>
        <Button
          className="secondary"
          type="button"
          variant="outline"
          onClick={() => void scanRisk()}
        >
          扫描当前组合
        </Button>
      </form>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <DataStateBanner state={loadState} onRetry={() => void loadRisk()} />
      <section className="panel">
        <div className="panel-heading">
          <h2>规则列表</h2>
          <p>修改与启停都会递增版本并写入审计。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>规则</th>
                <th>范围</th>
                <th>阈值</th>
                <th>版本</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <strong>{rule.kind}</strong>
                    <span>{rule.symbol ?? rule.accountId ?? '全组合'}</span>
                  </td>
                  <td>{rule.scope}</td>
                  <td>{rule.threshold}</td>
                  <td>v{rule.version}</td>
                  <td>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      onClick={() => void patchRule(rule, { enabled: !rule.enabled })}
                    >
                      {rule.enabled ? '停用' : '启用'}
                    </Button>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      onClick={() => void testRule(rule)}
                    >
                      测试
                    </Button>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      onClick={() => void showAudit(rule)}
                    >
                      审计
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {audit.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>规则审计</h2>
          </div>
          <div className="edit-list">
            {audit.map((item) => (
              <div key={item.id}>
                <span>
                  {item.action} · v{item.ruleVersion}
                </span>
                <small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>历史事件</h2>
          <p>显示实际触发值的数据时间与规则版本。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>事件</th>
                <th>级别</th>
                <th>规则版本</th>
                <th>数据时间</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <strong>{event.message}</strong>
                    <span>
                      {event.symbol ?? '组合'} · value={displayValue(event.context.value)}
                    </span>
                  </td>
                  <td>{event.severity}</td>
                  <td>v{event.ruleVersion}</td>
                  <td>{new Date(event.marketTime ?? event.evaluatedAt).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>通知状态</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>渠道</th>
                <th>级别</th>
                <th>状态</th>
                <th>尝试</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    <strong>{delivery.channel}</strong>
                    <span>{delivery.lastError ?? delivery.eventId}</span>
                  </td>
                  <td>{delivery.severity}</td>
                  <td>{delivery.status}</td>
                  <td>{delivery.attemptCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function ScreenshotImportReview({
  accounts,
  initialAccountId,
  onPortfolioChanged,
  onDirtyChange,
}: {
  accounts: Account[];
  initialAccountId?: string;
  onPortfolioChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [accountId, setAccountId] = useState(initialAccountId ?? '');
  const [source, setSource] = useState<ImportDraftRecord['source']>('unknown');
  const [drafts, setDrafts] = useState<ImportDraftRecord[]>([]);
  const [selected, setSelected] = useState<ImportDraftRecord | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [message, setMessage] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [dirty, setDirty] = useState(false);
  const loadSequence = useRef(0);
  const markDirty = (nextDirty = true) => {
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  };
  const confirmDiscard = () =>
    !dirty || window.confirm('当前有未保存修改，切换后会丢弃，继续吗？');
  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts, initialAccountId]);
  const loadDrafts = async (nextAccountId: string) => {
    const sequence = ++loadSequence.current;
    setLoadState('loading');
    try {
      const response = await fetch(
        `/api/v1/imports?accountId=${encodeURIComponent(nextAccountId)}`,
      );
      if (!response.ok) throw new Error('history');
      const nextDrafts = (await response.json()) as ImportDraftRecord[];
      if (sequence !== loadSequence.current) return;
      setDrafts(nextDrafts);
      setLoadState(nextDrafts.length === 0 ? 'empty' : 'ready');
    } catch {
      if (sequence !== loadSequence.current) return;
      setLoadState(drafts.length ? 'stale' : 'error');
      setMessage('导入历史读取失败。');
    }
  };
  useEffect(() => {
    if (!accountId) {
      loadSequence.current += 1;
      if (accounts.length === 0) setLoadState('empty');
      return;
    }
    void loadDrafts(accountId);
  }, [accountId]);
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fileInput = event.currentTarget.elements.namedItem('file') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file || !accountId) return;
    const body = new FormData();
    body.set('file', file);
    body.set('accountId', accountId);
    body.set('source', source);
    body.set('sourceConfidence', source === 'unknown' ? '0' : '1');
    body.set('extracted', '[]');
    const response = await fetch('/api/v1/imports/screenshot', { method: 'POST', body });
    if (!response.ok) {
      setMessage('截图上传失败，请确认格式和大小不超过 10MB。');
      return;
    }
    const draft = (await response.json()) as ImportDraftRecord;
    setDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    setSelected(draft);
    setRows(draft.rows);
    markDirty(false);
    setMessage('草稿已创建；请逐项确认后提交。');
  };
  const choose = (draft: ImportDraftRecord) => {
    if (!confirmDiscard()) return;
    setSelected(draft);
    setRows(draft.rows);
    setSource(draft.source);
    markDirty(false);
  };
  const updateRow = (index: number, patch: Partial<ImportRow>) => {
    markDirty();
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              ...patch,
              matchStatus: patch.symbol ? 'matched' : row.matchStatus,
              confidence: 1,
              issues: [],
            }
          : row,
      ),
    );
  };
  const commit = async () => {
    if (!selected) return;
    const response = await fetch(`/api/v1/imports/${selected.id}/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows, source }),
    });
    if (!response.ok) {
      setMessage('仍有未解决字段，请检查代码、数量、成本价和数值关系。');
      return;
    }
    setMessage('导入已提交，组合已重新估值。');
    setSelected({ ...selected, status: 'committed', rows });
    markDirty(false);
    onPortfolioChanged();
  };
  const rollback = async (draft: ImportDraftRecord) => {
    const response = await fetch(`/api/v1/imports/${draft.id}/rollback`, { method: 'POST' });
    setMessage(response.ok ? '已恢复到本次导入前的持仓。' : '该记录无法回滚。');
    if (response.ok) {
      markDirty(false);
      onPortfolioChanged();
    }
  };
  return (
    <div className="import-screenshot-content">
      <div className="panel-heading">
        <h2>截图导入</h2>
        <p>上传不会直接修改持仓。代码歧义、低置信度或数值不一致必须先人工修正。</p>
      </div>
      <Button
        className="secondary"
        type="button"
        variant="outline"
        onClick={() => {
          if (accountId) void loadDrafts(accountId);
          else setLoadState('empty');
        }}
      >
        刷新导入历史
      </Button>
      {accounts.length === 0 ? (
        <div className="notice">请先在“录入持仓”的账户管理中创建账户。</div>
      ) : (
        <form className="upload-bar" onSubmit={(event) => void upload(event)}>
          <label>
            账户
            <Select
              value={accountId || null}
              onValueChange={(value) => {
                if (!value || !confirmDiscard()) return;
                markDirty(false);
                setAccountId(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择账户">
                  {accounts.find((account) => account.id === accountId)?.name ?? '选择账户'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} · {account.institution || '未填写机构'} ·{' '}
                    {account.currency} · {account.type === 'fund' ? '基金' : account.type === 'cash' ? '现金' : '证券'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            截图来源
            <Select
              value={source}
              onValueChange={(value) => {
                if (!value) return;
                markDirty();
                setSource(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {source === 'unknown'
                    ? '待识别'
                    : source === 'alipay'
                      ? '支付宝'
                      : source === 'ths'
                        ? '同花顺'
                        : source === 'broker'
                          ? '券商'
                          : source === 'bank'
                            ? '银行'
                            : source === 'fund-platform'
                              ? '基金平台'
                              : '待识别'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">待识别</SelectItem>
                <SelectItem value="alipay">支付宝</SelectItem>
                <SelectItem value="ths">同花顺</SelectItem>
                <SelectItem value="broker">券商</SelectItem>
                <SelectItem value="bank">银行</SelectItem>
                <SelectItem value="fund-platform">基金平台</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            持仓截图
            <Input name="file" type="file" required accept="image/png,image/jpeg,image/webp" />
          </label>
          <Button type="submit" variant="default">
            创建草稿
          </Button>
        </form>
      )}
      {message && (
        <div className="form-message" role="status">
          {message}
        </div>
      )}
      <DataStateBanner
        state={loadState}
        onRetry={accountId ? () => void loadDrafts(accountId) : undefined}
      />
      <div className="review-layout">
        <aside className="draft-list" aria-label="导入历史">
          {drafts.length === 0 ? (
            <p>暂无导入记录</p>
          ) : (
            drafts.map((draft) => (
              <Button
                key={draft.id}
                className={selected?.id === draft.id ? 'draft active' : 'draft'}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => choose(draft)}
              >
                <strong>{new Date(draft.createdAt).toLocaleString('zh-CN')}</strong>
                <span>
                  {draft.source} · {draft.status}
                </span>
              </Button>
            ))
          )}
        </aside>
        <div className="review-table">
          {selected ? (
            <>
              <div className="review-heading">
                <div>
                  <h2>候选持仓</h2>
                  <p>
                    {rows.length} 行 · 来源置信度{' '}
                    {Math.round(Number(selected.sourceConfidence) * 100)}%
                  </p>
                </div>
                <Button
                  className="secondary"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    markDirty();
                    setRows((current) => [
                      ...current,
                      {
                        rawSymbol: '',
                        symbol: '',
                        matchStatus: 'unmatched',
                        matchCandidates: [],
                        confidence: 1,
                        rawText: {},
                        issues: [],
                      },
                    ]);
                  }}
                >
                  添加一行
                </Button>
              </div>
              {rows.map((row, index) => (
                <div className="review-row" key={`${index}-${row.rawSymbol}`}>
                  <label>
                    名称
                    <Input
                      value={row.rawName ?? ''}
                      onChange={(event) => updateRow(index, { rawName: event.target.value })}
                    />
                  </label>
                  <label>
                    代码
                    <Input
                      value={row.symbol ?? ''}
                      onChange={(event) =>
                        updateRow(index, { symbol: event.target.value.toUpperCase() })
                      }
                    />
                  </label>
                  <label>
                    数量
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={row.quantity ?? ''}
                      onChange={(event) =>
                        updateRow(index, { quantity: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    成本价
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={row.costPrice ?? ''}
                      onChange={(event) =>
                        updateRow(index, { costPrice: Number(event.target.value) })
                      }
                    />
                  </label>
                  <div className="row-status">
                    <Badge
                      className={row.confidence < 0.75 ? 'tag warning' : 'tag'}
                      variant="secondary"
                    >
                      {Math.round(row.confidence * 100)}%
                    </Badge>
                    {row.issues.map((issue) => (
                      <small key={issue}>{issue}</small>
                    ))}
                  </div>
                  <Button
                    className="text-button danger"
                    size="sm"
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      markDirty();
                      setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
                    }}
                  >
                    删除
                  </Button>
                </div>
              ))}
              <div className="form-actions">
                <Button
                  disabled={selected.status === 'committed'}
                  type="button"
                  variant="default"
                  onClick={() => void commit()}
                >
                  确认并提交
                </Button>
                {selected.status === 'committed' && (
                  <Button
                    className="secondary"
                    type="button"
                    variant="outline"
                    onClick={() => void rollback(selected)}
                  >
                    回滚本次导入
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="empty-inline">选择一条历史记录，或上传截图创建草稿。</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ImportReview({
  accounts,
  positions,
  cashValue,
  onPortfolioChanged,
}: {
  accounts: Account[];
  positions: Position[];
  cashValue?: number;
  onPortfolioChanged: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const queryStep = params.get('step');
  const queryMethod = params.get('method');
  const requestedAccountId = params.get('accountId') ?? '';
  const [accountId, setAccountId] = useState(() => {
    if (requestedAccountId) return requestedAccountId;
    try {
      return window.sessionStorage.getItem('thesis-ledger-last-account') ?? '';
    } catch {
      return '';
    }
  });
  const [method, setMethod] = useState<'manual' | 'screenshot'>(() => {
    if (queryMethod === 'screenshot' || queryStep === 'screenshot') return 'screenshot';
    if (queryMethod === 'manual' || queryStep === 'position') return 'manual';
    try {
      return window.sessionStorage.getItem('thesis-ledger-entry-method') === 'screenshot'
        ? 'screenshot'
        : 'manual';
    } catch {
      return 'manual';
    }
  });
  const [accountSheetOpen, setAccountSheetOpen] = useState(queryStep === 'account');
  const [dirty, setDirty] = useState(false);
  const [entryPositions, setEntryPositions] = useState<Position[]>(positions);
  const [entryCashValue, setEntryCashValue] = useState(cashValue ?? 0);

  useEffect(() => {
    if (requestedAccountId && accounts.some((account) => account.id === requestedAccountId)) {
      setAccountId(requestedAccountId);
      return;
    }
    if (accountId && accounts.some((account) => account.id === accountId)) return;
    if (accounts[0]) {
      setAccountId(accounts[0].id);
      try {
        window.sessionStorage.setItem('thesis-ledger-last-account', accounts[0].id);
      } catch {
        /* storage is optional */
      }
    }
  }, [accountId, accounts, requestedAccountId]);

  useEffect(() => {
    if (queryMethod === 'manual' || queryMethod === 'screenshot') {
      setMethod(queryMethod);
      return;
    }
    if (queryStep === 'position' || queryStep === 'screenshot') {
      setMethod(queryStep === 'screenshot' ? 'screenshot' : 'manual');
    }
  }, [queryMethod, queryStep]);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  useEffect(() => {
    if (!selectedAccount) return;
    let active = true;
    const fallbackPositions = positions.filter((position) => position.accountId === accountId);
    setEntryPositions(fallbackPositions);
    setEntryCashValue(cashValue ?? 0);
    void fetch(
      `/api/v1/portfolio/valuation?accountId=${encodeURIComponent(accountId)}&mode=${selectedAccount.mode}`,
      { cache: 'no-store' },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('entry-valuation');
        return (await response.json()) as Portfolio;
      })
      .then((nextPortfolio) => {
        if (!active) return;
        setEntryPositions(nextPortfolio.positions);
        setEntryCashValue(nextPortfolio.cashValue ?? 0);
      })
      .catch(() => {
        /* 入口仍可使用已加载的账户范围数据；下次保存会触发刷新。 */
      });
    return () => {
      active = false;
    };
  }, [accountId, cashValue, positions, selectedAccount?.mode]);
  const accountPositions = entryPositions.filter((position) => position.accountId === accountId);
  const activeMethod = selectedAccount?.type === 'cash' ? 'manual' : method;
  const confirmDiscard = () =>
    !dirty || window.confirm('当前有未保存修改，切换后会丢弃，继续吗？');
  const navigateEntry = (nextMethod: 'manual' | 'screenshot') => {
    if (nextMethod !== method && !confirmDiscard()) return;
    setDirty(false);
    setMethod(nextMethod);
    try {
      window.sessionStorage.setItem('thesis-ledger-entry-method', nextMethod);
    } catch {
      /* storage is optional */
    }
    const next = new URLSearchParams(location.search);
    next.set('method', nextMethod);
    next.set('step', nextMethod === 'manual' ? 'position' : 'screenshot');
    if (accountId) next.set('accountId', accountId);
    void navigate({ pathname: '/position-entry', search: '?' + next.toString() });
  };
  const selectAccount = (nextAccountId: string) => {
    if (nextAccountId === accountId) return;
    if (!confirmDiscard()) return;
    setDirty(false);
    setAccountId(nextAccountId);
    try {
      window.sessionStorage.setItem('thesis-ledger-last-account', nextAccountId);
    } catch {
      /* storage is optional */
    }
    const next = new URLSearchParams(location.search);
    next.set('accountId', nextAccountId);
    next.delete('step');
    next.set('method', method);
    void navigate({ pathname: '/position-entry', search: '?' + next.toString() });
  };
  const accountForm = (
    <PortfolioManagement
      accounts={accounts}
      positions={[]}
      step="account"
      onAccountSaved={() => {
        setAccountSheetOpen(false);
        onPortfolioChanged();
      }}
      onSaved={onPortfolioChanged}
    />
  );

  if (accounts.length === 0) {
    return (
      <section className="module-page import-page" data-import-step="account">
        <p className="kicker">Portfolio Input</p>
        <h1>录入持仓</h1>
        <p className="page-description">
          首次使用需要先建立一个账户；账户建立后，手动录入和截图导入会成为两种并列方式。
        </p>
        {accountForm}
      </section>
    );
  }

  return (
    <section
      className="module-page import-page"
      data-import-step={activeMethod === 'manual' ? 'position' : 'screenshot'}
    >
      <p className="kicker">Portfolio Input</p>
      <div className="entry-page-heading">
        <div>
          <h1>录入持仓</h1>
          <p className="page-description">
            先选择账户，再选择一种录入方式；来源只记录在本次持仓事件或截图草稿中。
          </p>
        </div>
        <Button
          className="secondary"
          type="button"
          variant="outline"
          onClick={() => setAccountSheetOpen(true)}
        >
          账户管理
        </Button>
      </div>
      <div className="entry-context">
        <label>
          当前账户
          <Select
            value={accountId || null}
            onValueChange={(value) => value && selectAccount(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择账户">
                {selectedAccount?.name ?? '选择账户'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} · {account.institution || '未填写机构'} · {account.currency} ·{' '}
                  {account.type === 'fund' ? '基金' : account.type === 'cash' ? '现金' : '证券'} ·{' '}
                  {account.mode === 'shadow' ? '影子' : '实际'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="entry-account-meta">
          <strong>{selectedAccount?.name}</strong>
          <span>
            {selectedAccount?.institution || '未填写机构'} · {selectedAccount?.currency} ·{' '}
            {selectedAccount?.mode === 'shadow' ? '影子账户' : '实际账户'}
          </span>
        </div>
      </div>
      {selectedAccount?.type === 'cash' && method === 'screenshot' && (
        <div className="notice" role="status">
          现金账户只支持手动现金余额，已临时切换；原截图导入偏好会保留，切换回证券或基金账户后恢复。
        </div>
      )}
      <nav className="entry-method-nav" aria-label="持仓录入方式">
        <Button
          type="button"
          variant={method === 'manual' ? 'default' : 'outline'}
          className={method === 'manual' ? '' : 'secondary'}
          onClick={() => navigateEntry('manual')}
        >
          手动录入
        </Button>
        <Button
          type="button"
          variant={method === 'screenshot' ? 'default' : 'outline'}
          className={method === 'screenshot' ? '' : 'secondary'}
          onClick={() => navigateEntry('screenshot')}
        >
          截图导入
        </Button>
      </nav>
      {activeMethod === 'manual' ? (
        <PortfolioManagement
          accounts={accounts}
          positions={accountPositions}
          cashValue={entryCashValue}
          step="position"
          defaultAccountId={accountId}
          onDirtyChange={setDirty}
          onSaved={() => {
            setDirty(false);
            onPortfolioChanged();
          }}
        />
      ) : (
        <ScreenshotImportReview
          accounts={accounts}
          initialAccountId={accountId}
          onDirtyChange={setDirty}
          onPortfolioChanged={onPortfolioChanged}
        />
      )}
      <Dialog open={accountSheetOpen} onOpenChange={setAccountSheetOpen}>
        <DialogContent
          aria-describedby="account-management-description"
          className="account-sheet max-h-[calc(100dvh-32px)] max-w-[620px] overflow-auto"
        >
          <div className="panel-heading">
            <DialogTitle>账户管理</DialogTitle>
            <DialogDescription id="account-management-description">
              账户是持仓的容器；录入来源不属于账户属性。类型、模式和币种在出现 Ledger 事件后锁定。
            </DialogDescription>
          </div>
          {accountForm}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PortfolioDashboard({
  state,
  portfolio,
  accounts,
  mode,
  onModeChange,
  onRetry,
  onNavigate,
}: {
  state: LoadState;
  portfolio: Portfolio | null;
  accounts: Account[];
  mode: PortfolioMode;
  onModeChange: (mode: PortfolioMode) => void;
  onRetry: () => void;
  onNavigate: (view: DesktopNavigationView, options?: OnboardingNavigationOptions) => void;
}) {
  const largest = useMemo(
    () =>
      [...(portfolio?.positions ?? [])].sort(
        (a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0),
      )[0],
    [portfolio],
  );
  const [detailPosition, setDetailPosition] = useState<Position | null>(null);
  const hasPosition = (portfolio?.positions.length ?? 0) > 0;
  const [onboardingStatus, setOnboardingStatus] = useState({
    hasProviderSetup: false,
    hasRiskRule: false,
  });

  useEffect(() => {
    if (!hasPosition) {
      setOnboardingStatus({ hasProviderSetup: false, hasRiskRule: false });
      return;
    }

    let active = true;
    const loadOnboardingStatus = async () => {
      try {
        const [providerResponse, automationResponse, riskResponse] = await Promise.all([
          fetch('/api/v1/providers/config'),
          fetch('/api/v1/automations'),
          fetch('/api/v1/risk/rules'),
        ]);
        if (!providerResponse.ok || !automationResponse.ok || !riskResponse.ok) {
          throw new Error('onboarding status');
        }
        const [providers, automations, rules] = await Promise.all([
          providerResponse.json() as Promise<OnboardingProviderRecord[]>,
          automationResponse.json() as Promise<OnboardingAutomationRecord[]>,
          riskResponse.json() as Promise<OnboardingRiskRuleRecord[]>,
        ]);
        if (!active) return;

        const enabledProviders = providers.filter(
          (provider) => provider.enabled !== false && provider.health !== 'down',
        );
        const hasCapability = (provider: OnboardingProviderRecord, capability: string) =>
          Array.isArray(provider.capabilities) &&
          provider.capabilities.some((item) => String(item) === capability);
        const hasQuoteProvider = enabledProviders.some((provider) =>
          hasCapability(provider, 'quote'),
        );
        const hasNotificationProvider = enabledProviders.some((provider) =>
          hasCapability(provider, 'notification'),
        );

        setOnboardingStatus({
          hasProviderSetup:
            hasQuoteProvider &&
            hasNotificationProvider &&
            automations.some((automation) => automation.enabled !== false),
          hasRiskRule: rules.some((rule) => rule.enabled === true),
        });
      } catch {
        if (active) setOnboardingStatus({ hasProviderSetup: false, hasRiskRule: false });
      }
    };

    void loadOnboardingStatus();
    return () => {
      active = false;
    };
  }, [hasPosition]);

  if (state === 'loading') return <DashboardSkeleton />;
  if (state === 'error')
    return (
      <StatePanel
        title="暂时无法读取投资组合"
        description="请确认 ThesisLedger Server 与数据服务正在运行。"
      >
        <Button type="button" variant="default" onClick={onRetry}>
          <ArrowClockwiseIcon />
          重新加载
        </Button>
      </StatePanel>
    );
  if (state === 'empty')
    return (
      <>
        <StatePanel
          title="从第一笔持仓开始"
          description="选择账户后手动录入持仓，或上传一张已脱敏的持仓截图；没有账户时再创建账户。"
        >
          <span className="muted">下方表单会先校验账户、证券代码、数量和成本价。</span>
        </StatePanel>
        <FirstRunOnboarding
          hasAccount={accounts.length > 0}
          hasPosition={hasPosition}
          hasProviderSetup={onboardingStatus.hasProviderSetup}
          hasRiskRule={onboardingStatus.hasRiskRule}
          onNavigate={onNavigate}
        />
      </>
    );
  return (
    <>
      <header className="page-header">
        <div>
          <p className="kicker">组合总览</p>
          <h1>{money.format(portfolio!.totalMarketValue)}</h1>
          <p className="as-of">数据时点 {new Date(portfolio!.valuedAt).toLocaleString('zh-CN')}</p>
        </div>
        <div className="page-header-actions">
          <div className="portfolio-mode-tabs" role="tablist" aria-label="估值范围">
            {(['actual', 'shadow'] as const).map((nextMode) => (
              <Button
                key={nextMode}
                type="button"
                size="sm"
                variant={mode === nextMode ? 'default' : 'outline'}
                aria-selected={mode === nextMode}
                role="tab"
                onClick={() => onModeChange(nextMode)}
              >
                {nextMode === 'actual' ? '实际' : '影子'}
              </Button>
            ))}
          </div>
          <Button className="secondary" type="button" variant="outline" onClick={onRetry}>
            <ArrowClockwiseIcon />
            刷新
          </Button>
        </div>
      </header>
      {mode === 'shadow' ? <p className="mode-note">当前为影子账户范围，数据仅用于模拟。</p> : null}
      <DataStateBanner state={state} onRetry={onRetry} />
      <FirstRunOnboarding
        hasAccount={accounts.length > 0}
        hasPosition={hasPosition}
        hasProviderSetup={onboardingStatus.hasProviderSetup}
        hasRiskRule={onboardingStatus.hasRiskRule}
        onNavigate={onNavigate}
      />
      <section className="metrics" aria-label="组合关键指标">
        <Metric label="持仓成本" value={money.format(portfolio!.totalCost)} />
        <Metric
          label="累计浮盈亏"
          value={money.format(portfolio!.totalPnl)}
          tone={portfolio!.totalPnl >= 0 ? 'positive' : 'negative'}
        />
        <Metric
          label="最大持仓"
          value={largest?.asset.name ?? '—'}
          {...(largest ? { detail: money.format(largest.marketValue ?? 0) } : {})}
        />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>当前持仓</h2>
            <p>{portfolio!.positions.length} 个标的，按市值排序</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>标的</th>
                <th>数量</th>
                <th>成本价</th>
                <th>市值</th>
                <th>浮盈亏</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {[...portfolio!.positions]
                .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
                .map((position) => (
                  <tr key={position.id}>
                    <td>
                      <strong>{position.asset.name}</strong>
                      <span>{position.symbol}</span>
                    </td>
                    <td>
                      <Button
                        className="text-button"
                        size="sm"
                        type="button"
                        variant="link"
                        onClick={() => setDetailPosition(position)}
                      >
                        查看
                      </Button>
                    </td>
                    <td>{position.quantity}</td>
                    <td>{money.format(position.costPrice)}</td>
                    <td>
                      {position.marketValue === null ? '—' : money.format(position.marketValue)}
                    </td>
                    <td className={(position.pnl ?? 0) >= 0 ? 'positive' : 'negative'}>
                      {position.pnl === null ? '—' : money.format(position.pnl)}
                    </td>
                    <td>
                      <Badge className={position.stale ? 'tag warning' : 'tag'} variant="secondary">
                        {position.stale ? '陈旧' : '最新'}
                      </Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      {detailPosition && (
        <PositionDetail position={detailPosition} onClose={() => setDetailPosition(null)} />
      )}
    </>
  );
}

function PositionDetail({ position, onClose }: { position: Position; onClose: () => void }) {
  const [data, setData] = useState<{
    quote: Record<string, unknown>;
    bars: Array<Record<string, unknown>>;
    indicators: Array<Record<string, unknown>>;
    chip: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const loadDetail = () => {
    const sequence = ++requestSequence.current;
    setData(null);
    setError('');
    const symbol = encodeURIComponent(position.symbol);
    const indicatorNames = ['MA', 'MACD', 'RSI', 'ATR'] as const;
    void Promise.all([
      fetch(`/api/v1/market/${symbol}/quote`),
      fetch(`/api/v1/market/${symbol}/bars?timeframe=1d`),
      ...indicatorNames.map((name) => fetch(`/api/v1/market/${symbol}/indicators/${name}`)),
      fetch(`/api/v1/market/${symbol}/chip`),
    ])
      .then(async (responses) => {
        const quoteResponse = responses[0];
        const barsResponse = responses[1];
        const chipResponse = responses[6]!;
        if (!quoteResponse.ok || !barsResponse.ok || !chipResponse.ok) throw new Error('detail');
        const [quote, bars, chip, ...indicatorValues] = await Promise.all([
          quoteResponse.json(),
          barsResponse.json(),
          chipResponse.json(),
          ...responses.slice(2, 6).map(async (response, index) =>
            response.ok
              ? ((await response.json()) as Record<string, unknown>)
              : {
                  name: indicatorNames[index],
                  values: { status: 'unavailable' },
                  provider: 'dsa-fork',
                  marketTime: new Date().toISOString(),
                },
          ),
        ]);
        if (sequence !== requestSequence.current) return;
        setData({
          quote: quote as Record<string, unknown>,
          bars: bars as Array<Record<string, unknown>>,
          indicators: indicatorValues,
          chip: chip as Record<string, unknown>,
        });
      })
      .catch(() => {
        if (sequence === requestSequence.current) setError('部分行情、指标或筹码数据不可用。');
      });
  };
  useEffect(() => {
    loadDetail();
  }, [position.symbol]);
  const detailState: LoadState = error
    ? 'error'
    : !data
      ? 'loading'
      : data.quote.empty === true
        ? 'empty'
        : data.quote.stale === true
          ? 'stale'
          : 'ready';
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby="position-detail-description"
        className="detail-panel max-h-[calc(100dvh-64px)] max-w-[980px] overflow-auto"
        showCloseButton={false}
      >
        <div className="review-heading">
          <div>
            <p className="kicker">Position Detail</p>
            <DialogTitle id="position-detail-title">
              {position.asset.name} · {position.symbol}
            </DialogTitle>
          </div>
          <DialogClose render={<Button className="secondary" type="button" variant="outline" />}>
            关闭
          </DialogClose>
        </div>
        <DialogDescription id="position-detail-description" className="sr-only">
          查看该持仓的行情、最近 K 线、技术指标和筹码数据。
        </DialogDescription>
        <DataStateBanner state={detailState} onRetry={loadDetail} />
        {error && <div className="notice">{error}</div>}
        {!data && !error ? (
          <div className="skeleton table" aria-label="正在加载详情" />
        ) : data?.quote.empty === true ? (
          <p className="empty-inline">当前没有可用行情、指标或筹码数据。</p>
        ) : (
          data && (
            <>
              <div className="detail-metrics">
                <Metric
                  label="实时价"
                  value={money.format(Number(data.quote.price))}
                  detail={`${String(data.quote.provider)} · ${new Date(String(data.quote.marketTime)).toLocaleString('zh-CN')}`}
                />
                <Metric
                  label="持仓成本"
                  value={money.format(position.costPrice)}
                  detail={`${position.quantity} 份`}
                />
                <Metric
                  label="筹码主峰"
                  value={
                    data.chip.mainPeak === undefined
                      ? '未提供'
                      : money.format(Number(data.chip.mainPeak))
                  }
                  detail={`${String(data.chip.provider)} · ${String(data.chip.engineVersion)}${data.chip.mainPeak === undefined ? ' · 仅摘要' : ''}`}
                />
              </div>
              <h3>最近 K 线</h3>
              <div className="bar-strip">
                {data.bars.slice(-10).map((bar) => (
                  <div key={String(bar.timestamp)}>
                    <span>{new Date(String(bar.timestamp)).toLocaleDateString('zh-CN')}</span>
                    <strong>{Number(bar.close).toFixed(2)}</strong>
                    <small>{String(bar.provider)}</small>
                  </div>
                ))}
              </div>
              <h3>技术指标</h3>
              <div className="indicator-grid">
                {data.indicators.map((indicator) => (
                  <div key={String(indicator.name)}>
                    <span>{String(indicator.name)}</span>
                    <strong>
                      {Object.entries(indicator.values as Record<string, unknown>)
                        .map(([key, value]) => `${key} ${String(value)}`)
                        .join(' · ')}
                    </strong>
                    <small>
                      {String(indicator.provider)} ·{' '}
                      {new Date(String(indicator.marketTime)).toLocaleString('zh-CN')}
                    </small>
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PortfolioManagement({
  accounts,
  positions,
  cashValue,
  step,
  defaultAccountId,
  onAccountSaved,
  onDirtyChange,
  onSaved,
}: {
  accounts: Account[];
  positions: Position[];
  cashValue?: number;
  step: 'account' | 'position';
  defaultAccountId?: string;
  onAccountSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<Position | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [managedAccounts, setManagedAccounts] = useState<Account[]>(accounts);
  const [entryAccountId, setEntryAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const markDirty = (nextDirty = true) => {
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  };
  const confirmDiscard = () =>
    !dirty || window.confirm('当前有未保存修改，切换后会丢弃，继续吗？');
  useEffect(() => {
    if (defaultAccountId) setEntryAccountId(defaultAccountId);
    else if (!entryAccountId && accounts[0]) setEntryAccountId(accounts[0].id);
  }, [accounts, defaultAccountId, entryAccountId]);

  const loadManagedAccounts = async () => {
    if (step !== 'account') return;
    try {
      const response = await fetch('/api/v1/accounts?includeInactive=true', { cache: 'no-store' });
      if (response.ok) setManagedAccounts((await response.json()) as Account[]);
    } catch {
      setManagedAccounts(accounts);
    }
  };
  useEffect(() => {
    setManagedAccounts(accounts);
    void loadManagedAccounts();
  }, [accounts, step]);

  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(
      editingAccount ? '/api/v1/accounts/' + editingAccount.id : '/api/v1/accounts',
      {
        method: editingAccount ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: formText(form, 'name'),
          institution: formText(form, 'institution') || undefined,
          type: formText(form, 'type'),
          mode: formText(form, 'mode') || 'actual',
          currency: 'CNY',
        }),
      },
    );
    if (!response.ok) {
      setMessage(
        editingAccount
          ? '账户更新失败；有 Ledger 历史时类型、模式和币种不可修改。'
          : '账户创建失败，请检查名称、机构和账户类型。',
      );
      return;
    }
    formElement.reset();
    setEditingAccount(null);
    markDirty(false);
    setMessage(editingAccount ? '账户已更新。' : '账户已创建。');
    await loadManagedAccounts();
    (onAccountSaved ?? onSaved)();
  };

  const toggleAccount = async (account: Account) => {
    const active = account.active !== false;
    if (active && !window.confirm('确认停用账户“' + account.name + '”？')) return;
    const response = await fetch(
      active ? '/api/v1/accounts/' + account.id : '/api/v1/accounts/' + account.id + '/reactivate',
      { method: active ? 'DELETE' : 'POST' },
    );
    if (!response.ok) {
      setMessage(active ? '账户仍有余额，需先清空持仓和现金。' : '账户重新启用失败。');
      return;
    }
    markDirty(false);
    setMessage(active ? '账户已停用。' : '账户已重新启用。');
    await loadManagedAccounts();
    onSaved();
  };

  const submitPosition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const accountId = formText(form, 'accountId') || entryAccountId;
    const account = accounts.find((item) => item.id === accountId);
    const isCash = account?.type === 'cash';
    const response = isCash
      ? await fetch('/api/v1/portfolio/cash', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accountId,
            amount: Number(formText(form, 'cashAmount')),
            source: 'manual',
          }),
        })
      : await fetch(
          editing ? '/api/v1/portfolio/positions/' + editing.id : '/api/v1/portfolio/positions',
          {
            method: editing ? 'PATCH' : 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              accountId,
              symbol: formText(form, 'symbol').trim().toUpperCase(),
              quantity: Number(formText(form, 'quantity')),
              costPrice: Number(formText(form, 'costPrice')),
              source: 'manual',
              assetName: formText(form, 'assetName') || undefined,
              assetType: formText(form, 'assetType') || undefined,
            }),
          },
        );
    if (!response.ok) {
      setMessage(
        isCash ? '现金余额保存失败，请检查金额。' : '持仓保存失败，请检查代码、数量和成本价。',
      );
      return;
    }
    formElement.reset();
    setEditing(null);
    markDirty(false);
    setMessage(isCash ? '现金余额已保存。' : '持仓已保存并重新估值。');
    onSaved();
  };

  const submitCashBalance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch('/api/v1/portfolio/cash', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: entryAccountId,
        amount: Number(formText(form, 'cashAmount')),
        source: 'manual',
      }),
    });
    if (!response.ok) {
      setMessage('现金余额保存失败，请检查金额。');
      return;
    }
    formElement.reset();
    markDirty(false);
    setMessage('现金余额已保存。');
    onSaved();
  };

  const clearPositions = async () => {
    if (!entryAccountId || positions.length === 0) return;
    if (!window.confirm('确认清空当前账户的全部持仓？该操作会写入归零 Adjustment，现金余额不受影响。'))
      return;
    const response = await fetch('/api/v1/portfolio/positions/clear', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: entryAccountId }),
    });
    setMessage(response.ok ? '已清空当前账户持仓。' : '清空持仓失败。');
    if (response.ok) {
      markDirty(false);
      onSaved();
    }
  };

  const remove = async (position: Position) => {
    if (!window.confirm('确认删除 ' + position.asset.name + '（' + position.symbol + '）？'))
      return;
    const response = await fetch('/api/v1/portfolio/positions/' + position.id, {
      method: 'DELETE',
    });
    setMessage(response.ok ? '持仓已删除。' : '持仓删除失败。');
    if (response.ok) {
      markDirty(false);
      onSaved();
    }
  };

  const selectedAccount = accounts.find((account) => account.id === entryAccountId);
  return (
    <section
      className="management"
      id="portfolio-management"
      aria-labelledby="portfolio-management-title"
      data-management-step={step}
    >
      <div className="panel-heading">
        <h2 id="portfolio-management-title">{step === 'account' ? '账户管理' : '当前账户持仓'}</h2>
        <p>
          {step === 'account'
            ? '账户只描述容器属性；本次手动或截图来源不会写入账户。'
            : '手动录入保存的是当前余额，系统会生成可重放的 Ledger Adjustment。'}
        </p>
      </div>
      {message && (
        <div className="form-message" role="status">
          {message}
        </div>
      )}
      <div className="management-grid single-step">
        {step === 'account' && (
          <form
            className="form-card"
            onChange={() => markDirty()}
            onSubmit={(event) => void submitAccount(event)}
          >
            <h3>{editingAccount ? '编辑账户' : '创建账户'}</h3>
            <label>
              账户名称
              <Input name="name" required maxLength={80} defaultValue={editingAccount?.name} />
            </label>
            <label>
              机构（可选）
              <Input
                name="institution"
                maxLength={80}
                defaultValue={editingAccount?.institution ?? undefined}
                placeholder="例如：支付宝、某某证券"
              />
            </label>
            <label>
              账户类型
              <Select name="type" defaultValue={editingAccount?.type ?? 'securities'}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      value === 'fund' ? '基金' : value === 'cash' ? '现金' : '证券'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="securities">证券（股票 / 交易所 ETF）</SelectItem>
                  <SelectItem value="fund">基金（场外基金）</SelectItem>
                  <SelectItem value="cash">现金</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              账户模式
              <Select name="mode" defaultValue={editingAccount?.mode ?? 'actual'}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => (value === 'shadow' ? '影子账户' : '实际账户')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="actual">实际账户</SelectItem>
                  <SelectItem value="shadow">影子账户</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              币种
              <Input value="人民币（CNY）" readOnly aria-label="币种" />
            </label>
            <div className="form-actions">
              <Button type="submit" variant="default">
                {editingAccount ? '保存账户' : '创建账户'}
              </Button>
              {editingAccount && (
                <Button
                  className="secondary"
                  type="button"
                  variant="outline"
                  onClick={() => setEditingAccount(null)}
                >
                  取消
                </Button>
              )}
            </div>
            {managedAccounts.length > 0 && (
              <div className="account-list">
                {managedAccounts.map((account) => (
                  <div key={account.id}>
                    <span>
                      {account.name}
                      <small>
                        {(account.institution || '未填写机构') +
                          ' · ' +
                          (account.mode === 'shadow' ? '影子' : '实际') +
                          ' · ' +
                          account.currency +
                          (account.active === false ? ' · 已停用' : '')}
                      </small>
                    </span>
                    <div className="form-actions">
                      <Button
                        className="text-button"
                        size="sm"
                        type="button"
                        variant="link"
                        onClick={() => setEditingAccount(account)}
                      >
                        编辑
                      </Button>
                      <Button
                        className={account.active === false ? 'text-button' : 'text-button danger'}
                        size="sm"
                        type="button"
                        variant={account.active === false ? 'outline' : 'destructive'}
                        onClick={() => void toggleAccount(account)}
                      >
                        {account.active === false ? '重新启用' : '停用'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </form>
        )}
        {step === 'position' && (
          <>
            <form
              className="form-card"
              onChange={() => markDirty()}
              onSubmit={(event) => void submitPosition(event)}
              key={editing?.id ?? 'new'}
            >
            <h3>
              {editing
                ? '编辑 ' + editing.asset.name
                : selectedAccount?.type === 'cash'
                  ? '录入现金余额'
                  : '录入持仓'}
            </h3>
            <label>
              账户
              <Select
                name="accountId"
                required
                value={entryAccountId || null}
                onValueChange={(value) => {
                  if (!value || !confirmDiscard()) return;
                  markDirty(false);
                  setEntryAccountId(value);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择账户">
                    {selectedAccount?.name ?? '选择账户'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {account.institution || '未填写机构'} · {account.currency} ·{' '}
                      {account.type === 'fund' ? '基金' : account.type === 'cash' ? '现金' : '证券'} ·{' '}
                      {account.mode === 'shadow' ? '影子' : '实际'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {selectedAccount?.type === 'cash' ? (
              <label>
                当前现金余额（CNY）
                <Input
                  name="cashAmount"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={cashValue ?? 0}
                />
              </label>
            ) : (
              <>
                <label>
                  证券代码
                  <Input
                    name="symbol"
                    required
                    placeholder={selectedAccount?.type === 'fund' ? '000001.OF' : '600519.SH'}
                    defaultValue={editing?.symbol}
                    readOnly={Boolean(editing)}
                  />
                </label>
                <label>
                  名称（可选）
                  <Input name="assetName" defaultValue={editing?.asset.name} />
                </label>
                <label>
                  类型（可选）
                  <Select
                    name="assetType"
                    defaultValue={editing?.symbol.endsWith('.OF') ? 'fund' : undefined}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string | null) =>
                          value === 'fund'
                            ? '场外基金'
                            : value === 'etf'
                              ? '交易所 ETF'
                              : value === 'stock'
                                ? 'A 股股票'
                                : '自动识别'
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stock">A 股股票</SelectItem>
                      <SelectItem value="etf">交易所 ETF</SelectItem>
                      <SelectItem value="fund">场外基金</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  当前数量
                  <Input
                    name="quantity"
                    required
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={editing?.quantity}
                  />
                </label>
                <label>
                  成本价
                  <Input
                    name="costPrice"
                    required
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={editing?.costPrice}
                  />
                </label>
              </>
            )}
            <div className="form-actions">
              <Button type="submit" variant="default">
                {editing ? '保存修改' : '保存当前持仓'}
              </Button>
              {editing && (
                <Button
                  className="secondary"
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  取消
                </Button>
              )}
            </div>
            </form>
            {selectedAccount?.type !== 'cash' && (
              <form
                className="form-card cash-secondary"
                onChange={() => markDirty()}
                onSubmit={(event) => void submitCashBalance(event)}
              >
                <h3>现金余额（可选）</h3>
                <p className="field-hint">现金单独计入组合总资产，不混入持仓成本和盈亏。</p>
                <label>
                  当前现金余额（CNY）
                  <Input
                    name="cashAmount"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={cashValue ?? 0}
                  />
                </label>
                <div className="form-actions">
                  <Button type="submit" variant="outline">保存当前现金</Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
      {positions.length > 0 && (
        <div className="edit-list" aria-label="持仓操作">
          <div className="form-actions">
            <Button
              className="text-button danger"
              type="button"
              variant="destructive"
              onClick={() => void clearPositions()}
            >
              清空持仓
            </Button>
          </div>
          {positions.map((position) => (
            <div key={position.id}>
              <span>
                {position.asset.name} · {position.symbol}
                <small>
                  {position.source?.startsWith('screenshot:')
                    ? `截图导入（${position.source.slice('screenshot:'.length)}）`
                    : position.source === 'manual'
                      ? '手动设置'
                      : position.source === 'migration'
                        ? '迁移导入'
                        : 'Ledger Adjustment'}
                </small>
              </span>
              <span>
                <Button
                  className="text-button"
                  size="sm"
                  type="button"
                  variant="link"
                  onClick={() => {
                    setEditing(position);
                    setEntryAccountId(position.accountId);
                  }}
                >
                  编辑
                </Button>
                <Button
                  className="text-button danger"
                  size="sm"
                  type="button"
                  variant="destructive"
                  onClick={() => void remove(position)}
                >
                  删除
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function FirstRunOnboarding({
  hasAccount,
  hasPosition = false,
  hasProviderSetup = false,
  hasRiskRule = false,
  onNavigate,
}: {
  hasAccount: boolean;
  hasPosition?: boolean;
  hasProviderSetup?: boolean;
  hasRiskRule?: boolean;
  onNavigate: (view: DesktopNavigationView, options?: OnboardingNavigationOptions) => void;
}) {
  const currentStep = !hasAccount
    ? 1
    : !hasPosition
      ? 2
      : !hasProviderSetup
        ? 3
        : !hasRiskRule
          ? 4
          : null;

  return (
    <section
      className="onboarding"
      aria-labelledby="onboarding-title"
      data-onboarding-step={currentStep ?? 'complete'}
    >
      <div className="panel-heading">
        <p className="kicker">First Run</p>
        <h2 id="onboarding-title">四步完成第一次闭环</h2>
        <p>按顺序完成账户、持仓、数据源和风险提醒配置。敏感凭证由服务端安全保存，页面不会显示。</p>
        <p className="onboarding-progress">
          {currentStep === null ? '四步已完成' : `当前步骤 ${currentStep} / 4`}
        </p>
      </div>
      <ol className="onboarding-steps">
        <li className={hasAccount ? 'complete' : currentStep === 1 ? 'current' : ''}>
          <span className="onboarding-index" aria-hidden="true">
            {hasAccount ? '✓' : '1'}
          </span>
          <div>
            <strong>创建账户</strong>
            <p>
              {hasAccount
                ? '已创建账户，可以继续录入持仓。'
                : '先填写下方账户表单，选择账户类型、模式和币种。'}
            </p>
            <Button
              className="secondary"
              type="button"
              variant="outline"
              onClick={() => onNavigate('position-entry', { step: 'account' })}
            >
              {hasAccount ? '管理账户' : '去创建账户'}
            </Button>
          </div>
        </li>
        <li className={hasPosition ? 'complete' : currentStep === 2 ? 'current' : ''}>
          <span className="onboarding-index" aria-hidden="true">
            {hasPosition ? '✓' : '2'}
          </span>
          <div>
            <strong>录入或导入持仓</strong>
            <p>
              {hasPosition
                ? '已录入持仓，可以继续配置数据源。'
                : '可以手动录入，也可以前往截图审核；草稿确认前不会修改 Ledger。'}
            </p>
            <div className="form-actions">
              <Button
                className="secondary"
                type="button"
                variant="outline"
                onClick={() => onNavigate('position-entry', { step: 'position' })}
              >
                手动录入
              </Button>
              <Button
                className="secondary"
                type="button"
                variant="outline"
                onClick={() => onNavigate('position-entry', { step: 'screenshot' })}
              >
                截图导入
              </Button>
            </div>
          </div>
        </li>
        <li className={hasProviderSetup ? 'complete' : currentStep === 3 ? 'current' : ''}>
          <span className="onboarding-index" aria-hidden="true">
            {hasProviderSetup ? '✓' : '3'}
          </span>
          <div>
            <strong>配置数据源与通知</strong>
            <p>
              {hasProviderSetup
                ? '数据源、通知和自动化已配置。'
                : '配置数据源、通知和自动化；敏感凭证由服务端管理，页面不会回显密钥。'}
            </p>
            <Button
              className="secondary"
              type="button"
              variant="outline"
              onClick={() => onNavigate('providers')}
            >
              打开数据与自动化
            </Button>
          </div>
        </li>
        <li className={hasRiskRule ? 'complete' : currentStep === 4 ? 'current' : ''}>
          <span className="onboarding-index" aria-hidden="true">
            {hasRiskRule ? '✓' : '4'}
          </span>
          <div>
            <strong>设置风险规则</strong>
            <p>
              {hasRiskRule
                ? '已设置风险规则。'
                : '风险提醒用于研究辅助，不代表交易执行保证；通知失败会保留在历史中。'}
            </p>
            <Button
              className="secondary"
              type="button"
              variant="outline"
              onClick={() => onNavigate('risk-center')}
            >
              打开风险中心
            </Button>
          </div>
        </li>
      </ol>
    </section>
  );
}

const Metric = ({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'positive' | 'negative';
}) => (
  <Card className="metric metric-card shadow-none ring-0">
    <CardContent className="metric-content">
      <p>{label}</p>
      <strong className={tone}>{value}</strong>
      {detail && <span>{detail}</span>}
    </CardContent>
  </Card>
);

const StatePanel = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <section className="state-panel">
    <div className="state-graphic" aria-hidden="true">
      <ChartLineUpIcon size={40} />
    </div>
    <h1>{title}</h1>
    <p>{description}</p>
    {children}
  </section>
);

export const DataStateBanner = ({
  state,
  onRetry,
}: {
  state: LoadState;
  onRetry?: (() => void) | undefined;
}) => {
  if (state === 'ready') return null;
  const copy: Record<Exclude<LoadState, 'ready'>, { title: string; description: string }> = {
    loading: { title: '正在加载', description: '正在读取 ThesisLedger 数据，请稍候。' },
    empty: { title: '暂无数据', description: '完成配置或导入后，这里会显示可追溯的数据。' },
    error: { title: '数据读取失败', description: '当前内容未更新为正常值，请检查服务后重试。' },
    stale: { title: '数据可能陈旧', description: '部分来源不可用，当前结果会保留陈旧标记。' },
  };
  const content = copy[state];
  return (
    <Alert
      className={`data-state-banner ${state}`}
      role="status"
      aria-live="polite"
      aria-busy={state === 'loading'}
    >
      <AlertTitle>{content.title}</AlertTitle>
      <AlertDescription>
        <span>{content.description}</span>
      </AlertDescription>
      {onRetry && (state === 'error' || state === 'stale') && (
        <Button className="text-button" size="sm" type="button" variant="link" onClick={onRetry}>
          重新加载
        </Button>
      )}
    </Alert>
  );
};

const DashboardSkeleton = () => (
  <div aria-label="正在加载" aria-busy="true">
    <Skeleton className="skeleton hero" />
    <div className="metrics">
      <Skeleton className="skeleton card" />
      <Skeleton className="skeleton card" />
      <Skeleton className="skeleton card" />
    </div>
    <Skeleton className="skeleton table" />
  </div>
);
