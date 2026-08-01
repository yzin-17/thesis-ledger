/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Phosphor 的条件导出在 ESLint project service 中被识别为 error type，tsc 已独立校验。 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise';
import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp';
import { FlaskIcon } from '@phosphor-icons/react/Flask';
import { GearSixIcon } from '@phosphor-icons/react/GearSix';
import { HouseIcon } from '@phosphor-icons/react/House';
import { RobotIcon } from '@phosphor-icons/react/Robot';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { StrategyIcon } from '@phosphor-icons/react/Strategy';
import { UploadSimpleIcon } from '@phosphor-icons/react/UploadSimple';
import type { DesktopView } from '../views.js';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'stale';
interface Position {
  id: string;
  accountId: string;
  symbol: string;
  quantity: number;
  costPrice: number;
  marketValue: number | null;
  pnl: number | null;
  stale: boolean;
  asset: { name: string };
}
interface Portfolio {
  totalMarketValue: number;
  totalCost: number;
  totalPnl: number;
  partial: boolean;
  valuedAt: string;
  positions: Position[];
}
interface Account {
  id: string;
  name: string;
  source: 'manual' | 'alipay' | 'ths' | 'broker';
  type: 'securities' | 'fund' | 'cash' | 'shadow';
  currency: 'CNY' | 'HKD' | 'USD';
}
interface ImportRow {
  rawSymbol: string;
  rawName?: string;
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
  source: 'alipay' | 'ths' | 'broker' | 'unknown';
  sourceConfidence: number;
  status: 'pending' | 'reviewed' | 'committed' | 'cancelled';
  rows: ImportRow[];
  createdAt: string;
}
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

const nav: Array<{ view: DesktopView; label: string; icon: typeof HouseIcon }> = [
  { view: 'portfolio', label: '投资组合', icon: HouseIcon },
  { view: 'import-review', label: '导入持仓', icon: UploadSimpleIcon },
  { view: 'risk-center', label: '风险中心', icon: ShieldCheckIcon },
  { view: 'performance', label: '收益分析', icon: ChartLineUpIcon },
  { view: 'strategy', label: '策略实验', icon: StrategyIcon },
  { view: 'journal', label: '投资复盘', icon: FlaskIcon },
  { view: 'ai-chat', label: '研究助手', icon: RobotIcon },
  { view: 'providers', label: '数据与自动化', icon: GearSixIcon },
];

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

export function App() {
  const [view, setView] = useState<DesktopView>('portfolio');
  const [state, setState] = useState<LoadState>('loading');
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const loadSequence = useRef(0);

  const load = async () => {
    const sequence = ++loadSequence.current;
    setState('loading');
    try {
      const [portfolioResponse, accountsResponse] = await Promise.all([
        fetch('/api/v1/portfolio/valuation'),
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
    void load();
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">IO</span>
          <span>Investment OS</span>
        </div>
        <nav aria-label="主导航">
          {nav.map(({ view: item, label, icon: Icon }) => (
            <button
              key={item}
              className={view === item ? 'nav-item active' : 'nav-item'}
              type="button"
              aria-label={label}
              aria-current={view === item ? 'page' : undefined}
              onClick={() => setView(item)}
            >
              <Icon size={19} weight={view === item ? 'fill' : 'regular'} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" />
          系统已连接
        </div>
      </aside>
      <main className="content">
        {view === 'portfolio' ? (
          <PortfolioDashboard
            state={state}
            portfolio={portfolio}
            accounts={accounts}
            onRetry={() => void load()}
            onNavigate={setView}
          />
        ) : view === 'import-review' ? (
          <ImportReview accounts={accounts} onPortfolioChanged={() => void load()} />
        ) : view === 'risk-center' ? (
          <RiskCenter accounts={accounts} portfolio={portfolio} />
        ) : view === 'performance' ? (
          <PerformanceDashboard accounts={accounts} />
        ) : view === 'strategy' ? (
          <StrategyDashboard />
        ) : view === 'journal' ? (
          <JournalDashboard />
        ) : view === 'ai-chat' ? (
          <AiChat />
        ) : view === 'providers' ? (
          <ProviderSettings />
        ) : (
          <ModulePlaceholder view={view} />
        )}
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
      <button className="secondary" type="button" onClick={() => void load()}>
        刷新策略任务
      </button>
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <form className="form-card" onSubmit={(event) => void createStrategy(event)}>
        <h3>新建策略</h3>
        <label>
          名称
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Strategy Schema JSON
          <textarea
            value={schemaText}
            onChange={(event) => setSchemaText(event.target.value)}
            rows={12}
          />
        </label>
        <button className="primary" type="submit">
          保存新版本
        </button>
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
              <button className="text-button" onClick={() => void queue(strategy)}>
                排队回测
              </button>
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
                    <button className="text-button" onClick={() => setSelectedJobId(job.id)}>
                      {job.id.slice(0, 8)}
                    </button>
                    <span>{job.strategyVersionId.slice(0, 8)}</span>
                  </td>
                  <td>{job.status}</td>
                  <td>{job.progress}%</td>
                  <td>
                    {job.status === 'queued' && (
                      <button className="text-button" onClick={() => void run(job.id)}>
                        运行
                      </button>
                    )}
                    {!['succeeded', 'failed', 'cancelled'].includes(job.status) && (
                      <button className="text-button danger" onClick={() => void cancel(job.id)}>
                        取消
                      </button>
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
      <button className="secondary" type="button" onClick={() => void loadHistory()}>
        刷新研究历史
      </button>
      <form className="panel form-card" onSubmit={(event) => void startResearch(event)}>
        <label>
          上下文
          <select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
            <option value="portfolio">全组合</option>
            <option value="account">账户</option>
            <option value="position">单个持仓</option>
            <option value="strategy">策略版本</option>
          </select>
        </label>
        {scope === 'position' && (
          <label>
            标的
            <input value={symbol} onChange={(event) => setSymbol(event.target.value)} />
          </label>
        )}
        <label>
          研究问题
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
          />
        </label>
        <button className="primary" type="submit">
          创建研究任务
        </button>
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
          <textarea
            value={tradeText}
            onChange={(event) => setTradeText(event.target.value)}
            rows={12}
            spellCheck={false}
          />
        </label>
        <button className="primary" type="submit" disabled={busy !== null}>
          {busy === 'single' ? '计算中…' : '分析单笔交易'}
        </button>
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
          <textarea
            value={tradesText}
            onChange={(event) => setTradesText(event.target.value)}
            rows={14}
            spellCheck={false}
          />
        </label>
        <button className="primary" type="submit" disabled={busy !== null}>
          {busy === 'behavior' ? '计算中…' : '生成行为复盘'}
        </button>
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
      <button className="secondary" type="button" onClick={() => void load()}>
        刷新 Provider 与自动化
      </button>
      {message && <p className="form-message">{message}</p>}
      <form className="form-card provider-form" onSubmit={(event) => void saveProviderDraft(event)}>
        <h3>新增或更新 Provider</h3>
        <p className="form-help">
          只保存凭证引用；输入框提交后会清空，已保存的凭证只显示配置状态，不会回显密钥。
        </p>
        <div className="provider-form-grid">
          <label>
            名称
            <input
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
            <select
              value={providerDraft.type}
              onChange={(event) =>
                setProviderDraft((current) => ({ ...current, type: event.target.value }))
              }
            >
              <option value="notification">通知</option>
              <option value="market">行情</option>
              <option value="ai">AI</option>
              <option value="vision">图像</option>
            </select>
          </label>
          <label>
            能力（逗号分隔）
            <input
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
            <input
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
        <button className="primary" type="submit">
          保存 Provider
        </button>
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
                    <input
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
                    <button className="text-button" onClick={() => void test(provider.name)}>
                      连通性测试
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void saveProvider(provider, !provider.enabled)}
                    >
                      {provider.enabled ? '停用' : '启用'}
                    </button>
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
                    <button className="text-button" onClick={() => void toggleJob(job)}>
                      {job.enabled ? '停用' : '启用'}
                    </button>
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
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [summary, setSummary] = useState<{ ttwror: number; xirr: number | null } | null>(null);
  const [allocationRows, setAllocationRows] = useState<PerformanceAllocationRecord[]>([]);
  const [rebalanceRows, setRebalanceRows] = useState<RebalanceGapRecord[]>([]);
  const [targetText, setTargetText] = useState('{"股票":0.6,"ETF":0.4}');
  const [message, setMessage] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loadSequence = useRef(0);
  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts]);
  const load = async () => {
    const sequence = ++loadSequence.current;
    setLoadState('loading');
    const cacheBust = `t=${Date.now()}`;
    const query = accountId
      ? `?accountId=${encodeURIComponent(accountId)}&${cacheBust}`
      : `?${cacheBust}`;
    const [historyResponse, summaryResponse, layersResponse, targetsResponse] = await Promise.all([
      fetch(`/api/v1/performance/history${query}`, { cache: 'no-store' }),
      fetch(`/api/v1/performance/summary${query}`, { cache: 'no-store' }),
      fetch(`/api/v1/performance/layers${query}`, { cache: 'no-store' }),
      fetch(
        `/api/v1/performance/targets?scope=${accountId ? 'account' : 'portfolio'}${
          accountId ? `&accountId=${encodeURIComponent(accountId)}` : ''
        }&${cacheBust}`,
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
        setMessage('收益历史读取失败。');
      });
    }
  }, [accountId]);
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
        setMessage('目标权重必须合计 100%。');
        return;
      }
      setMessage('目标配置已保存并生成新版本。');
      await load();
    } catch {
      setMessage('目标配置必须是 JSON 对象。');
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
      <label className="inline-control">
        账户
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">全组合</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
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
          <input
            value={targetText}
            onChange={(event) => setTargetText(event.target.value)}
            aria-describedby="target-help"
          />
        </label>
        <small id="target-help">例如 {`{"股票":0.6,"ETF":0.4}`}，总和必须为 1。</small>
        <button className="primary" type="submit">
          保存目标
        </button>
      </form>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function RiskCenter({ accounts, portfolio }: { accounts: Account[]; portfolio: Portfolio | null }) {
  const [rules, setRules] = useState<RiskRuleRecord[]>([]);
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
      const [ruleResponse, eventResponse, deliveryResponse] = await Promise.all([
        fetch(`/api/v1/risk/rules${cacheBust}`),
        fetch(`/api/v1/risk/events${cacheBust}`),
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
  }, []);

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
      <button className="secondary" type="button" onClick={() => void loadRisk()}>
        刷新风险数据
      </button>
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
          <select name="kind" defaultValue="price-below">
            <option value="price-below">价格低于</option>
            <option value="price-above">价格高于</option>
            <option value="cost-stop">成本止损</option>
            <option value="take-profit">止盈</option>
            <option value="position-concentration">持仓集中度</option>
          </select>
        </label>
        <label>
          范围
          <select name="scope" defaultValue="security">
            <option value="security">证券</option>
            <option value="account">账户</option>
            <option value="portfolio">组合</option>
          </select>
        </label>
        <label>
          阈值
          <input name="threshold" type="number" step="any" required />
        </label>
        <label>
          严重级别
          <select name="severity" defaultValue="warning">
            <option value="info">提示</option>
            <option value="warning">警告</option>
            <option value="error">错误</option>
            <option value="critical">严重</option>
          </select>
        </label>
        <label>
          证券代码
          <input name="symbol" placeholder="security 时填写" />
        </label>
        <label>
          账户
          <select name="accountId" defaultValue="">
            <option value="">account 时选择</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" type="submit">
          创建规则
        </button>
        <button className="secondary" type="button" onClick={() => void scanRisk()}>
          扫描当前组合
        </button>
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
                    <button
                      className="text-button"
                      onClick={() => void patchRule(rule, { enabled: !rule.enabled })}
                    >
                      {rule.enabled ? '停用' : '启用'}
                    </button>
                    <button className="text-button" onClick={() => void testRule(rule)}>
                      测试
                    </button>
                    <button className="text-button" onClick={() => void showAudit(rule)}>
                      审计
                    </button>
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

function ImportReview({
  accounts,
  onPortfolioChanged,
}: {
  accounts: Account[];
  onPortfolioChanged: () => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [source, setSource] = useState<ImportDraftRecord['source']>('unknown');
  const [drafts, setDrafts] = useState<ImportDraftRecord[]>([]);
  const [selected, setSelected] = useState<ImportDraftRecord | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [message, setMessage] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loadSequence = useRef(0);
  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts]);
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
    setMessage('草稿已创建；请逐项确认后提交。');
  };
  const choose = (draft: ImportDraftRecord) => {
    setSelected(draft);
    setRows(draft.rows);
    setSource(draft.source);
  };
  const updateRow = (index: number, patch: Partial<ImportRow>) =>
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
    onPortfolioChanged();
  };
  const rollback = async (draft: ImportDraftRecord) => {
    const response = await fetch(`/api/v1/imports/${draft.id}/rollback`, { method: 'POST' });
    setMessage(response.ok ? '已恢复到本次导入前的持仓。' : '该记录无法回滚。');
    if (response.ok) onPortfolioChanged();
  };
  return (
    <section className="module-page">
      <p className="kicker">Screenshot Import</p>
      <h1>审核导入</h1>
      <p className="page-description">
        上传不会直接修改持仓。代码歧义、低置信度或数值不一致必须先人工修正。
      </p>
      <button
        className="secondary"
        type="button"
        onClick={() => {
          if (accountId) void loadDrafts(accountId);
          else setLoadState('empty');
        }}
      >
        刷新导入历史
      </button>
      {accounts.length === 0 ? (
        <div className="notice">请先在投资组合页创建账户。</div>
      ) : (
        <form className="upload-bar" onSubmit={(event) => void upload(event)}>
          <label>
            账户
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            截图来源
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as ImportDraftRecord['source'])}
            >
              <option value="unknown">待识别</option>
              <option value="alipay">支付宝</option>
              <option value="ths">同花顺</option>
              <option value="broker">券商</option>
            </select>
          </label>
          <label>
            持仓截图
            <input name="file" type="file" required accept="image/png,image/jpeg,image/webp" />
          </label>
          <button className="primary" type="submit">
            创建草稿
          </button>
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
              <button
                key={draft.id}
                className={selected?.id === draft.id ? 'draft active' : 'draft'}
                onClick={() => choose(draft)}
              >
                <strong>{new Date(draft.createdAt).toLocaleString('zh-CN')}</strong>
                <span>
                  {draft.source} · {draft.status}
                </span>
              </button>
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
                <button
                  className="secondary"
                  onClick={() =>
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
                    ])
                  }
                >
                  添加一行
                </button>
              </div>
              {rows.map((row, index) => (
                <div className="review-row" key={`${index}-${row.rawSymbol}`}>
                  <label>
                    名称
                    <input
                      value={row.rawName ?? ''}
                      onChange={(event) => updateRow(index, { rawName: event.target.value })}
                    />
                  </label>
                  <label>
                    代码
                    <input
                      value={row.symbol ?? ''}
                      onChange={(event) =>
                        updateRow(index, { symbol: event.target.value.toUpperCase() })
                      }
                    />
                  </label>
                  <label>
                    数量
                    <input
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
                    <input
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
                    <span className={row.confidence < 0.75 ? 'tag warning' : 'tag'}>
                      {Math.round(row.confidence * 100)}%
                    </span>
                    {row.issues.map((issue) => (
                      <small key={issue}>{issue}</small>
                    ))}
                  </div>
                  <button
                    className="text-button danger"
                    onClick={() =>
                      setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
                    }
                  >
                    删除
                  </button>
                </div>
              ))}
              <div className="form-actions">
                <button
                  className="primary"
                  disabled={selected.status === 'committed'}
                  onClick={() => void commit()}
                >
                  确认并提交
                </button>
                {selected.status === 'committed' && (
                  <button className="secondary" onClick={() => void rollback(selected)}>
                    回滚本次导入
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="empty-inline">选择一条历史记录，或上传截图创建草稿。</div>
          )}
        </div>
      </div>
    </section>
  );
}

function PortfolioDashboard({
  state,
  portfolio,
  accounts,
  onRetry,
  onNavigate,
}: {
  state: LoadState;
  portfolio: Portfolio | null;
  accounts: Account[];
  onRetry: () => void;
  onNavigate: (view: DesktopView) => void;
}) {
  const largest = useMemo(
    () =>
      [...(portfolio?.positions ?? [])].sort(
        (a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0),
      )[0],
    [portfolio],
  );
  const [detailPosition, setDetailPosition] = useState<Position | null>(null);
  if (state === 'loading') return <DashboardSkeleton />;
  if (state === 'error')
    return (
      <StatePanel
        title="暂时无法读取投资组合"
        description="请确认 Investment OS Server 与数据服务正在运行。"
      >
        <button className="primary" onClick={onRetry}>
          <ArrowClockwiseIcon />
          重新加载
        </button>
      </StatePanel>
    );
  if (state === 'empty')
    return (
      <>
        <StatePanel
          title="从第一笔持仓开始"
          description="创建账户后手动录入持仓，或上传一张已脱敏的持仓截图。"
        >
          <span className="muted">下方表单会先校验账户、证券代码、数量和成本价。</span>
        </StatePanel>
        <FirstRunOnboarding hasAccount={accounts.length > 0} onNavigate={onNavigate} />
        <PortfolioManagement accounts={accounts} positions={[]} onSaved={onRetry} />
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
        <button className="secondary" onClick={onRetry}>
          <ArrowClockwiseIcon />
          刷新
        </button>
      </header>
      <DataStateBanner state={state} onRetry={onRetry} />
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
                      <button className="text-button" onClick={() => setDetailPosition(position)}>
                        查看
                      </button>
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
                      <span className={position.stale ? 'tag warning' : 'tag'}>
                        {position.stale ? '陈旧' : '最新'}
                      </span>
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
      <PortfolioManagement accounts={accounts} positions={portfolio!.positions} onSaved={onRetry} />
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
    void Promise.all([
      fetch(`/api/v1/market/${symbol}/quote`),
      fetch(`/api/v1/market/${symbol}/bars?timeframe=1d`),
      ...(['MA', 'MACD', 'RSI', 'ATR'] as const).map((name) =>
        fetch(`/api/v1/market/${symbol}/indicators/${name}`),
      ),
      fetch(`/api/v1/market/${symbol}/chip`),
    ])
      .then(async (responses) => {
        if (responses.some((response) => !response.ok)) throw new Error('detail');
        const values = await Promise.all(responses.map((response) => response.json()));
        if (sequence !== requestSequence.current) return;
        setData({
          quote: values[0] as Record<string, unknown>,
          bars: values[1] as Array<Record<string, unknown>>,
          indicators: values.slice(2, 6) as Array<Record<string, unknown>>,
          chip: values[6] as Record<string, unknown>,
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
    <div className="detail-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="position-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="review-heading">
          <div>
            <p className="kicker">Position Detail</p>
            <h2 id="position-detail-title">
              {position.asset.name} · {position.symbol}
            </h2>
          </div>
          <button className="secondary" onClick={onClose}>
            关闭
          </button>
        </div>
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
                  value={money.format(Number(data.chip.mainPeak))}
                  detail={`${String(data.chip.provider)} · ${String(data.chip.engineVersion)}`}
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
      </section>
    </div>
  );
}

function PortfolioManagement({
  accounts,
  positions,
  onSaved,
}: {
  accounts: Account[];
  positions: Position[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<Position | null>(null);
  const [message, setMessage] = useState('');
  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch('/api/v1/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: formText(form, 'name'),
        source: formText(form, 'source'),
        type: formText(form, 'type'),
        currency: formText(form, 'currency'),
      }),
    });
    if (!response.ok) {
      setMessage('账户创建失败，请检查名称、来源和币种。');
      return;
    }
    formElement.reset();
    setMessage('账户已创建。');
    onSaved();
  };
  const submitPosition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(
      editing ? `/api/v1/portfolio/positions/${editing.id}` : '/api/v1/portfolio/positions',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: formText(form, 'accountId'),
          symbol: formText(form, 'symbol').trim().toUpperCase(),
          quantity: Number(formText(form, 'quantity')),
          costPrice: Number(formText(form, 'costPrice')),
          source: 'manual',
        }),
      },
    );
    if (!response.ok) {
      setMessage('持仓保存失败，请检查证券代码、数量和成本价。');
      return;
    }
    formElement.reset();
    setEditing(null);
    setMessage('持仓已保存并重新估值。');
    onSaved();
  };
  const remove = async (position: Position) => {
    if (!window.confirm(`确认删除 ${position.asset.name}（${position.symbol}）？`)) return;
    const response = await fetch(`/api/v1/portfolio/positions/${position.id}`, {
      method: 'DELETE',
    });
    setMessage(response.ok ? '持仓已删除。' : '持仓删除失败。');
    if (response.ok) onSaved();
  };
  const deactivateAccount = async (account: Account) => {
    if (!window.confirm(`确认停用账户“${account.name}”？`)) return;
    const response = await fetch(`/api/v1/accounts/${account.id}`, { method: 'DELETE' });
    setMessage(response.ok ? '账户已停用。' : '账户仍有持仓，需先清空持仓。');
    if (response.ok) onSaved();
  };
  return (
    <section
      className="management"
      id="portfolio-management"
      aria-labelledby="portfolio-management-title"
    >
      <div className="panel-heading">
        <h2 id="portfolio-management-title">账户与持仓录入</h2>
        <p>保存后立即参与组合估值；编辑会覆盖同一账户、同一标的的数量和成本。</p>
      </div>
      {message && (
        <div className="form-message" role="status">
          {message}
        </div>
      )}
      <div className="management-grid">
        <form className="form-card" onSubmit={(event) => void submitAccount(event)}>
          <h3>创建账户</h3>
          <label>
            账户名称
            <input name="name" required maxLength={80} />
          </label>
          <label>
            来源
            <select name="source" defaultValue="manual">
              <option value="manual">手动</option>
              <option value="alipay">支付宝</option>
              <option value="ths">同花顺</option>
              <option value="broker">券商</option>
            </select>
          </label>
          <label>
            账户类型
            <select name="type" defaultValue="securities">
              <option value="securities">证券</option>
              <option value="fund">基金</option>
              <option value="cash">现金</option>
              <option value="shadow">影子账户</option>
            </select>
          </label>
          <label>
            币种
            <select name="currency" defaultValue="CNY">
              <option value="CNY">人民币</option>
              <option value="HKD">港币</option>
              <option value="USD">美元</option>
            </select>
          </label>
          <button className="primary" type="submit">
            创建账户
          </button>
          {accounts.length > 0 && (
            <div className="account-list">
              {accounts.map((account) => (
                <div key={account.id}>
                  <span>
                    {account.name}
                    <small>
                      {account.source} · {account.currency}
                    </small>
                  </span>
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => void deactivateAccount(account)}
                  >
                    停用
                  </button>
                </div>
              ))}
            </div>
          )}
        </form>
        <form
          className="form-card"
          onSubmit={(event) => void submitPosition(event)}
          key={editing?.id ?? 'new'}
        >
          <h3>{editing ? `编辑 ${editing.asset.name}` : '录入持仓'}</h3>
          <label>
            账户
            <select name="accountId" required defaultValue={editing?.accountId ?? ''}>
              <option value="" disabled>
                选择账户
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            证券代码
            <input
              name="symbol"
              required
              placeholder="600519.SH"
              defaultValue={editing?.symbol}
              readOnly={Boolean(editing)}
            />
          </label>
          <label>
            数量
            <input
              name="quantity"
              required
              type="number"
              min="0.00000001"
              step="any"
              defaultValue={editing?.quantity}
            />
          </label>
          <label>
            成本价
            <input
              name="costPrice"
              required
              type="number"
              min="0"
              step="any"
              defaultValue={editing?.costPrice}
            />
          </label>
          <div className="form-actions">
            <button className="primary" type="submit">
              {editing ? '保存修改' : '添加持仓'}
            </button>
            {editing && (
              <button className="secondary" type="button" onClick={() => setEditing(null)}>
                取消
              </button>
            )}
          </div>
        </form>
      </div>
      {positions.length > 0 && (
        <div className="edit-list" aria-label="持仓操作">
          {positions.map((position) => (
            <div key={position.id}>
              <span>
                {position.asset.name} · {position.symbol}
              </span>
              <span>
                <button className="text-button" onClick={() => setEditing(position)}>
                  编辑
                </button>
                <button className="text-button danger" onClick={() => void remove(position)}>
                  删除
                </button>
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
  onNavigate,
}: {
  hasAccount: boolean;
  onNavigate: (view: DesktopView) => void;
}) {
  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div className="panel-heading">
        <p className="kicker">First Run</p>
        <h2 id="onboarding-title">四步完成第一次闭环</h2>
        <p>按顺序完成账户、持仓、数据源和风险提醒配置。敏感凭证由服务端安全保存，页面不会显示。</p>
      </div>
      <ol className="onboarding-steps">
        <li className={hasAccount ? 'complete' : 'current'}>
          <span className="onboarding-index" aria-hidden="true">
            {hasAccount ? '✓' : '1'}
          </span>
          <div>
            <strong>创建账户</strong>
            <p>
              {hasAccount
                ? '已创建账户，可以继续录入持仓。'
                : '先填写下方账户表单，选择来源和币种。'}
            </p>
          </div>
        </li>
        <li className="current">
          <span className="onboarding-index" aria-hidden="true">
            2
          </span>
          <div>
            <strong>录入或导入持仓</strong>
            <p>可以手动录入，也可以前往截图审核；草稿确认前不会修改 Ledger。</p>
            <div className="form-actions">
              <a className="secondary" href="#portfolio-management">
                手动录入
              </a>
              <button
                className="secondary"
                type="button"
                onClick={() => onNavigate('import-review')}
              >
                截图导入
              </button>
            </div>
          </div>
        </li>
        <li>
          <span className="onboarding-index" aria-hidden="true">
            3
          </span>
          <div>
            <strong>配置数据源与通知</strong>
            <p>查看数据源与通知是否可用；敏感凭证由服务端管理，页面不会回显密钥。</p>
            <button className="text-button" type="button" onClick={() => onNavigate('providers')}>
              打开数据与自动化
            </button>
          </div>
        </li>
        <li>
          <span className="onboarding-index" aria-hidden="true">
            4
          </span>
          <div>
            <strong>设置风险规则</strong>
            <p>风险提醒用于研究辅助，不代表交易执行保证；通知失败会保留在历史中。</p>
            <button className="text-button" type="button" onClick={() => onNavigate('risk-center')}>
              打开风险中心
            </button>
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
  <article className="metric">
    <p>{label}</p>
    <strong className={tone}>{value}</strong>
    {detail && <span>{detail}</span>}
  </article>
);

const StatePanel = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
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
    loading: { title: '正在加载', description: '正在读取 Investment OS 数据，请稍候。' },
    empty: { title: '暂无数据', description: '完成配置或导入后，这里会显示可追溯的数据。' },
    error: { title: '数据读取失败', description: '当前内容未更新为正常值，请检查服务后重试。' },
    stale: { title: '数据可能陈旧', description: '部分来源不可用，当前结果会保留陈旧标记。' },
  };
  const content = copy[state];
  return (
    <div
      className={`data-state-banner ${state}`}
      role="status"
      aria-live="polite"
      aria-busy={state === 'loading'}
    >
      <strong>{content.title}</strong>
      <span>{content.description}</span>
      {onRetry && (state === 'error' || state === 'stale') && (
        <button className="text-button" type="button" onClick={onRetry}>
          重新加载
        </button>
      )}
    </div>
  );
};

const DashboardSkeleton = () => (
  <div aria-label="正在加载" aria-busy="true">
    <div className="skeleton hero" />
    <div className="metrics">
      <div className="skeleton card" />
      <div className="skeleton card" />
      <div className="skeleton card" />
    </div>
    <div className="skeleton table" />
  </div>
);

function ModulePlaceholder({ view }: { view: DesktopView }) {
  const labels: Partial<Record<DesktopView, [string, string]>> = {
    'import-review': ['审核导入', '逐项确认识别结果、资产匹配和数值警告后再提交。'],
    'risk-center': ['风险中心', '集中查看规则、触发事件、通知状态和当前风险敞口。'],
    performance: ['收益分析', '使用 Ledger 与组合快照解释收益、回撤和资产配置。'],
    strategy: ['策略实验', '版本化策略定义，并在包含 A 股交易约束的数据上回测。'],
    journal: ['投资复盘', '连接交易计划、实际执行、行为偏差和周期复盘。'],
    'ai-chat': ['研究助手', '所有关键结论都引用 Investment OS Tool 提供的事实。'],
    providers: ['数据与自动化', '管理 Provider 路由、健康、任务调度和失败历史。'],
  };
  const [title, description] = labels[view] ?? ['模块', '该模块正在加载。'];
  return (
    <section className="module-intro">
      <p className="kicker">Investment OS</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="module-grid">
        <div>
          <span>数据来源</span>
          <strong>可追溯</strong>
        </div>
        <div>
          <span>运行边界</span>
          <strong>仅分析，不交易</strong>
        </div>
        <div>
          <span>当前状态</span>
          <strong>已连接</strong>
        </div>
      </div>
    </section>
  );
}
