/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Phosphor 的条件导出在 ESLint project service 中被识别为 error type，tsc 已独立校验。 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Combobox } from '@base-ui/react/combobox';
import { useQuery } from '@tanstack/react-query';
import { debounce } from 'es-toolkit';
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
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToastManager } from '@/components/ui/toast';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { MarketDataSettings } from './MarketDataSettings.js';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise';
import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp';
import { FlaskIcon } from '@phosphor-icons/react/Flask';
import { GearSixIcon } from '@phosphor-icons/react/GearSix';
import { HouseIcon } from '@phosphor-icons/react/House';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/MagnifyingGlass';
import { RobotIcon } from '@phosphor-icons/react/Robot';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { SpinnerGapIcon } from '@phosphor-icons/react/SpinnerGap';
import { StrategyIcon } from '@phosphor-icons/react/Strategy';
import { UploadSimpleIcon } from '@phosphor-icons/react/UploadSimple';
import { LoaderCircle } from 'lucide-react';
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
  asset: { name: string; assetType?: HeldAssetType };
}
interface InstrumentLookup {
  id: string;
  symbol: string;
  canonicalCode: string;
  instrumentType: string;
  market: string;
  displayName: string;
  confirmable: boolean;
  disabledReason?: string | null;
}
type HeldAssetType = 'stock' | 'etf' | 'fund';
type InstrumentSearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error' | 'selected';

const instrumentTypeLabel = (instrumentType: string) => {
  if (instrumentType === 'ETF') return 'ETF';
  if (instrumentType === 'MUTUAL_FUND') return '基金';
  return '股票';
};

const instrumentMarketLabel = (market: string) => {
  if (market === 'SH') return '上海证券交易所';
  if (market === 'SZ') return '深圳证券交易所';
  if (market === 'BJ') return '北京证券交易所';
  if (market === 'HK') return '香港交易所';
  if (market === 'OF') return '场外基金';
  return market;
};

const instrumentAssetType = (instrumentType: string): HeldAssetType => {
  if (instrumentType === 'ETF') return 'etf';
  if (instrumentType === 'MUTUAL_FUND') return 'fund';
  return 'stock';
};

const assetTypeLabel = (assetType?: HeldAssetType) => {
  if (assetType === 'etf') return 'ETF';
  if (assetType === 'fund') return '基金';
  return '股票';
};

const assetQuantityUnit = (assetType?: HeldAssetType, symbol?: string) =>
  assetType === 'stock' || (!assetType && !symbol?.endsWith('.OF')) ? '股' : '份';

export function InstrumentCombobox({
  editing,
  manualEntry,
  open,
  query,
  results,
  searchState,
  selectedInstrument,
  busy,
  onClearSelection,
  onManualEntry,
  onOpenChange,
  onQueryChange,
  onSelect,
  onStartSearch,
}: {
  editing?: Position | null;
  manualEntry: boolean;
  open: boolean;
  query: string;
  results: InstrumentLookup[];
  searchState: InstrumentSearchState;
  selectedInstrument: InstrumentLookup | null;
  busy: boolean;
  onClearSelection: () => void;
  onManualEntry: () => void;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (value: string) => void;
  onSelect: (instrument: InstrumentLookup) => void;
  onStartSearch: () => void;
}) {
  const isLoading = busy;

  if (editing) {
    const market = editing.symbol.split('.').at(-1) ?? '';
    return (
      <div className="grid gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <span className="min-w-0">
            <strong className="block truncate text-sm font-medium text-foreground">
              {editing.asset.name || editing.symbol}
            </strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              {assetTypeLabel(editing.asset.assetType)} · {instrumentMarketLabel(market)}
            </span>
          </span>
          <code className="self-start pt-0.5 font-mono text-xs text-muted-foreground">
            {editing.symbol}
          </code>
        </div>
        <input type="hidden" name="symbol" value={editing.symbol} />
      </div>
    );
  }

  if (selectedInstrument) {
    return (
      <div className="grid gap-2">
        <button
          type="button"
          className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-brand-soft-border bg-brand-soft px-3 py-2.5 text-left transition-colors hover:bg-brand-soft/80"
          aria-label={`更换标的，当前为${selectedInstrument.displayName}`}
          onClick={onClearSelection}
        >
          <span className="min-w-0">
            <strong className="block truncate text-sm font-medium text-foreground">
              {selectedInstrument.displayName}
            </strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              {instrumentTypeLabel(selectedInstrument.instrumentType)} ·{' '}
              {instrumentMarketLabel(selectedInstrument.market)}
            </span>
          </span>
          <code className="self-start pt-0.5 font-mono text-xs text-muted-foreground">
            {selectedInstrument.symbol}
          </code>
        </button>
        <input type="hidden" name="symbol" value={selectedInstrument.symbol} />
      </div>
    );
  }

  if (manualEntry) {
    return (
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">未找到目录标的，请补充信息</span>
          <Button
            className="text-button"
            type="button"
            size="sm"
            variant="link"
            onClick={onClearSelection}
          >
            重新搜索
          </Button>
        </div>
        <Input
          name="symbol"
          required
          pattern="\\d{6}\\.(SH|SZ|BJ|OF)"
          value={query}
          placeholder="例如：600519.SH"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <Combobox.Root
      open={open}
      items={results}
      filter={null}
      inputValue={query}
      autoHighlight
      onOpenChange={onOpenChange}
      onInputValueChange={onQueryChange}
      onValueChange={(instrument) => {
        if (instrument) onSelect(instrument);
      }}
      itemToStringLabel={(instrument: InstrumentLookup) => instrument.displayName}
      itemToStringValue={(instrument: InstrumentLookup) => instrument.symbol}
    >
      <InputGroup className="h-10">
        <Combobox.Input
          data-slot="input-group-control"
          className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2.5 py-2 text-base text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          placeholder="搜索代码或名称"
          aria-label="搜索代码或名称"
          aria-busy={busy}
          onFocus={onStartSearch}
        />
        <InputGroupAddon align="inline-start">
          <MagnifyingGlassIcon aria-hidden="true" />
        </InputGroupAddon>
        {isLoading && (
          <InputGroupAddon align="inline-end">
            <SpinnerGapIcon className="animate-spin" aria-hidden="true" />
          </InputGroupAddon>
        )}
      </InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner className="layer-popover" side="bottom" align="start" sideOffset={4}>
          <Combobox.Popup
            aria-label="标的搜索结果"
            className="w-(--anchor-width) overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          >
            <Combobox.List className="max-h-72 overflow-auto p-1">
              <Combobox.Status className="px-3 py-2 text-sm text-muted-foreground">
                {isLoading
                  ? '正在搜索...'
                  : searchState === 'error'
                    ? '搜索暂时不可用，请稍后重试。'
                    : ''}
              </Combobox.Status>
              {!isLoading &&
                searchState === 'results' &&
                results.map((instrument, index) => (
                  <Combobox.Item
                    key={instrument.id}
                    value={instrument}
                    index={index}
                    className="flex w-full cursor-default items-start gap-3 rounded-sm px-3 py-2 text-left outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className="min-w-0 flex-1">
                      <code className="block font-mono text-xs text-muted-foreground">
                        {instrument.symbol}
                      </code>
                      <strong className="mt-0.5 block truncate text-sm font-medium">
                        {instrument.displayName}
                      </strong>
                      <small className="mt-0.5 block text-xs text-muted-foreground">
                        {instrumentTypeLabel(instrument.instrumentType)} ·{' '}
                        {instrumentMarketLabel(instrument.market)}
                      </small>
                    </span>
                  </Combobox.Item>
                ))}
              <Combobox.Empty className="px-3 py-2">
                {searchState === 'empty' && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-muted-foreground">
                      未找到“{query}”
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={onManualEntry}>
                      手动录入标的
                    </Button>
                  </div>
                )}
              </Combobox.Empty>
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
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

export interface OnboardingProviderRecord {
  enabled?: boolean;
  health?: string;
  credentialConfigured?: boolean;
  capabilities?: unknown;
}

interface OnboardingRiskRuleRecord {
  enabled?: boolean;
}

export const hasConfiguredProviderSetup = (providers: readonly OnboardingProviderRecord[]) => {
  const configuredProviders = providers.filter(
    (provider) =>
      provider.enabled !== false &&
      provider.health !== 'down' &&
      provider.credentialConfigured === true,
  );
  const hasCapability = (provider: OnboardingProviderRecord, capability: string) =>
    Array.isArray(provider.capabilities) &&
    provider.capabilities.some((item) => String(item) === capability);
  return (
    configuredProviders.some((provider) => hasCapability(provider, 'quote')) &&
    configuredProviders.some((provider) => hasCapability(provider, 'notification'))
  );
};

const navIcons: Record<DesktopNavigationView, typeof HouseIcon> = {
  portfolio: HouseIcon,
  'position-entry': UploadSimpleIcon,
  'risk-center': ShieldCheckIcon,
  performance: ChartLineUpIcon,
  strategy: StrategyIcon,
  journal: FlaskIcon,
  'ai-chat': RobotIcon,
  providers: GearSixIcon,
  'market-data': ChartLineUpIcon,
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
  if (step === 'account') {
    return <Navigate to="/accounts" replace />;
  }
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
    if (nextView === 'position-entry' && options?.step === 'account') {
      void navigate('/accounts');
      return;
    }
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
                accountsReady={state !== 'loading' && state !== 'error'}
                onPortfolioChanged={() => void load()}
              />
            }
          />
          <Route
            path="/accounts"
            element={
              <PortfolioManagement
                accounts={accounts}
                positions={[]}
                step="account"
                accountsReady={state !== 'loading' && state !== 'error'}
                onAccountEntry={(accountId) => {
                  const params = new URLSearchParams({
                    accountId,
                    method: 'manual',
                    step: 'position',
                  });
                  void navigate({ pathname: '/position-entry', search: `?${params.toString()}` });
                }}
                onSaved={() => void load()}
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
          <Route path="/market-data" element={<MarketDataSettings />} />
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const toastManager = useToastManager();
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
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const createStrategy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    setBusyAction('create-strategy');
    try {
      const response = await fetch('/api/v1/backtests/strategies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, schema: JSON.parse(schemaText) }),
      });
      if (!response.ok) throw new Error('create');
      toastManager.add({
        title: '策略已创建',
        description: '旧版本不会被覆盖。',
        type: 'success',
        timeout: 2800,
      });
      await load();
    } catch {
      toastManager.add({
        title: '策略创建失败',
        description: '请检查策略 JSON 或 Schema。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
  const queue = async (strategy: (typeof strategies)[number]) => {
    if (busyAction) return;
    const version = strategy.versions.at(-1);
    if (!version) return;
    setBusyAction(`queue:${strategy.id}`);
    let schema: Record<string, unknown>;
    try {
      schema = JSON.parse(schemaText) as Record<string, unknown>;
    } catch {
      setBusyAction(null);
      toastManager.add({
        title: '回测排队失败',
        description: '请检查策略 JSON 或 Schema。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
      return;
    }
    try {
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
      if (!response.ok) throw new Error('queue');
      toastManager.add({ title: '回测已排队', type: 'success', timeout: 2800 });
      await load();
    } catch {
      toastManager.add({
        title: '回测排队失败',
        description: '请检查策略配置和服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
  const run = async (jobId: string) => {
    if (busyAction) return;
    setBusyAction(`run:${jobId}`);
    try {
      const response = await fetch(`/api/v1/backtests/jobs/${jobId}/run`, { method: 'POST' });
      if (!response.ok) throw new Error('run');
      toastManager.add({ title: '回测已启动', type: 'success', timeout: 2800 });
      await load();
    } catch {
      toastManager.add({
        title: '回测启动失败',
        description: '请检查任务状态和服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
  const cancel = async (jobId: string) => {
    if (busyAction) return;
    setBusyAction(`cancel:${jobId}`);
    try {
      const response = await fetch(`/api/v1/backtests/jobs/${jobId}/cancel`, { method: 'POST' });
      if (!response.ok) throw new Error('cancel');
      toastManager.add({ title: '回测已取消', type: 'success', timeout: 2800 });
      await load();
    } catch {
      toastManager.add({
        title: '回测取消失败',
        description: '请检查任务状态和服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
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
        <Button disabled={busyAction !== null} type="submit" variant="default">
          {busyAction === 'create-strategy' && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busyAction === 'create-strategy' ? '保存中…' : '保存新版本'}
        </Button>
      </form>
      <section className="panel">
        <div className="panel-heading">
          <h2>策略版本</h2>
        </div>
        <div className="edit-list">
          {isDataLoaded(loadState) && strategies.length === 0 ? (
            <EmptyListState className="justify-center border-b-0" />
          ) : (
            strategies.map((strategy) => (
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
                  disabled={busyAction !== null}
                  aria-busy={busyAction === `queue:${strategy.id}`}
                  onClick={() => void queue(strategy)}
                >
                  {busyAction === `queue:${strategy.id}` && (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {busyAction === `queue:${strategy.id}` ? '排队中…' : '排队回测'}
                </Button>
              </div>
            ))
          )}
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
              {isDataLoaded(loadState) && jobs.length === 0 ? (
                <EmptyTableRow colSpan={4} />
              ) : (
                jobs.map((job) => (
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
                          disabled={busyAction !== null}
                          aria-busy={busyAction === `run:${job.id}`}
                          onClick={() => void run(job.id)}
                        >
                          {busyAction === `run:${job.id}` && (
                            <LoaderCircle
                              data-icon="inline-start"
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          )}
                          {busyAction === `run:${job.id}` ? '运行中…' : '运行'}
                        </Button>
                      )}
                      {!['succeeded', 'failed', 'cancelled'].includes(job.status) && (
                        <Button
                          className="text-button danger"
                          size="sm"
                          variant="destructive"
                          disabled={busyAction !== null}
                          aria-busy={busyAction === `cancel:${job.id}`}
                          onClick={() => void cancel(job.id)}
                        >
                          {busyAction === `cancel:${job.id}` && (
                            <LoaderCircle
                              data-icon="inline-start"
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          )}
                          {busyAction === `cancel:${job.id}` ? '取消中…' : '取消'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
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
                      <EmptyTableRow colSpan={2} />
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
                      <EmptyTableRow colSpan={5} />
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
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loadSequence = useRef(0);
  const toastManager = useToastManager();
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
    }
  };
  useEffect(() => {
    void loadHistory();
  }, []);
  const startResearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
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
      if (!response.ok) throw new Error('research');
      setRun((await response.json()) as typeof run);
      toastManager.add({
        title: '研究任务已创建',
        description: `已记录研究问题：${question}`,
        type: 'success',
        timeout: 2800,
      });
      await loadHistory().catch(() => undefined);
    } catch {
      toastManager.add({
        title: '研究任务创建失败',
        description: '请检查 Provider 状态和服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusy(false);
    }
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
        <Button disabled={busy} type="submit" variant="default">
          {busy && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busy ? '创建中…' : '创建研究任务'}
        </Button>
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
              {isDataLoaded(loadState) && history.length === 0 ? (
                <EmptyTableRow colSpan={5} />
              ) : (
                history.map((item) => (
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
                ))
              )}
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
  const [busy, setBusy] = useState<'single' | 'behavior' | null>(null);
  const toastManager = useToastManager();

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
      toastManager.add({
        title: '单笔复盘完成',
        description: aiRun
          ? 'AI 解释任务只接收已计算的事实。'
          : '确定性复盘完成；AI Provider 当前不可用。',
        type: aiRun ? 'success' : 'warning',
        timeout: aiRun ? 2800 : 7000,
      });
    } catch {
      toastManager.add({
        title: '单笔复盘失败',
        description: '请检查交易 JSON 和服务状态。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusy(null);
    }
  };

  const reviewBehavior = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('behavior');
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
      toastManager.add({
        title: '行为复盘完成',
        description: aiRun
          ? '报告引用 Journal/Behavior 的确定性结果。'
          : '确定性行为指标完成；AI Provider 当前不可用。',
        type: aiRun ? 'success' : 'warning',
        timeout: aiRun ? 2800 : 7000,
      });
    } catch {
      toastManager.add({
        title: '行为复盘失败',
        description: '请检查交易数组 JSON 和服务状态。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
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
          {busy === 'single' && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
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
          <p className="form-help">
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
          {busy === 'behavior' && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
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

const providerCapabilityOptions = [
  { value: 'notification', label: '通知' },
  { value: 'quote', label: '报价' },
  { value: 'bars-1d', label: '日线' },
  { value: 'bars-1m', label: '分钟线' },
  { value: 'indicator', label: '指标' },
  { value: 'chip', label: '筹码' },
  { value: 'financials', label: '财务' },
  { value: 'news', label: '新闻' },
  { value: 'announcements', label: '公告' },
  { value: 'chat', label: '对话' },
  { value: 'vision', label: '图像理解' },
] as const;
const providerTypeLabels: Record<string, string> = {
  notification: '通知',
  market: '行情',
  ai: 'AI',
  vision: '图像',
};
const providerTypeLabel = (type: string) => providerTypeLabels[type] ?? `其他（${type}）`;
const providerCapabilityLabel = (capability: string) =>
  providerCapabilityOptions.find((item) => item.value === capability)?.label ??
  `其他（${capability}）`;
type ProviderStatusTone = 'normal' | 'error' | 'warning' | 'neutral';
export interface ProviderStatusInput {
  enabled: boolean;
  health: string;
  credentialConfigured?: boolean;
}
export const providerDisplayStatus = (
  provider: ProviderStatusInput,
): { label: string; tone: ProviderStatusTone } => {
  if (!provider.enabled) return { label: '已停用', tone: 'neutral' };
  if (!provider.credentialConfigured) return { label: '未配置', tone: 'warning' };
  if (provider.health === 'healthy') return { label: '正常', tone: 'normal' };
  if (provider.health === 'degraded' || provider.health === 'down') {
    return { label: '异常', tone: 'error' };
  }
  return { label: '未测试', tone: 'neutral' };
};
const providerHealthSourceLabel = (source?: string) =>
  ({
    manual: '手动测试',
    scheduled: '定时检查',
    delivery: '实际投递',
  })[source ?? ''] ?? '其他检查';
const providerCredentialTypeLabels: Record<string, string> = {
  notification: 'Webhook / Token',
  market: '行情 API Key / Token',
  ai: 'AI API Key / Token',
  vision: '图像 API Key / Token',
};
export const providerCredentialLabel = (name: string, type: string) => {
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (
    type === 'notification' &&
    ['feishu', 'feishu-webhook', 'lark', 'lark-webhook'].includes(normalizedName)
  ) {
    return '飞书 Webhook';
  }
  return providerCredentialTypeLabels[type] ?? 'API Key / Token';
};
const providerCredentialPlaceholder = (label: string) =>
  label.includes('Webhook') ? '输入 Webhook 地址' : '输入 API Key 或 Token';
type ProviderTestState = 'idle' | 'testing' | 'success' | 'warning' | 'error';
export interface ProviderTestEvidence {
  token: string;
  credentialsRef?: string;
}
export const providerCredentialForSave = (
  draftCredential: string,
  testEvidence: ProviderTestEvidence | null,
) => testEvidence?.credentialsRef ?? draftCredential.trim();
export const replaceProviderRecord = <T extends { name: string }>(
  current: readonly T[],
  saved: T,
) =>
  current.some((provider) => provider.name === saved.name)
    ? current.map((provider) => (provider.name === saved.name ? saved : provider))
    : [...current, saved];
export const sortProviderRecords = <T extends { name: string; priority: number }>(
  providers: readonly T[],
) =>
  [...providers].sort(
    (left, right) => left.priority - right.priority || left.name.localeCompare(right.name),
  );
export const providerCredentialConfiguredAfterSave = (
  responseValue: boolean | undefined,
  submittedCredential: string,
  currentValue: boolean | undefined,
) => responseValue ?? (Boolean(submittedCredential) || currentValue === true);
const newProviderDraft = () => ({
  name: 'feishu',
  type: 'notification',
  capabilities: ['notification'],
  credentialsRef: '',
  priority: 1,
  enabled: true,
});

const EmptyTableRow = ({ colSpan }: { colSpan: number }) => (
  <tr>
    <td className="p-0 text-center hover:bg-transparent" colSpan={colSpan}>
      <Empty className="min-h-16 rounded-none border-0 px-3 py-[18px]" aria-live="polite">
        <EmptyDescription>暂无记录</EmptyDescription>
      </Empty>
    </td>
  </tr>
);

const EmptyListState = ({ className }: { className?: string }) => (
  <Empty className={cn('min-h-16 rounded-none border-0 p-5', className)} aria-live="polite">
    <EmptyDescription>暂无记录</EmptyDescription>
  </Empty>
);

const isDataLoaded = (state: LoadState) => state === 'ready' || state === 'empty';

type ProviderHealthHistoryRecord = {
  provider: string;
  state: string;
  latencyMs: number | null;
  checkedAt: string;
  source?: string;
};

type ProviderHealthHistoryPage = {
  items: ProviderHealthHistoryRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const PROVIDER_HEALTH_HISTORY_PAGE_SIZE = 20;

export const normalizeProviderHealthHistory = (
  value: unknown,
  requestedPage: number,
  pageSize: number,
): ProviderHealthHistoryPage => {
  const safePage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  if (Array.isArray(value)) {
    const total = value.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const page = totalPages === 0 ? 1 : Math.min(safePage, totalPages);
    const start = (page - 1) * pageSize;
    return {
      items: value.slice(start, start + pageSize) as ProviderHealthHistoryRecord[],
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    !('items' in value) ||
    !Array.isArray(value.items)
  ) {
    throw new Error('Provider 健康历史响应格式无效');
  }

  const response = value as Partial<ProviderHealthHistoryPage>;
  const items = value.items as ProviderHealthHistoryRecord[];
  const responsePageSize =
    typeof response.pageSize === 'number' && response.pageSize > 0 ? response.pageSize : pageSize;
  const total =
    typeof response.total === 'number' && response.total >= 0 ? response.total : items.length;
  const totalPages =
    typeof response.totalPages === 'number' && response.totalPages >= 0
      ? response.totalPages
      : total === 0
        ? 0
        : Math.ceil(total / responsePageSize);
  const page = typeof response.page === 'number' && response.page > 0 ? response.page : safePage;

  return { items, page, pageSize: responsePageSize, total, totalPages };
};

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
  const [healthHistory, setHealthHistory] = useState<ProviderHealthHistoryRecord[]>([]);
  const [healthHistoryPagination, setHealthHistoryPagination] = useState<ProviderHealthHistoryPage>(
    {
      items: [],
      page: 1,
      pageSize: PROVIDER_HEALTH_HISTORY_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
  );
  const [healthHistoryLoading, setHealthHistoryLoading] = useState(false);
  const [jobHistory, setJobHistory] = useState<
    Array<{ id: string; jobId: string; status: string; startedAt: string; error: string | null }>
  >([]);
  const [notificationFailures, setNotificationFailures] = useState<
    Array<{ id: string; provider: string; status: string; lastError: string | null }>
  >([]);
  const [providerDraft, setProviderDraft] = useState(newProviderDraft);
  const [providerSheetOpen, setProviderSheetOpen] = useState(false);
  const [editingProviderName, setEditingProviderName] = useState<string | null>(null);
  const [credentialInputOpen, setCredentialInputOpen] = useState(true);
  const [providerTestState, setProviderTestState] = useState<ProviderTestState>('idle');
  const [providerTestEvidence, setProviderTestEvidence] = useState<ProviderTestEvidence | null>(
    null,
  );
  const [testingProviderName, setTestingProviderName] = useState<string | null>(null);
  const [savingProviderName, setSavingProviderName] = useState<string | null>(null);
  const [savingProviderDraft, setSavingProviderDraft] = useState(false);
  const [togglingJobId, setTogglingJobId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const toastManager = useToastManager();
  const loadSequence = useRef(0);
  const healthHistoryLoadSequence = useRef(0);
  const healthHistoryUrl = (requestedHealthHistoryPage: number) => {
    const healthHistoryParams = new URLSearchParams({
      page: String(requestedHealthHistoryPage),
      pageSize: String(PROVIDER_HEALTH_HISTORY_PAGE_SIZE),
    });
    return `/api/v1/providers/health/history?${healthHistoryParams.toString()}`;
  };
  const loadProviderHealthHistory = async (
    requestedHealthHistoryPage = healthHistoryPagination.page,
  ) => {
    const sequence = ++healthHistoryLoadSequence.current;
    setHealthHistoryLoading(true);
    try {
      const healthResponse = await fetch(healthHistoryUrl(requestedHealthHistoryPage));
      if (!healthResponse.ok) throw new Error('provider-health-history');
      const nextHealthHistory = normalizeProviderHealthHistory(
        (await healthResponse.json()) as unknown,
        requestedHealthHistoryPage,
        PROVIDER_HEALTH_HISTORY_PAGE_SIZE,
      );
      if (sequence !== healthHistoryLoadSequence.current) return;
      setHealthHistory(nextHealthHistory.items);
      setHealthHistoryPagination(nextHealthHistory);
    } catch {
      if (sequence !== healthHistoryLoadSequence.current) return;
      setLoadState(
        providers.length ||
          issues.length ||
          jobs.length ||
          healthHistory.length ||
          jobHistory.length
          ? 'stale'
          : 'error',
      );
    } finally {
      if (sequence === healthHistoryLoadSequence.current) setHealthHistoryLoading(false);
    }
  };
  const load = async (requestedHealthHistoryPage = healthHistoryPagination.page) => {
    const sequence = ++loadSequence.current;
    healthHistoryLoadSequence.current += 1;
    setHealthHistoryLoading(false);
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
        fetch(healthHistoryUrl(requestedHealthHistoryPage)),
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
        nextHealthHistoryPayload,
        nextJobHistory,
        nextNotificationFailures,
      ] = await Promise.all([
        response.json() as Promise<typeof providers>,
        issueResponse.json() as Promise<typeof issues>,
        jobsResponse.json() as Promise<typeof jobs>,
        healthResponse.json() as Promise<unknown>,
        historyResponse.json() as Promise<typeof jobHistory>,
        notificationResponse.json() as Promise<typeof notificationFailures>,
      ]);
      const nextHealthHistory = normalizeProviderHealthHistory(
        nextHealthHistoryPayload,
        requestedHealthHistoryPage,
        PROVIDER_HEALTH_HISTORY_PAGE_SIZE,
      );
      if (sequence !== loadSequence.current) return;
      healthHistoryLoadSequence.current += 1;
      setHealthHistoryLoading(false);
      setProviders(nextProviders);
      setIssues(nextIssues);
      setJobs(nextJobs);
      setHealthHistory(nextHealthHistory.items);
      setHealthHistoryPagination(nextHealthHistory);
      setJobHistory(nextJobHistory);
      setNotificationFailures(nextNotificationFailures);
      setLoadState('ready');
    } catch {
      if (sequence !== loadSequence.current) return;
      healthHistoryLoadSequence.current += 1;
      setHealthHistoryLoading(false);
      setLoadState(
        providers.length ||
          issues.length ||
          jobs.length ||
          healthHistory.length ||
          jobHistory.length
          ? 'stale'
          : 'error',
      );
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const resetProviderTest = () => {
    setProviderTestState('idle');
    setProviderTestEvidence(null);
  };
  const updateProviderDraft = (
    updater: (current: typeof providerDraft) => typeof providerDraft,
  ) => {
    setProviderDraft(updater);
    resetProviderTest();
  };
  const test = async (name: string) => {
    setTestingProviderName(name);
    try {
      const response = await fetch(`/api/v1/providers/config/${encodeURIComponent(name)}/test`, {
        method: 'POST',
      });
      const result = (await response.json().catch(() => null)) as {
        status?: string;
        message?: string;
        credentialConfigured?: boolean;
        healthCheck?: (typeof healthHistory)[number];
      } | null;
      if (!response.ok) {
        toastManager.add({
          title: `${name} 连通性测试失败`,
          description: result?.message ?? 'Provider 返回了错误响应。',
          type: 'error',
          timeout: 0,
          priority: 'high',
          actionProps: {
            type: 'button',
            children: '重新测试',
            onClick: () => void test(name),
          },
        });
        return;
      }
      setProviders((current) =>
        current.map((provider) =>
          provider.name === name
            ? {
                ...provider,
                ...(result?.healthCheck?.state ||
                result?.status === 'healthy' ||
                result?.status === 'degraded' ||
                result?.status === 'down'
                  ? { health: result?.healthCheck?.state ?? result?.status }
                  : {}),
                ...(typeof result?.credentialConfigured === 'boolean'
                  ? { credentialConfigured: result.credentialConfigured }
                  : {}),
              }
            : provider,
        ),
      );
      if (result?.healthCheck) {
        void load();
      }
      if (result?.status === 'healthy') {
        toastManager.add({
          title: `${name} 连通性测试成功`,
          type: 'success',
          timeout: 2800,
        });
      } else {
        toastManager.add({
          title: `${name} 连通性测试失败`,
          description: result?.message ?? 'Provider 尚未通过连通性测试。',
          type: 'error',
          timeout: 0,
          priority: 'high',
          actionProps: {
            type: 'button',
            children: '重新测试',
            onClick: () => void test(name),
          },
        });
      }
    } catch (error) {
      toastManager.add({
        title: `${name} 连通性测试失败`,
        description: error instanceof Error ? error.message : '请检查服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
        actionProps: {
          type: 'button',
          children: '重新测试',
          onClick: () => void test(name),
        },
      });
    } finally {
      setTestingProviderName((current) => (current === name ? null : current));
    }
  };
  const testProviderDraft = async () => {
    const name = providerDraft.name.trim();
    const capabilities = providerDraft.capabilities;
    const priority = Number(providerDraft.priority);
    if (!name || capabilities.length === 0 || !Number.isInteger(priority) || priority < 0) {
      setProviderTestState('error');
      toastManager.add({
        title: '无法测试 Provider 连接',
        description: '请先填写 Provider 名称、至少一项能力和非负整数优先级。',
        type: 'error',
        timeout: 7000,
        priority: 'high',
      });
      return;
    }
    setProviderTestState('testing');
    setProviderTestEvidence(null);
    const credentialsRef = credentialInputOpen ? providerDraft.credentialsRef.trim() : undefined;
    try {
      const response = await fetch('/api/v1/providers/config/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          type: providerDraft.type,
          enabled: providerDraft.enabled,
          priority,
          capabilities,
          ...(credentialInputOpen ? { credentialsRef } : {}),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        status?: string;
        message?: string;
        testToken?: string;
      } | null;
      if (!response.ok) throw new Error(result?.message ?? '连接测试失败');
      setProviderTestEvidence(
        result?.testToken
          ? {
              token: result.testToken,
              ...(credentialsRef ? { credentialsRef } : {}),
            }
          : null,
      );
      if (result?.status === 'healthy') {
        setProviderTestState('success');
        toastManager.add({
          title: `${name} 连通性测试成功`,
          description: result.message,
          type: 'success',
          timeout: 2800,
        });
      } else if (
        result?.status === 'unconfigured' ||
        result?.status === 'untested' ||
        result?.status === 'disabled'
      ) {
        setProviderTestState('warning');
        toastManager.add({
          title: `${name} 连通性测试失败`,
          description: result.message ?? '当前配置尚未完成连接测试。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      } else {
        setProviderTestState('error');
        toastManager.add({
          title: `${name} 连通性测试失败`,
          description: result?.message ?? '连接异常。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      }
    } catch (error) {
      setProviderTestState('error');
      toastManager.add({
        title: `${name} 连通性测试失败`,
        description: error instanceof Error ? error.message : '连接测试失败。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };
  const saveProvider = async (
    provider: (typeof providers)[number],
    enabled = provider.enabled,
    successTitle = `${provider.name} 配置已保存`,
  ) => {
    setSavingProviderName(provider.name);
    try {
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
      if (!response.ok) {
        toastManager.add({
          title: `${provider.name} 配置保存失败`,
          description: '请检查 Provider 配置后重试。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
        return;
      }
      const savedResponse = (await response.json().catch(() => null)) as
        | ((typeof providers)[number] & {
            healthCheck?: (typeof healthHistory)[number];
          })
        | null;
      setProviders((current) => {
        const existing = current.find((item) => item.name === provider.name);
        if (!existing) return current;
        return sortProviderRecords(
          replaceProviderRecord(current, {
            ...existing,
            enabled: savedResponse?.enabled ?? enabled,
            type: savedResponse?.type ?? existing.type,
            priority: savedResponse?.priority ?? provider.priority,
            capabilities: savedResponse?.capabilities ?? existing.capabilities,
            health: savedResponse?.health ?? (enabled ? existing.health : 'unknown'),
            ...(savedResponse?.credentialConfigured === undefined
              ? {}
              : { credentialConfigured: savedResponse.credentialConfigured }),
          }),
        );
      });
      if (savedResponse?.healthCheck) {
        void load();
      }
      toastManager.add({ title: successTitle, type: 'success', timeout: 2800 });
    } catch {
      toastManager.add({
        title: `${provider.name} 配置保存失败`,
        description: '请检查服务连接后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setSavingProviderName((current) => (current === provider.name ? null : current));
    }
  };
  const openProviderSheet = (provider?: (typeof providers)[number]) => {
    if (provider) {
      setEditingProviderName(provider.name);
      setCredentialInputOpen(!provider.credentialConfigured);
      setProviderDraft({
        name: provider.name,
        type: provider.type,
        capabilities: [...provider.capabilities],
        credentialsRef: '',
        priority: provider.priority,
        enabled: provider.enabled,
      });
    } else {
      setEditingProviderName(null);
      setCredentialInputOpen(true);
      setProviderDraft(newProviderDraft());
    }
    resetProviderTest();
    setProviderSheetOpen(true);
  };
  const saveProviderDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingProviderDraft) return;
    const name = providerDraft.name.trim();
    const capabilities = providerDraft.capabilities;
    const priority = Number(providerDraft.priority);
    if (!name || capabilities.length === 0 || !Number.isInteger(priority) || priority < 0) {
      toastManager.add({
        title: 'Provider 配置不完整',
        description: '请填写 Provider 名称、至少一项能力和非负整数优先级。',
        type: 'error',
        timeout: 7000,
        priority: 'high',
      });
      return;
    }
    const credentialsRef = providerCredentialForSave(
      providerDraft.credentialsRef,
      providerTestEvidence,
    );
    setSavingProviderDraft(true);
    let response: Response;
    try {
      response = await fetch('/api/v1/providers/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          type: providerDraft.type,
          enabled: providerDraft.enabled,
          priority,
          capabilities,
          ...(credentialsRef ? { credentialsRef } : {}),
          ...(providerTestEvidence ? { connectionTestToken: providerTestEvidence.token } : {}),
        }),
      });
    } catch {
      setSavingProviderDraft(false);
      toastManager.add({
        title: 'Provider 配置保存失败',
        description: '请检查服务连接后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
      return;
    }
    if (!response.ok) {
      setSavingProviderDraft(false);
      toastManager.add({
        title: 'Provider 配置保存失败',
        description: '请检查名称、能力和凭证后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
      return;
    }
    const savedResponse = (await response.json().catch(() => null)) as
      | ((typeof providers)[number] & {
          healthCheck?: (typeof healthHistory)[number];
        })
      | null;
    setProviders((current) => {
      const existing = current.find((provider) => provider.name === name);
      const savedProvider: (typeof providers)[number] = {
        name,
        type: savedResponse?.type ?? providerDraft.type,
        enabled: savedResponse?.enabled ?? providerDraft.enabled,
        priority: savedResponse?.priority ?? priority,
        capabilities: savedResponse?.capabilities ?? [...capabilities],
        health:
          savedResponse?.health ??
          (providerTestEvidence ? 'healthy' : (existing?.health ?? 'unknown')),
        credentialConfigured: providerCredentialConfiguredAfterSave(
          savedResponse?.credentialConfigured,
          credentialsRef,
          existing?.credentialConfigured,
        ),
      };
      return sortProviderRecords(replaceProviderRecord(current, savedProvider));
    });
    if (savedResponse?.healthCheck) {
      void load();
    }
    setProviderDraft((current) => ({ ...current, credentialsRef: '' }));
    setEditingProviderName(null);
    setProviderSheetOpen(false);
    setCredentialInputOpen(true);
    resetProviderTest();
    setSavingProviderDraft(false);
    toastManager.add({
      title: `${name} 配置已保存`,
      description: '页面不会回显凭证。',
      type: 'success',
      timeout: 2800,
    });
  };
  const toggleJob = async (job: (typeof jobs)[number]) => {
    if (togglingJobId) return;
    setTogglingJobId(job.id);
    try {
      const response = await fetch(`/api/v1/automations/${job.id}/enabled`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      if (!response.ok) throw new Error('automation-toggle');
      const updatedJob = (await response.json().catch(() => null)) as Partial<
        (typeof jobs)[number]
      > | null;
      setJobs((current) =>
        current.map((item) =>
          item.id === job.id
            ? { ...item, ...updatedJob, enabled: updatedJob?.enabled ?? !job.enabled }
            : item,
        ),
      );
      toastManager.add({
        title: `${job.name} 已${job.enabled ? '停用' : '启用'}`,
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: `${job.name} ${job.enabled ? '停用' : '启用'}失败`,
        description: '请检查服务连接后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setTogglingJobId((current) => (current === job.id ? null : current));
    }
  };
  const closeProviderSheet = () => {
    setProviderSheetOpen(false);
    setEditingProviderName(null);
    setCredentialInputOpen(true);
    resetProviderTest();
    setProviderDraft((current) => ({ ...current, credentialsRef: '' }));
  };
  const credentialLabel = providerCredentialLabel(providerDraft.name, providerDraft.type);
  return (
    <section className="module-page" data-provider-sheet-open={String(providerSheetOpen)}>
      <div className="entry-page-heading">
        <div>
          <p className="kicker">Providers</p>
          <h1>数据与自动化</h1>
          <p className="page-description">
            按能力查看 Provider、优先级、健康和额度；凭证只显示配置状态，不回显密钥。
          </p>
        </div>
        <Button type="button" variant="default" onClick={() => openProviderSheet()}>
          新增或更新 Provider
        </Button>
      </div>
      <Button className="secondary" type="button" variant="outline" onClick={() => void load()}>
        刷新 Provider 与自动化
      </Button>
      <Sheet
        open={providerSheetOpen}
        onOpenChange={(open) => (open ? setProviderSheetOpen(true) : closeProviderSheet())}
      >
        <SheetContent
          side="right"
          aria-describedby="provider-form-description"
          className="h-[100dvh] w-[620px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
        >
          <div className="panel-heading">
            <SheetTitle>
              {editingProviderName ? '更新 Provider' : '新增或更新 Provider'}
            </SheetTitle>
            <SheetDescription id="provider-form-description">
              凭证用于连接 Provider；已配置凭证不会回显，编辑时留空保存不会删除当前凭证。
            </SheetDescription>
          </div>
          <form
            key={editingProviderName ?? 'new-provider'}
            className="form-card min-h-0 w-full max-w-none content-start overflow-auto"
            onSubmit={(event) => void saveProviderDraft(event)}
          >
            <label>
              名称
              <Input
                value={providerDraft.name}
                onChange={(event) =>
                  updateProviderDraft((current) => ({ ...current, name: event.target.value }))
                }
                readOnly={Boolean(editingProviderName)}
                required
                maxLength={80}
              />
            </label>
            <label>
              类型
              <Select
                value={providerDraft.type}
                onValueChange={(value) =>
                  value && updateProviderDraft((current) => ({ ...current, type: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{providerTypeLabel(providerDraft.type)}</SelectValue>
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
              能力（可多选）
              <Select
                multiple
                items={providerCapabilityOptions}
                value={providerDraft.capabilities}
                onValueChange={(value) =>
                  updateProviderDraft((current) => ({ ...current, capabilities: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择能力" />
                </SelectTrigger>
                <SelectContent>
                  {providerCapabilityOptions.map((capability) => (
                    <SelectItem key={capability.value} value={capability.value}>
                      {capability.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              优先级
              <Input
                type="number"
                min={0}
                step={1}
                value={providerDraft.priority}
                onChange={(event) =>
                  updateProviderDraft((current) => ({
                    ...current,
                    priority: Number(event.target.value),
                  }))
                }
                required
              />
            </label>
            {credentialInputOpen ? (
              <label>
                {credentialLabel}
                <Input
                  type="password"
                  autoComplete="off"
                  value={providerDraft.credentialsRef}
                  onChange={(event) =>
                    updateProviderDraft((current) => ({
                      ...current,
                      credentialsRef: event.target.value,
                    }))
                  }
                  placeholder={providerCredentialPlaceholder(credentialLabel)}
                />
              </label>
            ) : (
              <div className="provider-credential-field">
                <span className="provider-credential-label">凭证</span>
                <div className="provider-credential-summary">
                  <span className="provider-credential-state" role="status">
                    <span aria-hidden="true">✓</span>
                    已配置
                  </span>
                  <Button
                    className="text-button"
                    type="button"
                    variant="link"
                    onClick={() => {
                      resetProviderTest();
                      setCredentialInputOpen(true);
                    }}
                  >
                    更换凭证
                  </Button>
                </div>
              </div>
            )}
            {credentialLabel === '飞书 Webhook' && (
              <p className="form-help">测试连接会发送一条“ThesisLedger 连接测试”通知。</p>
            )}
            <div className="form-actions">
              <Button
                className="secondary"
                type="button"
                variant="outline"
                disabled={savingProviderDraft}
                onClick={closeProviderSheet}
              >
                取消
              </Button>
              <Button
                className="secondary"
                disabled={providerTestState === 'testing' || savingProviderDraft}
                aria-busy={providerTestState === 'testing'}
                type="button"
                variant="outline"
                onClick={() => void testProviderDraft()}
              >
                {providerTestState === 'testing' && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {providerTestState === 'testing' ? '测试中…' : '测试连接'}
              </Button>
              <Button
                disabled={providerTestState === 'testing' || savingProviderDraft}
                type="submit"
                variant="default"
              >
                {savingProviderDraft && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {savingProviderDraft
                  ? '保存中…'
                  : editingProviderName
                    ? '保存修改'
                    : '保存 Provider'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="text-center first:text-center">提供方</th>
                <th className="text-center">能力</th>
                <th className="text-center">优先级</th>
                <th className="text-center">状态</th>
                <th className="text-center">凭证</th>
                <th className="text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {isDataLoaded(loadState) && providers.length === 0 ? (
                <EmptyTableRow colSpan={6} />
              ) : (
                providers.map((provider) => {
                  const status = providerDisplayStatus(provider);
                  return (
                    <tr key={provider.name}>
                      <td className="text-left first:text-left">
                        <strong>{provider.name}</strong>
                        <span>{providerTypeLabel(provider.type)}</span>
                      </td>
                      <td className="text-left">
                        {provider.capabilities.map(providerCapabilityLabel).join(' · ')}
                      </td>
                      <td className="text-left">
                        <Input
                          className="w-20"
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
                      <td className="text-left">
                        <span className={`provider-status ${status.tone}`}>
                          <span className="status-dot" aria-hidden="true" />
                          {status.label}
                        </span>
                      </td>
                      <td className="text-left">
                        {provider.credentialConfigured ? '已配置' : '未配置'}
                      </td>
                      <td className="text-left">
                        <Button
                          className="text-button"
                          size="sm"
                          type="button"
                          variant="link"
                          onClick={() => openProviderSheet(provider)}
                        >
                          编辑
                        </Button>
                        <Button
                          className="text-button"
                          size="sm"
                          type="button"
                          variant="link"
                          disabled={testingProviderName !== null || savingProviderName !== null}
                          aria-busy={testingProviderName === provider.name}
                          onClick={() => void test(provider.name)}
                        >
                          {testingProviderName === provider.name && (
                            <LoaderCircle
                              data-icon="inline-start"
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          )}
                          {testingProviderName === provider.name ? '测试中…' : '连通性测试'}
                        </Button>
                        <Button
                          className="text-button"
                          size="sm"
                          type="button"
                          variant="link"
                          disabled={testingProviderName !== null || savingProviderName !== null}
                          aria-busy={savingProviderName === provider.name}
                          onClick={() =>
                            void saveProvider(
                              provider,
                              !provider.enabled,
                              `${provider.name} 已${provider.enabled ? '停用' : '启用'}`,
                            )
                          }
                        >
                          {savingProviderName === provider.name && (
                            <LoaderCircle
                              data-icon="inline-start"
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          )}
                          {savingProviderName === provider.name
                            ? provider.enabled
                              ? '停用中…'
                              : '启用中…'
                            : provider.enabled
                              ? '停用'
                              : '启用'}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
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
              {isDataLoaded(loadState) && jobs.length === 0 ? (
                <EmptyTableRow colSpan={5} />
              ) : (
                jobs.map((job) => (
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
                        disabled={togglingJobId !== null}
                        aria-busy={togglingJobId === job.id}
                        onClick={() => void toggleJob(job)}
                      >
                        {togglingJobId === job.id && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {togglingJobId === job.id
                          ? job.enabled
                            ? '停用中…'
                            : '启用中…'
                          : job.enabled
                            ? '停用'
                            : '启用'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Provider 健康历史</h2>
          <p>显示状态、延迟、检查来源和时间，便于判断主备切换原因。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>状态</th>
                <th>延迟</th>
                <th>检查时间</th>
                <th>来源</th>
              </tr>
            </thead>
            <tbody>
              {isDataLoaded(loadState) && healthHistory.length === 0 ? (
                <EmptyTableRow colSpan={5} />
              ) : (
                healthHistory.map((item, index) => (
                  <tr key={`${item.provider}-${item.checkedAt}-${index}`}>
                    <td>{item.provider}</td>
                    <td>{item.state}</td>
                    <td>{item.latencyMs === null ? '不可用' : `${item.latencyMs} ms`}</td>
                    <td>{new Date(item.checkedAt).toLocaleString('zh-CN')}</td>
                    <td>{providerHealthSourceLabel(item.source)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {healthHistoryPagination.total > 0 ? (
          <nav
            className="mt-3 flex flex-wrap items-center justify-between gap-3"
            aria-label="Provider 健康历史分页"
          >
            <p className="m-0 text-sm text-muted-foreground">
              第 {healthHistoryPagination.page} / {healthHistoryPagination.totalPages} 页，共{' '}
              {healthHistoryPagination.total} 条
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={
                  loadState === 'loading' ||
                  healthHistoryLoading ||
                  healthHistoryPagination.page <= 1
                }
                onClick={() => void loadProviderHealthHistory(healthHistoryPagination.page - 1)}
              >
                上一页
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={
                  loadState === 'loading' ||
                  healthHistoryLoading ||
                  healthHistoryPagination.page >= healthHistoryPagination.totalPages
                }
                onClick={() => void loadProviderHealthHistory(healthHistoryPagination.page + 1)}
              >
                下一页
              </Button>
            </div>
          </nav>
        ) : null}
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
              {isDataLoaded(loadState) && jobHistory.length === 0 ? (
                <EmptyTableRow colSpan={4} />
              ) : (
                jobHistory.map((item) => (
                  <tr key={item.id}>
                    <td>{item.jobId}</td>
                    <td>{item.status}</td>
                    <td>{new Date(item.startedAt).toLocaleString('zh-CN')}</td>
                    <td>{item.error ?? '—'}</td>
                  </tr>
                ))
              )}
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
              {isDataLoaded(loadState) && notificationFailures.length === 0 ? (
                <EmptyTableRow colSpan={3} />
              ) : (
                notificationFailures.map((item) => (
                  <tr key={item.id}>
                    <td>{item.provider}</td>
                    <td>{item.status}</td>
                    <td>{item.lastError ?? '—'}</td>
                  </tr>
                ))
              )}
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
              {isDataLoaded(loadState) && issues.length === 0 ? (
                <EmptyTableRow colSpan={4} />
              ) : (
                issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>{issue.provider}</td>
                    <td>{issue.symbol ?? '全局'}</td>
                    <td>{issue.severity}</td>
                    <td>{issue.code}</td>
                  </tr>
                ))
              )}
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
  const [savingTargets, setSavingTargets] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loadSequence = useRef(0);
  const toastManager = useToastManager();
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
      });
    }
  }, [accountId, mode]);
  const saveTargets = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingTargets) return;
    setSavingTargets(true);
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
        toastManager.add({
          title: '目标配置保存失败',
          description: '目标权重必须合计 100%。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
        return;
      }
      toastManager.add({
        title: '目标配置已保存',
        description: '已生成新版本。',
        type: 'success',
        timeout: 2800,
      });
      await load();
    } catch {
      toastManager.add({
        title: '目标配置保存失败',
        description: '目标配置必须是 JSON 对象。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setSavingTargets(false);
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
              {isDataLoaded(loadState) && snapshots.length === 0 ? (
                <EmptyTableRow colSpan={4} />
              ) : (
                snapshots.map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td>{new Date(snapshot.capturedAt).toLocaleString('zh-CN')}</td>
                    <td>{money.format(snapshot.marketValue)}</td>
                    <td>{money.format(snapshot.costValue)}</td>
                    <td>{money.format(snapshot.cashValue)}</td>
                  </tr>
                ))
              )}
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
              {isDataLoaded(loadState) && allocationRows.length === 0 ? (
                <EmptyTableRow colSpan={3} />
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
              {isDataLoaded(loadState) && rebalanceRows.length === 0 ? (
                <EmptyTableRow colSpan={4} />
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
        <Button disabled={savingTargets} type="submit" variant="default">
          {savingTargets && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {savingTargets ? '保存中…' : '保存目标'}
        </Button>
      </form>
    </section>
  );
}

function RiskCenter({ accounts, portfolio }: { accounts: Account[]; portfolio: Portfolio | null }) {
  const [rules, setRules] = useState<RiskRuleRecord[]>([]);
  const [mode, setMode] = useState<PortfolioMode>('actual');
  const [events, setEvents] = useState<RiskEventRecord[]>([]);
  const [deliveries, setDeliveries] = useState<NotificationRecord[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [audit, setAudit] = useState<
    Array<{ id: string; action: string; ruleVersion: number; createdAt: string }>
  >([]);
  const [auditVisible, setAuditVisible] = useState(false);
  const loadSequence = useRef(0);
  const toastManager = useToastManager();

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
    }
  };
  useEffect(() => {
    void loadRisk();
  }, [mode]);

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    setBusyAction('create-rule');
    try {
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
      if (!response.ok) throw new Error('risk-rule-create');
      formElement.reset();
      toastManager.add({
        title: '规则已创建',
        description: '已记录审计。',
        type: 'success',
        timeout: 2800,
      });
      await loadRisk();
    } catch {
      toastManager.add({
        title: '规则创建失败',
        description: '请检查 scope 与目标。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const patchRule = async (rule: RiskRuleRecord, patch: object) => {
    if (busyAction) return;
    setBusyAction(`patch:${rule.id}`);
    try {
      const response = await fetch(`/api/v1/risk/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error('risk-rule-patch');
      toastManager.add({
        title: '规则已更新',
        description: '已生成新版本。',
        type: 'success',
        timeout: 2800,
      });
      await loadRisk();
    } catch {
      toastManager.add({
        title: '规则更新失败',
        description: '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const testRule = async (rule: RiskRuleRecord) => {
    if (busyAction) return;
    setBusyAction(`test:${rule.id}`);
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
    try {
      const response = await fetch(`/api/v1/risk/rules/${rule.id}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(contexts),
      });
      if (!response.ok) throw new Error('risk-rule-test');
      const result = (await response.json()) as Array<{ triggered: boolean }>;
      toastManager.add({
        title: '人工测试完成',
        description: `${result.filter((item) => item.triggered).length} 个上下文触发。`,
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '人工测试失败',
        description: '请确认组合中有可用数据。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const scanRisk = async () => {
    if (busyAction) return;
    setBusyAction('scan-risk');
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
    try {
      const response = await fetch('/api/v1/risk/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(contexts),
      });
      if (!response.ok) throw new Error('risk-scan');
      toastManager.add({
        title: '风险扫描已完成',
        description: '触发事件已写入历史。',
        type: 'success',
        timeout: 2800,
      });
      await loadRisk();
    } catch {
      toastManager.add({
        title: '风险扫描失败',
        description: '请确认当前组合有可用数据。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const showAudit = async (rule: RiskRuleRecord) => {
    if (busyAction) return;
    setBusyAction(`audit:${rule.id}`);
    try {
      const response = await fetch(`/api/v1/risk/rules/${rule.id}/audit`);
      if (!response.ok) throw new Error('risk-audit');
      setAudit((await response.json()) as typeof audit);
      setAuditVisible(true);
    } catch {
      toastManager.add({
        title: '审计记录读取失败',
        description: '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
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
        <Button disabled={busyAction !== null} type="submit" variant="default">
          {busyAction === 'create-rule' && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busyAction === 'create-rule' ? '创建中…' : '创建规则'}
        </Button>
        <Button
          className="secondary"
          type="button"
          variant="outline"
          disabled={busyAction !== null}
          aria-busy={busyAction === 'scan-risk'}
          onClick={() => void scanRisk()}
        >
          {busyAction === 'scan-risk' && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busyAction === 'scan-risk' ? '扫描中…' : '扫描当前组合'}
        </Button>
      </form>
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
              {isDataLoaded(loadState) && rules.length === 0 ? (
                <EmptyTableRow colSpan={5} />
              ) : (
                rules.map((rule) => (
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
                        disabled={busyAction !== null}
                        aria-busy={busyAction === `patch:${rule.id}`}
                        onClick={() => void patchRule(rule, { enabled: !rule.enabled })}
                      >
                        {busyAction === `patch:${rule.id}` && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {busyAction === `patch:${rule.id}`
                          ? rule.enabled
                            ? '停用中…'
                            : '启用中…'
                          : rule.enabled
                            ? '停用'
                            : '启用'}
                      </Button>
                      <Button
                        className="text-button"
                        size="sm"
                        variant="link"
                        disabled={busyAction !== null}
                        aria-busy={busyAction === `test:${rule.id}`}
                        onClick={() => void testRule(rule)}
                      >
                        {busyAction === `test:${rule.id}` && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {busyAction === `test:${rule.id}` ? '测试中…' : '测试'}
                      </Button>
                      <Button
                        className="text-button"
                        size="sm"
                        variant="link"
                        disabled={busyAction !== null}
                        aria-busy={busyAction === `audit:${rule.id}`}
                        onClick={() => void showAudit(rule)}
                      >
                        {busyAction === `audit:${rule.id}` && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {busyAction === `audit:${rule.id}` ? '读取中…' : '审计'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {auditVisible && (
        <section className="panel">
          <div className="panel-heading">
            <h2>规则审计</h2>
          </div>
          {audit.length === 0 ? (
            <EmptyListState />
          ) : (
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
          )}
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
              {isDataLoaded(loadState) && events.length === 0 ? (
                <EmptyTableRow colSpan={4} />
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.message}</strong>
                      <span>
                        {event.symbol ?? '组合'} · value={displayValue(event.context.value)}
                      </span>
                    </td>
                    <td>{event.severity}</td>
                    <td>v{event.ruleVersion}</td>
                    <td>
                      {new Date(event.marketTime ?? event.evaluatedAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))
              )}
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
              {isDataLoaded(loadState) && deliveries.length === 0 ? (
                <EmptyTableRow colSpan={4} />
              ) : (
                deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>
                      <strong>{delivery.channel}</strong>
                      <span>{delivery.lastError ?? delivery.eventId}</span>
                    </td>
                    <td>{delivery.severity}</td>
                    <td>{delivery.status}</td>
                    <td>{delivery.attemptCount}</td>
                  </tr>
                ))
              )}
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
  embedded = false,
  accountLocked = false,
}: {
  accounts: Account[];
  initialAccountId?: string;
  onPortfolioChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  embedded?: boolean;
  accountLocked?: boolean;
}) {
  const [accountId, setAccountId] = useState(initialAccountId ?? '');
  const [source, setSource] = useState<ImportDraftRecord['source']>('unknown');
  const [drafts, setDrafts] = useState<ImportDraftRecord[]>([]);
  const [selected, setSelected] = useState<ImportDraftRecord | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [dirty, setDirty] = useState(false);
  const toastManager = useToastManager();
  const loadSequence = useRef(0);
  const markDirty = (nextDirty = true) => {
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  };
  const confirmDiscard = () => !dirty || window.confirm('当前有未保存修改，切换后会丢弃，继续吗？');
  useEffect(() => {
    if (accountLocked && initialAccountId && initialAccountId !== accountId) {
      setAccountId(initialAccountId);
      return;
    }
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accountLocked, accounts, initialAccountId]);
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
    if (busyAction) return;
    const fileInput = event.currentTarget.elements.namedItem('file') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file || !accountId) return;
    setBusyAction('upload');
    const body = new FormData();
    body.set('file', file);
    body.set('accountId', accountId);
    body.set('source', source);
    body.set('sourceConfidence', source === 'unknown' ? '0' : '1');
    body.set('extracted', '[]');
    try {
      const response = await fetch('/api/v1/imports/screenshot', { method: 'POST', body });
      if (!response.ok) throw new Error('upload');
      const draft = (await response.json()) as ImportDraftRecord;
      setDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
      setSelected(draft);
      setRows(draft.rows);
      markDirty(false);
      toastManager.add({
        title: '截图草稿已创建',
        description: '请逐项确认后提交。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '截图上传失败',
        description: '请确认格式和大小不超过 10MB。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
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
    if (!selected || busyAction) return;
    setBusyAction('commit');
    try {
      const response = await fetch(`/api/v1/imports/${selected.id}/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows, source }),
      });
      if (!response.ok) throw new Error('commit');
      setSelected({ ...selected, status: 'committed', rows });
      markDirty(false);
      onPortfolioChanged();
      toastManager.add({
        title: '导入已提交',
        description: '组合已重新估值。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '导入提交失败',
        description: '仍有未解决字段，请检查代码、数量、成本价和数值关系。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
  const rollback = async (draft: ImportDraftRecord) => {
    if (busyAction) return;
    setBusyAction(`rollback:${draft.id}`);
    try {
      const response = await fetch(`/api/v1/imports/${draft.id}/rollback`, { method: 'POST' });
      if (!response.ok) throw new Error('rollback');
      markDirty(false);
      onPortfolioChanged();
      toastManager.add({
        title: '导入已回滚',
        description: '已恢复到本次导入前的持仓。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '导入回滚失败',
        description: '该记录无法回滚，请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
  return (
    <div
      className={
        embedded
          ? 'import-screenshot-content embedded min-h-0 content-start overflow-auto'
          : 'import-screenshot-content'
      }
    >
      {!embedded && (
        <div className="panel-heading">
          <h2>截图导入</h2>
          <p>上传不会直接修改持仓。代码歧义、低置信度或数值不一致必须先人工修正。</p>
        </div>
      )}
      <Button
        className="secondary mb-[18px]"
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
              disabled={accountLocked}
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
                    {account.name} · {account.institution || '未填写机构'} · {account.currency} ·{' '}
                    {account.type === 'fund' ? '基金' : account.type === 'cash' ? '现金' : '证券'}
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
          <Button type="submit" variant="default" disabled={busyAction !== null}>
            {busyAction === 'upload' && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {busyAction === 'upload' ? '创建中…' : '创建草稿'}
          </Button>
        </form>
      )}
      <DataStateBanner
        state={loadState}
        onRetry={accountId ? () => void loadDrafts(accountId) : undefined}
      />
      <div className="review-layout">
        <aside className="draft-list" aria-label="导入历史">
          {isDataLoaded(loadState) && drafts.length === 0 ? (
            <EmptyListState className="min-h-0 items-start px-0 py-6 text-left" />
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
              {rows.length === 0 ? (
                <EmptyListState />
              ) : (
                rows.map((row, index) => (
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
                ))
              )}
              <div className="form-actions">
                <Button
                  disabled={selected.status === 'committed' || busyAction !== null}
                  aria-busy={busyAction === 'commit'}
                  type="button"
                  variant="default"
                  onClick={() => void commit()}
                >
                  {busyAction === 'commit' && (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {busyAction === 'commit' ? '提交中…' : '确认并提交'}
                </Button>
                {selected.status === 'committed' && (
                  <Button
                    className="secondary"
                    type="button"
                    variant="outline"
                    disabled={busyAction !== null}
                    aria-busy={busyAction === `rollback:${selected.id}`}
                    onClick={() => void rollback(selected)}
                  >
                    {busyAction === `rollback:${selected.id}` && (
                      <LoaderCircle
                        data-icon="inline-start"
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {busyAction === `rollback:${selected.id}` ? '回滚中…' : '回滚本次导入'}
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
  accountsReady = true,
  onPortfolioChanged,
}: {
  accounts: Account[];
  positions: Position[];
  cashValue?: number;
  accountsReady?: boolean;
  onPortfolioChanged: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const queryStep = params.get('step');
  const queryMethod = params.get('method');
  const requestedAccountId = params.get('accountId') ?? '';
  const screenshotQueryRequested =
    params.get('entry') === 'screenshot' ||
    queryMethod === 'screenshot' ||
    queryStep === 'screenshot';
  const [accountId, setAccountId] = useState(() => {
    if (requestedAccountId) return requestedAccountId;
    try {
      return window.sessionStorage.getItem('thesis-ledger-last-account') ?? '';
    } catch {
      return '';
    }
  });
  const [dirty, setDirty] = useState(false);
  const [entryPositions, setEntryPositions] = useState<Position[]>(positions);
  const [entryCashValue, setEntryCashValue] = useState(cashValue ?? 0);
  const [positionSheetOpen, setPositionSheetOpen] = useState(false);
  const [screenshotSheetOpen, setScreenshotSheetOpen] = useState(() => {
    if (!screenshotQueryRequested) return false;
    const initialAccount =
      accounts.find((account) => account.id === requestedAccountId) ?? accounts[0];
    return Boolean(initialAccount && initialAccount.type !== 'cash');
  });

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

  const selectedAccount = accounts.find((account) => account.id === accountId);
  useEffect(() => {
    if (screenshotQueryRequested && selectedAccount?.type !== 'cash') {
      setScreenshotSheetOpen(true);
    }
  }, [screenshotQueryRequested, selectedAccount?.type]);
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
  const confirmDiscard = () => !dirty || window.confirm('当前有未保存修改，切换后会丢弃，继续吗？');

  const setScreenshotEntryUrl = (open: boolean) => {
    const next = new URLSearchParams(location.search);
    next.set('method', open ? 'screenshot' : 'manual');
    next.set('step', open ? 'screenshot' : 'position');
    if (open) next.set('entry', 'screenshot');
    else next.delete('entry');
    if (accountId) next.set('accountId', accountId);
    void navigate({ pathname: '/position-entry', search: '?' + next.toString() });
  };

  const openScreenshotSheet = () => {
    if (selectedAccount?.type === 'cash' || !confirmDiscard()) return;
    setDirty(false);
    setPositionSheetOpen(false);
    setScreenshotSheetOpen(true);
    setScreenshotEntryUrl(true);
  };

  const closeScreenshotSheet = (open: boolean) => {
    if (open) {
      setScreenshotSheetOpen(true);
      return;
    }
    if (!confirmDiscard()) return;
    setDirty(false);
    setScreenshotSheetOpen(false);
    setScreenshotEntryUrl(false);
  };

  const showManualEntry = () => {
    if (screenshotSheetOpen) closeScreenshotSheet(false);
  };

  const selectAccount = (nextAccountId: string) => {
    if (nextAccountId === accountId) return;
    if (!confirmDiscard()) return;
    setDirty(false);
    setPositionSheetOpen(false);
    setScreenshotSheetOpen(false);
    setAccountId(nextAccountId);
    try {
      window.sessionStorage.setItem('thesis-ledger-last-account', nextAccountId);
    } catch {
      /* storage is optional */
    }
    const next = new URLSearchParams(location.search);
    next.set('accountId', nextAccountId);
    next.set('method', 'manual');
    next.set('step', 'position');
    next.delete('entry');
    void navigate({ pathname: '/position-entry', search: '?' + next.toString() });
  };
  if (accounts.length === 0) {
    return (
      <PortfolioManagement
        accounts={accounts}
        positions={[]}
        step="account"
        accountsReady={accountsReady}
        onSaved={onPortfolioChanged}
      />
    );
  }

  return (
    <section
      className="module-page import-page"
      data-import-step="position"
      data-screenshot-sheet-open={String(screenshotSheetOpen)}
    >
      <p className="kicker">Portfolio Input</p>
      <div className="entry-page-heading">
        <div>
          <h1>录入持仓</h1>
          <p className="page-description">更新账户当前持仓与现金余额。</p>
        </div>
        <Button
          className="text-button"
          type="button"
          variant="link"
          onClick={() => void navigate('/accounts')}
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
          <span>
            {selectedAccount?.institution || '未填写机构'} · {selectedAccount?.currency} ·{' '}
            {selectedAccount?.mode === 'shadow' ? '影子账户' : '实际账户'}
          </span>
        </div>
      </div>
      {selectedAccount?.type === 'cash' && screenshotSheetOpen && (
        <div className="notice" role="status">
          现金账户只支持手动现金余额。
        </div>
      )}
      <nav className="mt-3 mb-1 flex flex-wrap gap-2 pb-4" aria-label="持仓录入操作">
        <Button
          type="button"
          variant={screenshotSheetOpen ? 'outline' : 'default'}
          className={screenshotSheetOpen ? 'secondary' : ''}
          onClick={showManualEntry}
        >
          手动录入
        </Button>
        <Button
          type="button"
          disabled={selectedAccount?.type === 'cash'}
          variant={screenshotSheetOpen ? 'default' : 'outline'}
          className={screenshotSheetOpen ? '' : 'secondary'}
          onClick={openScreenshotSheet}
        >
          截图导入
        </Button>
      </nav>
      <PortfolioManagement
        accounts={accounts}
        positions={accountPositions}
        cashValue={entryCashValue}
        step="position"
        defaultAccountId={accountId}
        entryAccountLocked={Boolean(requestedAccountId)}
        entrySheetOpen={positionSheetOpen}
        onEntrySheetOpenChange={(open) => {
          setPositionSheetOpen(open);
          if (!open) {
            const next = new URLSearchParams(location.search);
            next.delete('entry');
            void navigate({ pathname: '/position-entry', search: '?' + next.toString() });
          }
        }}
        onDirtyChange={setDirty}
        onSaved={() => {
          setDirty(false);
          onPortfolioChanged();
        }}
      />
      <Sheet open={screenshotSheetOpen} onOpenChange={closeScreenshotSheet}>
        <SheetContent
          side="right"
          aria-describedby="screenshot-import-description"
          className="h-[100dvh] w-[620px] max-w-[calc(100%-16px)] gap-0 overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
        >
          <div className="panel-heading">
            <SheetTitle>截图导入</SheetTitle>
            <SheetDescription id="screenshot-import-description">
              上传不会直接修改持仓；请在提交前完成代码、数量和成本价审核。
            </SheetDescription>
          </div>
          <ScreenshotImportReview
            accounts={accounts}
            initialAccountId={accountId}
            accountLocked
            embedded
            onDirtyChange={setDirty}
            onPortfolioChanged={onPortfolioChanged}
          />
        </SheetContent>
      </Sheet>
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
        const [providerResponse, riskResponse] = await Promise.all([
          fetch('/api/v1/providers/config'),
          fetch('/api/v1/risk/rules'),
        ]);
        if (!providerResponse.ok || !riskResponse.ok) {
          throw new Error('onboarding status');
        }
        const [providers, rules] = await Promise.all([
          providerResponse.json() as Promise<OnboardingProviderRecord[]>,
          riskResponse.json() as Promise<OnboardingRiskRuleRecord[]>,
        ]);
        if (!active) return;

        setOnboardingStatus({
          hasProviderSetup: hasConfiguredProviderSetup(providers),
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
              {portfolio!.positions.length === 0 ? (
                <EmptyTableRow colSpan={7} />
              ) : (
                [...portfolio!.positions]
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
                        <Badge
                          className={position.stale ? 'tag warning' : 'tag'}
                          variant="secondary"
                        >
                          {position.stale ? '陈旧' : '最新'}
                        </Badge>
                      </td>
                    </tr>
                  ))
              )}
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
        <DataStateBanner
          state={detailState}
          description={error || undefined}
          onRetry={loadDetail}
        />
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
  accountsReady = true,
  onAccountEntry,
  entryAccountLocked = false,
  entrySheetOpen,
  onEntrySheetOpenChange,
  onDirtyChange,
  onSaved,
}: {
  accounts: Account[];
  positions: Position[];
  cashValue?: number;
  step: 'account' | 'position';
  defaultAccountId?: string;
  accountsReady?: boolean;
  onAccountEntry?: (accountId: string) => void;
  entryAccountLocked?: boolean;
  entrySheetOpen?: boolean;
  onEntrySheetOpenChange?: (open: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<Position | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [uncontrolledEntrySheetOpen, setUncontrolledEntrySheetOpen] = useState(false);
  const initialEntryAccountId = defaultAccountId ?? accounts[0]?.id ?? '';
  const [entrySheetMode, setEntrySheetMode] = useState<'position' | 'cash'>(() =>
    entrySheetOpen &&
    accounts.find((account) => account.id === initialEntryAccountId)?.type === 'cash'
      ? 'cash'
      : 'position',
  );
  const [managedAccounts, setManagedAccounts] = useState<Account[]>(accounts);
  const [managedAccountsLoaded, setManagedAccountsLoaded] = useState(step !== 'account');
  const [entryAccountId, setEntryAccountId] = useState(initialEntryAccountId);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [instrumentQuery, setInstrumentQuery] = useState('');
  const [debouncedInstrumentQuery, setDebouncedInstrumentQuery] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentLookup | null>(null);
  const [instrumentConfirmationBusy, setInstrumentConfirmationBusy] = useState(false);
  const [instrumentSearchOpen, setInstrumentSearchOpen] = useState(false);
  const [manualInstrumentEntry, setManualInstrumentEntry] = useState(false);
  const [manualAssetType, setManualAssetType] = useState<HeldAssetType>(
    accounts.find((account) => account.id === initialEntryAccountId)?.type === 'fund'
      ? 'fund'
      : 'stock',
  );
  const instrumentSelectionInProgress = useRef(false);
  const instrumentSearchErrorNotified = useRef<string | null>(null);
  const toastManager = useToastManager();
  const markDirty = (nextDirty = true) => {
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  };
  const positionSheetOpen = entrySheetOpen ?? uncontrolledEntrySheetOpen;
  const setPositionSheetOpen = (open: boolean) => {
    if (entrySheetOpen === undefined) setUncontrolledEntrySheetOpen(open);
    onEntrySheetOpenChange?.(open);
  };
  const openEntrySheet = (mode: 'position' | 'cash' = 'position') => {
    setEntrySheetMode(mode);
    setPositionSheetOpen(true);
  };
  const confirmDiscard = () => !dirty || window.confirm('当前有未保存修改，切换后会丢弃，继续吗？');
  const selectedAccount = accounts.find((account) => account.id === entryAccountId);
  const normalizedInstrumentQuery = instrumentQuery.trim().toUpperCase();
  useEffect(() => {
    const updateDebouncedInstrumentQuery = debounce(
      () => setDebouncedInstrumentQuery(normalizedInstrumentQuery),
      500,
    );
    updateDebouncedInstrumentQuery();
    return () => updateDebouncedInstrumentQuery.cancel();
  }, [normalizedInstrumentQuery]);

  const selectedAccountType = selectedAccount?.type;
  const instrumentSearchQueryResult = useQuery<InstrumentLookup[]>({
    queryKey: [
      'market-data',
      'instruments',
      'search',
      selectedAccountType ?? 'all',
      debouncedInstrumentQuery,
    ],
    enabled:
      positionSheetOpen &&
      !editing &&
      !selectedInstrument &&
      !manualInstrumentEntry &&
      !instrumentConfirmationBusy &&
      Boolean(debouncedInstrumentQuery) &&
      debouncedInstrumentQuery === normalizedInstrumentQuery,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        '/api/v1/market-data/instruments/search?q=' + encodeURIComponent(debouncedInstrumentQuery),
        { cache: 'no-store', signal },
      );
      if (!response.ok) throw new Error('instrument-search');
      const results = (await response.json()) as InstrumentLookup[];
      return results.filter((instrument) =>
        selectedAccountType === 'fund'
          ? instrument.instrumentType === 'MUTUAL_FUND'
          : ['STOCK', 'ETF'].includes(instrument.instrumentType),
      );
    },
    placeholderData: [] as InstrumentLookup[],
    retry: false,
    staleTime: 30_000,
  });
  const instrumentResults = instrumentSearchQueryResult.data ?? [];
  const instrumentSearchDebouncing =
    Boolean(normalizedInstrumentQuery) &&
    debouncedInstrumentQuery !== normalizedInstrumentQuery;
  const instrumentSearchBusy =
    instrumentConfirmationBusy ||
    (Boolean(normalizedInstrumentQuery) &&
      (instrumentSearchDebouncing || instrumentSearchQueryResult.isFetching));
  let instrumentSearchState: InstrumentSearchState = 'idle';
  if (selectedInstrument) {
    instrumentSearchState = 'selected';
  } else if (instrumentConfirmationBusy) {
    instrumentSearchState = 'loading';
  } else if (!normalizedInstrumentQuery) {
    instrumentSearchState = 'idle';
  } else if (instrumentSearchBusy) {
    instrumentSearchState = 'loading';
  } else if (instrumentSearchQueryResult.isError) {
    instrumentSearchState = 'error';
  } else if (instrumentSearchQueryResult.isSuccess && instrumentResults.length > 0) {
    instrumentSearchState = 'results';
  } else if (instrumentSearchQueryResult.isSuccess) {
    instrumentSearchState = 'empty';
  }

  useEffect(() => {
    if (
      !instrumentSearchQueryResult.isError ||
      !normalizedInstrumentQuery ||
      instrumentSearchBusy ||
      debouncedInstrumentQuery !== normalizedInstrumentQuery
    )
      return;
    const errorKey = `${selectedAccountType ?? 'all'}:${debouncedInstrumentQuery}`;
    if (instrumentSearchErrorNotified.current === errorKey) return;
    instrumentSearchErrorNotified.current = errorKey;
    toastManager.add({
      title: '标的搜索失败',
      description: '请确认市场数据与标的中心已完成目录同步。',
      type: 'error',
      timeout: 0,
      priority: 'high',
    });
  }, [
    debouncedInstrumentQuery,
    instrumentSearchBusy,
    instrumentSearchQueryResult.isError,
    normalizedInstrumentQuery,
    selectedAccountType,
    toastManager,
  ]);

  useEffect(() => {
    if (defaultAccountId) setEntryAccountId(defaultAccountId);
    else if (!entryAccountId && accounts[0]) setEntryAccountId(accounts[0].id);
  }, [accounts, defaultAccountId, entryAccountId]);

  useEffect(() => {
    if (editing) {
      setInstrumentQuery(editing.symbol);
      setSelectedInstrument(null);
      setInstrumentSearchOpen(false);
      setManualInstrumentEntry(false);
    } else if (!positionSheetOpen) {
      setInstrumentQuery('');
      setSelectedInstrument(null);
      setInstrumentSearchOpen(false);
      setManualInstrumentEntry(false);
    }
  }, [editing, positionSheetOpen]);

  const loadManagedAccounts = async () => {
    if (step !== 'account') return;
    setManagedAccountsLoaded(false);
    try {
      const response = await fetch('/api/v1/accounts?includeInactive=true', { cache: 'no-store' });
      if (!response.ok) {
        setManagedAccounts(accounts);
        return;
      }
      setManagedAccounts((await response.json()) as Account[]);
      setManagedAccountsLoaded(true);
    } catch {
      setManagedAccounts(accounts);
    }
  };
  useEffect(() => {
    setManagedAccounts(accounts);
    if (step === 'account' && accountsReady) {
      void loadManagedAccounts();
      return;
    }
    setManagedAccountsLoaded(step !== 'account');
  }, [accounts, accountsReady, step]);

  useEffect(() => {
    if (
      step === 'account' &&
      accountsReady &&
      managedAccountsLoaded &&
      managedAccounts.length === 0
    ) {
      setAccountSheetOpen(true);
    }
  }, [accountsReady, managedAccounts.length, managedAccountsLoaded, step]);

  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const isEditing = Boolean(editingAccount);
    setBusyAction('account-save');
    try {
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
      if (!response.ok) throw new Error('account');
      formElement.reset();
      setEditingAccount(null);
      markDirty(false);
      await loadManagedAccounts();
      setAccountSheetOpen(false);
      onSaved();
      toastManager.add({
        title: isEditing ? '账户已更新' : '账户已创建',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: isEditing ? '账户更新失败' : '账户创建失败',
        description: isEditing
          ? '有 Ledger 历史时类型、模式和币种不可修改。'
          : '请检查名称、机构和账户类型。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleAccount = async (account: Account) => {
    if (busyAction) return;
    const active = account.active !== false;
    if (active && !window.confirm('确认停用账户“' + account.name + '”？')) return;
    setBusyAction(`account-toggle:${account.id}`);
    try {
      const response = await fetch(
        active
          ? '/api/v1/accounts/' + account.id
          : '/api/v1/accounts/' + account.id + '/reactivate',
        { method: active ? 'DELETE' : 'POST' },
      );
      if (!response.ok) throw new Error('account-toggle');
      markDirty(false);
      await loadManagedAccounts();
      onSaved();
      toastManager.add({
        title: active ? '账户已停用' : '账户已重新启用',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: active ? '账户停用失败' : '账户重新启用失败',
        description: active ? '账户仍有余额，需先清空持仓和现金。' : '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleInstrumentQueryChange = (value: string) => {
    if (editing || instrumentSelectionInProgress.current) return;
    const nextQuery = value.toUpperCase();
    if (manualInstrumentEntry) {
      setInstrumentQuery(nextQuery);
      return;
    }
    if (nextQuery === instrumentQuery) {
      if (nextQuery.trim()) setInstrumentSearchOpen(true);
      return;
    }
    setInstrumentQuery(nextQuery);
    setSelectedInstrument(null);
    setManualInstrumentEntry(false);
    if (!nextQuery.trim()) {
      setInstrumentSearchOpen(false);
      return;
    }
    setInstrumentSearchOpen(true);
  };

  const confirmInstrument = async (instrument: InstrumentLookup) => {
    if (!instrument.confirmable || editing) return;
    instrumentSelectionInProgress.current = true;
    setInstrumentConfirmationBusy(true);
    setInstrumentSearchOpen(false);
    setInstrumentQuery(instrument.symbol);
    try {
      const response = await fetch(
        '/api/v1/market-data/instruments/' + encodeURIComponent(instrument.id) + '/confirm',
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('instrument-confirm');
      setSelectedInstrument(instrument);
      setManualInstrumentEntry(false);
      markDirty(true);
    } catch {
      toastManager.add({
        title: '标的确认失败',
        description: '请先同步目录，或检查服务端数据库迁移状态。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      instrumentSelectionInProgress.current = false;
      setInstrumentConfirmationBusy(false);
    }
  };

  const clearInstrumentSelection = () => {
    setSelectedInstrument(null);
    setManualInstrumentEntry(false);
    setInstrumentQuery('');
    setInstrumentSearchOpen(false);
  };

  const startManualInstrumentEntry = () => {
    setManualInstrumentEntry(true);
    setInstrumentSearchOpen(false);
    setManualAssetType(selectedAccount?.type === 'fund' ? 'fund' : 'stock');
    markDirty(true);
  };

  const submitPosition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const accountId = formText(form, 'accountId') || entryAccountId;
    const account = accounts.find((item) => item.id === accountId);
    const isCash = account?.type === 'cash';
    const isEditing = Boolean(editing);
    if (!isCash && !isEditing && !selectedInstrument) {
      if (!manualInstrumentEntry) {
        toastManager.add({
          title: '请选择标的',
          description: '请从搜索结果中选择标的，或在未找到时手动录入。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
        return;
      }
      if (!formText(form, 'assetName').trim() || !formText(form, 'assetType')) {
        toastManager.add({
          title: '请补充标的信息',
          description: '手动录入需要填写名称和类型。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
        return;
      }
    }
    setBusyAction(isCash ? 'cash-save' : 'position-save');
    try {
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
                ...(selectedInstrument ? { instrumentId: selectedInstrument.id } : {}),
                assetName:
                  formText(form, 'assetName') || selectedInstrument?.displayName || undefined,
                assetType:
                  formText(form, 'assetType') ||
                  (selectedInstrument?.instrumentType === 'MUTUAL_FUND'
                    ? 'fund'
                    : selectedInstrument?.instrumentType === 'ETF'
                      ? 'etf'
                      : selectedInstrument
                        ? 'stock'
                        : undefined),
              }),
            },
          );
      if (!response.ok) throw new Error('position');
      formElement.reset();
      setEditing(null);
      markDirty(false);
      setPositionSheetOpen(false);
      onSaved();
      toastManager.add({
        title: isCash ? '现金余额已保存' : isEditing ? '持仓已更新' : '持仓已添加',
        description: isCash ? undefined : '组合将重新估值。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: isCash ? '现金余额保存失败' : isEditing ? '持仓更新失败' : '持仓添加失败',
        description: isCash ? '请检查金额。' : '请检查标的、数量和平均成本。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const submitCashBalance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusyAction('cash-save');
    try {
      const response = await fetch('/api/v1/portfolio/cash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: entryAccountId,
          amount: Number(formText(form, 'cashAmount')),
          source: 'manual',
        }),
      });
      if (!response.ok) throw new Error('cash');
      formElement.reset();
      markDirty(false);
      setPositionSheetOpen(false);
      onSaved();
      toastManager.add({ title: '现金余额已保存', type: 'success', timeout: 2800 });
    } catch {
      toastManager.add({
        title: '现金余额保存失败',
        description: '请检查金额。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const clearPositions = async () => {
    if (!entryAccountId || positions.length === 0 || busyAction) return;
    if (
      !window.confirm('确认清空当前账户的全部持仓？该操作会写入归零 Adjustment，现金余额不受影响。')
    )
      return;
    setBusyAction('clear-positions');
    try {
      const response = await fetch('/api/v1/portfolio/positions/clear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: entryAccountId }),
      });
      if (!response.ok) throw new Error('clear');
      markDirty(false);
      onSaved();
      toastManager.add({ title: '持仓已清空', type: 'success', timeout: 2800 });
    } catch {
      toastManager.add({
        title: '清空持仓失败',
        description: '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const remove = async (position: Position) => {
    if (busyAction) return;
    if (!window.confirm('确认删除 ' + position.asset.name + '（' + position.symbol + '）？'))
      return;
    setBusyAction(`remove:${position.id}`);
    try {
      const response = await fetch('/api/v1/portfolio/positions/' + position.id, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('remove');
      markDirty(false);
      onSaved();
      toastManager.add({ title: '持仓已删除', type: 'success', timeout: 2800 });
    } catch {
      toastManager.add({
        title: '持仓删除失败',
        description: '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section
      className={step === 'account' ? 'module-page' : 'management'}
      id="portfolio-management"
      aria-labelledby="portfolio-management-title"
      data-management-step={step}
      data-import-step={step === 'account' ? 'account' : undefined}
      data-account-sheet-open={step === 'account' ? String(accountSheetOpen) : undefined}
      data-entry-sheet-open={step === 'position' ? String(positionSheetOpen) : undefined}
    >
      {step === 'account' && (
        <div className="panel-heading">
          <p className="kicker">Account Management</p>
          <div className="entry-page-heading">
            <div>
              <h1 id="portfolio-management-title">账户管理</h1>
              <p className="page-description">
                管理已有账户；账户只描述容器属性，不记录本次持仓录入来源。
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="management-grid single-step">
        {step === 'account' && (
          <>
            <div className="mt-6 flex items-center justify-between gap-4">
              <h2 className="m-0 text-xl font-semibold">已有账户</h2>
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  setEditingAccount(null);
                  markDirty(false);
                  setAccountSheetOpen(true);
                }}
              >
                创建账户
              </Button>
            </div>
            {managedAccounts.length > 0 ? (
              <div className="account-list" aria-label="已有账户">
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
                      {account.active !== false && onAccountEntry && (
                        <Button
                          className="text-button"
                          size="sm"
                          type="button"
                          variant="link"
                          onClick={() => onAccountEntry(account.id)}
                        >
                          录入持仓
                        </Button>
                      )}
                      <Button
                        className="text-button"
                        size="sm"
                        type="button"
                        variant="link"
                        onClick={() => {
                          setEditingAccount(account);
                          markDirty(false);
                          setAccountSheetOpen(true);
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        className={account.active === false ? 'text-button' : 'text-button danger'}
                        size="sm"
                        type="button"
                        variant={account.active === false ? 'outline' : 'destructive'}
                        disabled={busyAction !== null}
                        aria-busy={busyAction === `account-toggle:${account.id}`}
                        onClick={() => void toggleAccount(account)}
                      >
                        {busyAction === `account-toggle:${account.id}` && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {busyAction === `account-toggle:${account.id}`
                          ? account.active === false
                            ? '启用中…'
                            : '停用中…'
                          : account.active === false
                            ? '重新启用'
                            : '停用'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" role="status">
                暂无账户，点击右上角“创建账户”开始。
              </div>
            )}
            <Sheet open={accountSheetOpen} onOpenChange={setAccountSheetOpen}>
              <SheetContent
                side="right"
                aria-describedby="account-form-description"
                className="h-[100dvh] w-[620px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
              >
                <div className="panel-heading">
                  <SheetTitle>{editingAccount ? '编辑账户' : '创建账户'}</SheetTitle>
                  <SheetDescription id="account-form-description">
                    账户是持仓的容器；类型、模式和币种在出现 Ledger 事件后锁定。
                  </SheetDescription>
                </div>
                <form
                  key={editingAccount?.id ?? 'new-account'}
                  className="form-card min-h-0 w-full max-w-none content-start overflow-auto"
                  onChange={() => markDirty()}
                  onSubmit={(event) => void submitAccount(event)}
                >
                  <label>
                    账户名称
                    <Input
                      name="name"
                      required
                      maxLength={80}
                      defaultValue={editingAccount?.name}
                    />
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
                    <Button type="submit" variant="default" disabled={busyAction !== null}>
                      {busyAction === 'account-save' && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {busyAction === 'account-save'
                        ? editingAccount
                          ? '保存中…'
                          : '创建中…'
                        : editingAccount
                          ? '保存账户'
                          : '创建账户'}
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
                </form>
                </SheetContent>
            </Sheet>
          </>
        )}
        {step === 'position' && (
          <div className="mt-6">
            {selectedAccount?.type !== 'cash' && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="m-0 text-xl font-semibold">持仓</h2>
                  <div className="flex items-center gap-2">
                    {positions.length > 0 && (
                      <Button
                        className="text-button danger"
                        size="sm"
                        type="button"
                        variant="destructive"
                        disabled={busyAction !== null}
                        aria-busy={busyAction === 'clear-positions'}
                        onClick={() => void clearPositions()}
                      >
                        {busyAction === 'clear-positions' && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {busyAction === 'clear-positions' ? '清空中…' : '清空持仓'}
                      </Button>
                    )}
                    <Button
                      className="text-button"
                      type="button"
                      variant="link"
                      onClick={() => {
                        setEditing(null);
                        openEntrySheet('position');
                      }}
                    >
                      + 添加持仓
                    </Button>
                  </div>
                </div>
                {positions.length > 0 ? (
                  <div className="mt-2 divide-y border-y border-border" aria-label="持仓操作">
                    {positions.map((position) => (
                      <div
                        key={position.id}
                        className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(72px,0.8fr)_minmax(120px,1fr)_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <strong className="block truncate text-sm font-medium text-foreground">
                            {position.asset.name || position.symbol}
                          </strong>
                          <span className="mt-1 block font-mono text-xs text-muted-foreground">
                            {position.symbol}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {position.quantity.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}
                          {assetQuantityUnit(position.asset.assetType, position.symbol)}
                        </span>
                        <span className="font-mono text-sm text-foreground sm:text-right">
                          {money.format(
                            position.marketValue ?? position.costPrice * position.quantity,
                          )}
                        </span>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            className="text-button"
                            size="sm"
                            type="button"
                            variant="link"
                            onClick={() => {
                              setEditing(position);
                              setEntryAccountId(position.accountId);
                              openEntrySheet('position');
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            className="text-button danger"
                            size="sm"
                            type="button"
                            variant="destructive"
                            disabled={busyAction !== null}
                            aria-busy={busyAction === `remove:${position.id}`}
                            onClick={() => void remove(position)}
                          >
                            {busyAction === `remove:${position.id}` && (
                              <LoaderCircle
                                data-icon="inline-start"
                                className="animate-spin"
                                aria-hidden="true"
                              />
                            )}
                            {busyAction === `remove:${position.id}` ? '删除中…' : '删除'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" role="status">
                    暂无持仓，点击右上角“添加持仓”开始。
                  </div>
                )}
              </>
            )}
            <div className="mt-8">
              <div className="flex items-center justify-between gap-4">
                <h2 className="m-0 text-xl font-semibold">现金余额</h2>
                <Button
                  className="text-button"
                  size="sm"
                  type="button"
                  variant="link"
                  onClick={() => {
                    setEditing(null);
                    openEntrySheet('cash');
                  }}
                >
                  编辑
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4 border-y border-border px-1 py-4">
                <span className="text-sm text-muted-foreground">当前余额</span>
                <strong className="font-mono text-base font-medium text-foreground">
                  {money.format(cashValue ?? 0)}
                </strong>
              </div>
            </div>
            <Sheet open={positionSheetOpen} onOpenChange={setPositionSheetOpen}>
              <SheetContent
                side="right"
                aria-describedby="position-form-description"
                className="h-[100dvh] w-[620px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
              >
                <div className="panel-heading">
                  <SheetTitle>
                    {entrySheetMode === 'cash' ? '编辑现金余额' : editing ? '编辑持仓' : '添加持仓'}
                  </SheetTitle>
                  <SheetDescription id="position-form-description">
                    录入账户当前实际持仓，用于初始化或校准持仓数据。
                  </SheetDescription>
                </div>
                {entrySheetMode === 'cash' && selectedAccount?.type !== 'cash' ? (
                  <form
                    key="cash-entry"
                    className="form-card min-h-0 w-full max-w-none content-start overflow-auto"
                    onChange={() => markDirty()}
                    onSubmit={(event) => void submitCashBalance(event)}
                  >
                    <h3>现金余额</h3>
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
                      <Button
                        type="submit"
                        variant="default"
                        disabled={busyAction !== null}
                        aria-busy={busyAction === 'position-save' || busyAction === 'cash-save'}
                      >
                        {busyAction === 'cash-save' && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {busyAction === 'cash-save' ? '保存中…' : '保存当前现金'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form
                    className="form-card min-h-0 w-full max-w-none content-start overflow-auto"
                    onChange={() => markDirty()}
                    onSubmit={(event) => void submitPosition(event)}
                    key={editing?.id ?? 'new'}
                  >
                    {entryAccountLocked ? (
                      <div className="grid gap-1.5">
                        <span className="text-xs text-muted-foreground">账户</span>
                        <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                          <strong className="truncate text-sm font-medium text-foreground">
                            {selectedAccount?.name ?? '未选择账户'}
                          </strong>
                          {selectedAccount && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {selectedAccount.type === 'fund'
                                ? '基金账户'
                                : selectedAccount.type === 'cash'
                                  ? '现金账户'
                                  : '证券账户'}
                            </span>
                          )}
                        </div>
                        <input type="hidden" name="accountId" value={entryAccountId} />
                      </div>
                    ) : (
                      <label>
                        账户
                        <Select
                          name="accountId"
                          required
                          value={entryAccountId || null}
                          onValueChange={(value) => {
                            if (!value || !confirmDiscard()) return;
                            const nextAccount = accounts.find((account) => account.id === value);
                            markDirty(false);
                            setEntryAccountId(value);
                            setSelectedInstrument(null);
                            setInstrumentQuery('');
                            setInstrumentSearchOpen(false);
                            setManualInstrumentEntry(false);
                            setManualAssetType(nextAccount?.type === 'fund' ? 'fund' : 'stock');
                            setEntrySheetMode(nextAccount?.type === 'cash' ? 'cash' : 'position');
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
                                {account.name} · {account.institution || '未填写机构'} ·{' '}
                                {account.currency} ·{' '}
                                {account.type === 'fund'
                                  ? '基金'
                                  : account.type === 'cash'
                                    ? '现金'
                                    : '证券'}{' '}
                                · {account.mode === 'shadow' ? '影子' : '实际'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                    )}
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
                        <div className="grid gap-1.5">
                          <span className="text-xs text-muted-foreground">标的</span>
                          <InstrumentCombobox
                            editing={editing}
                            manualEntry={manualInstrumentEntry}
                            open={instrumentSearchOpen}
                            query={instrumentQuery}
                            results={instrumentResults}
                            searchState={instrumentSearchState}
                            selectedInstrument={selectedInstrument}
                            busy={instrumentSearchBusy}
                            onClearSelection={clearInstrumentSelection}
                            onManualEntry={startManualInstrumentEntry}
                            onOpenChange={(open) =>
                              setInstrumentSearchOpen(open && Boolean(instrumentQuery.trim()))
                            }
                            onQueryChange={handleInstrumentQueryChange}
                            onSelect={(instrument) => void confirmInstrument(instrument)}
                            onStartSearch={() => {
                              if (instrumentQuery.trim()) setInstrumentSearchOpen(true);
                            }}
                          />
                        </div>
                        {manualInstrumentEntry && (
                          <div className="grid gap-4 rounded-md border border-border bg-muted/20 p-3">
                            <label>
                              名称
                              <Input name="assetName" required maxLength={120} />
                            </label>
                            <label>
                              类型
                              <Select
                                name="assetType"
                                required
                                value={manualAssetType}
                                onValueChange={(value) => {
                                  if (
                                    value === 'stock' ||
                                    value === 'etf' ||
                                    value === 'fund'
                                  )
                                    setManualAssetType(value);
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue>
                                    {(value: string | null) => assetTypeLabel(value as HeldAssetType)}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {selectedAccount?.type !== 'fund' && (
                                    <>
                                      <SelectItem value="stock">股票</SelectItem>
                                      <SelectItem value="etf">ETF</SelectItem>
                                    </>
                                  )}
                                  {selectedAccount?.type === 'fund' && (
                                    <SelectItem value="fund">基金</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </label>
                          </div>
                        )}
                        <div className="grid gap-4 border-t border-border pt-4">
                          <div className="text-sm font-semibold text-foreground">持仓信息</div>
                          <label>
                            当前数量
                            <InputGroup className="h-10">
                              <InputGroupInput
                                className="h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                name="quantity"
                                required
                                type="number"
                                min="0"
                                step="any"
                                defaultValue={editing?.quantity}
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>
                                  {assetQuantityUnit(
                                    selectedInstrument
                                      ? instrumentAssetType(selectedInstrument.instrumentType)
                                      : manualInstrumentEntry
                                        ? manualAssetType
                                        : editing?.asset.assetType,
                                    editing?.symbol,
                                  )}
                                </InputGroupText>
                              </InputGroupAddon>
                            </InputGroup>
                          </label>
                          <label>
                            平均成本
                            <InputGroup className="h-10">
                              <InputGroupInput
                                className="h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                name="costPrice"
                                required
                                type="number"
                                min="0"
                                step="any"
                                defaultValue={editing?.costPrice}
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>
                                  元/
                                  {assetQuantityUnit(
                                    selectedInstrument
                                      ? instrumentAssetType(selectedInstrument.instrumentType)
                                      : manualInstrumentEntry
                                        ? manualAssetType
                                        : editing?.asset.assetType,
                                    editing?.symbol,
                                  )}
                                </InputGroupText>
                              </InputGroupAddon>
                            </InputGroup>
                          </label>
                        </div>
                      </>
                    )}
                    <div className="form-actions justify-end border-t border-border pt-4">
                      <Button
                        className="secondary"
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditing(null);
                          markDirty(false);
                          setPositionSheetOpen(false);
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        type="submit"
                        variant="default"
                        disabled={busyAction !== null}
                        aria-busy={busyAction === 'position-save' || busyAction === 'cash-save'}
                      >
                        {(busyAction === 'position-save' || busyAction === 'cash-save') && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {busyAction === 'position-save' || busyAction === 'cash-save'
                          ? '保存中…'
                          : editing
                            ? '保存修改'
                            : selectedAccount?.type === 'cash'
                              ? '保存当前现金'
                              : '添加持仓'}
                      </Button>
                    </div>
                  </form>
                )}
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
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
        <p>
          按顺序完成账户、持仓、数据源与通知、风险提醒配置。自动化任务可以稍后单独设置；敏感凭证由服务端安全保存，页面不会显示。
        </p>
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
                ? '数据源和通知已配置；自动化任务可以继续设置。'
                : '至少配置一个行情数据源和一个通知 Provider；自动化任务可以稍后设置。'}
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
  description,
  onRetry,
}: {
  state: LoadState;
  description?: string | undefined;
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
        <span>{description ?? content.description}</span>
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
