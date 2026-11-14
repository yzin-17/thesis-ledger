import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { useEffect, useMemo } from 'react';
import { StrategyDefinitionFields } from './StrategyDefinitionFields.js';
import { AuthoringVersionSource } from '../strategy-authoring/AuthoringVersionSource.js';
import { AuthoringIdentity } from '../strategy-authoring/AuthoringIdentity.js';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { AlertCircle, ArrowLeft, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/date-display';
import type {
  BacktestJobSummary,
  StrategyRecord,
  StrategyVersion,
} from './strategy.types.js';
import {
  findStrategyVersion,
  latestStrategyVersion,
  navFundSymbolForStrategyVersion,
  strategyCenterFocusTarget,
  strategyCenterPath,
  strategyCenterTriggerId,
} from './strategy-center.navigation.js';
import {
  StrategyLibraryAction,
  StrategyLibraryToolbar,
  StrategyRecentBacktest,
} from './StrategyListPresentation.js';
import {
  strategyStatusLabel,
  strategyVersionDisplayLabel,
  strategyVersionSummary,
} from './strategy-version-summary.model.js';
import { riskCenterApplicationPath } from './strategy-risk-application.model.js';
import { strategyTimeframeLabel } from './strategy-display-labels.js';
import { StrategyVersionBacktests } from './StrategyVersionBacktests.js';
import { StrategyVersionExperiments } from './StrategyVersionExperiments.js';
import { strategyVersionInstruments } from './strategy-instrument-display.js';

const PAGE_SIZE = 20;

export type StrategyVersionTab = 'definition' | 'versions' | 'backtests' | 'experiments';

export type StrategyVersionTabState = {
  sourceKey: string;
  value: StrategyVersionTab;
};

const isStrategyVersionTab = (value: unknown): value is StrategyVersionTab =>
  value === 'definition' ||
  value === 'versions' ||
  value === 'backtests' ||
  value === 'experiments';

const schemaRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const definitionRows = (version: StrategyVersion) => {
  const schema = schemaRecord(version.schema);
  const rows: [string, string][] = [
    ['策略说明', typeof schema.description === 'string' ? schema.description : '未填写'],
    ['执行标的', strategyVersionInstruments(version).join('、') || '未配置'],
    ['主周期', typeof schema.primaryTimeframe === 'string' ? strategyTimeframeLabel(schema.primaryTimeframe) : '未配置'],
    [
      '信号来源',
      Array.isArray(schema.signalSources) ? `${schema.signalSources.length} 个` : '未配置',
    ],
  ];
  rows.push(['入场条件', schema.entry ? '已配置' : '未配置']);
  rows.push(['退出条件', schema.exit ? '已配置' : '未配置']);
  return rows;
};

export function StrategyLibraryPage({
  refreshing = false,
  strategies,
  jobs,
  loading,
  onBacktest,
}: {
  refreshing?: boolean;
  strategies: StrategyRecord[];
  jobs: BacktestJobSummary[];
  loading: boolean;
  onBacktest: (strategy: StrategyRecord, version: StrategyVersion) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const requestedPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return [...strategies]
      .filter((strategy) => {
        if (!needle) return true;
        const symbols = strategy.versions.flatMap(strategyVersionInstruments);
        return `${strategy.name} ${strategy.description ?? ''} ${symbols.join(' ')}`
          .toLocaleLowerCase()
          .includes(needle);
      })
      .sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
  }, [search, strategies]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const updateSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value);
    else next.delete('search');
    next.delete('page');
    setSearchParams(next, { replace: true });
  };
  const updatePage = (value: number) => {
    const next = new URLSearchParams(searchParams);
    if (value > 1) next.set('page', String(value));
    else next.delete('page');
    setSearchParams(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <StrategyLibraryToolbar search={search} onSearchChange={updateSearch} />
      <AuthoringIdentity />
      <ListRefreshRegion refreshing={refreshing && !loading} label="正在刷新策略列表">
        {!loading && visible.length === 0 ? (
          <Empty className="rounded-md border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>{search ? '没有匹配的策略' : '还没有策略'}</EmptyTitle>
              <EmptyDescription>
                {search ? '调整搜索条件后重试。' : '创建第一条策略，开始记录可复现的交易假设。'}
              </EmptyDescription>
            </EmptyHeader>
            {!search ? (
              <EmptyContent>
                <Button
                  nativeButton={false}
                  render={<Link to={strategyCenterPath.newStrategy}>创建第一条策略</Link>}
                />
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <TableContainer>
            <table className="w-full table-fixed text-sm">
              <TableHeader className="border-b text-left">
                <tr>
                  <TableHead className="w-[34%]">策略名称 / 标的</TableHead>
                  <TableHead className="hidden w-[16%] sm:table-cell">最新版本</TableHead>
                  <TableHead className="w-[20%]">最近回测</TableHead>
                  <TableHead className="hidden w-[18%] sm:table-cell">更新时间</TableHead>
                  <TableHead
                    data-table-action-static className="w-24 text-right"
                  >
                    操作
                  </TableHead>
                </tr>
              </TableHeader>
              <tbody>
                {visible.map((strategy) => {
                  const latest = latestStrategyVersion(strategy.versions);
                  const recentJob = latest
                    ? (jobs
                        .filter((job) => job.strategyVersionId === latest.id)
                        .sort((left, right) =>
                          (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
                        )[0] ?? null)
                    : null;
                  return (
                    <tr key={strategy.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="min-w-0 px-2 py-3 sm:px-4">
                        {latest ? (
                          <Link
                            className="block truncate font-medium text-foreground hover:text-primary/80"
                            title={strategy.name}
                            to={strategyCenterPath.strategyVersion(strategy.id, latest.id)}
                          >
                            {strategy.name}
                          </Link>
                        ) : (
                          <span className="block truncate font-medium">{strategy.name}</span>
                        )}
                        <div className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                          {strategyVersionInstruments(latest).join('、') ||
                            strategy.description ||
                            '未填写执行范围'}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 align-top whitespace-normal sm:table-cell">
                        {latest ? `v${latest.version}` : '无版本'}
                        <div className="mt-1 text-xs text-muted-foreground">
                          共 {strategy.versions.length} 个版本
                        </div>
                      </td>
                      <td className="px-2 py-3 align-top sm:px-4">
                        <StrategyRecentBacktest job={recentJob} />
                      </td>
                      <td
                        className="hidden px-4 py-3 align-top whitespace-normal text-muted-foreground sm:table-cell"
                        title={formatDateTime(latest?.createdAt ?? strategy.updatedAt, '未知')}
                      >
                        {formatDateTime(latest?.createdAt ?? strategy.updatedAt, '时间未记录')}
                      </td>
                      <td className="px-1 py-3 text-right align-top whitespace-nowrap sm:px-3">
                        <StrategyLibraryAction
                          strategy={strategy}
                          version={latest}
                          onBacktest={onBacktest}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableContainer>
        )}
      </ListRefreshRegion>
      {filtered.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            第 {safePage} / {pageCount} 页，共 {filtered.length} 条
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => updatePage(safePage - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount}
              onClick={() => updatePage(safePage + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StrategyVersionPage({
  refreshing = false,
  strategies,
  loading,
  onBacktest,
  tabState,
  onTabChange,
}: {
  refreshing?: boolean;
  strategies: StrategyRecord[];
  loading: boolean;
  onBacktest: (strategy: StrategyRecord, version: StrategyVersion) => void;
  tabState: StrategyVersionTabState;
  onTabChange: (state: StrategyVersionTabState) => void;
}) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selection = findStrategyVersion(strategies, params.strategyId, params.versionId);
  useEffect(() => {
    if (loading) return;
    const targetId = strategyCenterFocusTarget(location.state);
    if (!targetId) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(targetId)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [loading, location.key, location.state]);
  if (loading)
    return <LoadingState label="正在读取策略版本" />;
  if (!selection) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>无法定位策略版本</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>这个地址没有解析到明确版本。为避免误操作，系统不会自动改用最新版本。</p>
          <Button
            nativeButton={false}
            render={<Link to={strategyCenterPath.library}>返回策略库</Link>}
            variant="outline"
            size="sm"
          />
        </AlertDescription>
      </Alert>
    );
  }
  const { strategy, version } = selection;
  const versions = [...strategy.versions].sort((left, right) => right.version - left.version);
  const summary = strategyVersionSummary(version);
  const versionLabel = strategyVersionDisplayLabel(version);
  const versionOptions = versions.map((candidate) => ({
    value: candidate.id,
    label: strategyVersionDisplayLabel(candidate),
  }));
  const actionsAvailable = summary.kind === 'ready';
  const sourceKey = `${strategy.id}:${version.id}`;
  const requestedTab = tabState.sourceKey === sourceKey ? tabState.value : 'definition';
  const activeTab = requestedTab;
  const savedRiskApplicationId = searchParams.get('riskApplicationId');
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Button
            nativeButton={false}
            render={
              <Link to={strategyCenterPath.library} aria-label="返回策略库">
                <ArrowLeft aria-hidden="true" />
                <span className="sr-only">返回策略库</span>
              </Link>
            }
            variant="ghost"
            size="icon-sm"
          />
          <h2 className="min-w-0 wrap-anywhere text-2xl font-semibold tracking-tight">
            {strategy.name}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <div className="flex items-center gap-3">
            <Badge variant={strategy.status === 'active' ? 'default' : 'secondary'}>
              {strategyStatusLabel(strategy.status)}
            </Badge>
            <Field className="w-auto shrink-0 flex-row items-center">
              <FieldLabel>版本</FieldLabel>
              <Select
                value={version.id}
                onValueChange={(value) => {
                  if (value) void navigate(strategyCenterPath.strategyVersion(strategy.id, value));
                }}
              >
                <SelectTrigger aria-label="查看策略版本">
                  <SelectValue>{versionLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {versionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              id={strategyCenterTriggerId.editVersion}
              nativeButton={false}
              render={
                <Link to={strategyCenterPath.editStrategyVersion(strategy.id, version.id)}>
                  编辑当前版本
                </Link>
              }
              variant="ghost"
            />
            {actionsAvailable ? (
              <Button
                id={strategyCenterTriggerId.riskApplication}
                nativeButton={false}
                render={
                  <Link to={strategyCenterPath.riskApplication(strategy.id, version.id)}>
                    生成风险规则
                  </Link>
                }
                variant="ghost"
              />
            ) : null}
            <StrategyVersionBacktestAction
              strategy={strategy}
              version={version}
              actionsAvailable={actionsAvailable}
              onBacktest={onBacktest}
            />
          </div>
        </div>
      </header>
      {summary.kind === 'missing' ? (
        <Alert variant="destructive">
          <AlertTitle>策略定义缺少必需信息</AlertTitle>
          <AlertDescription>
            缺少：{summary.missing.join('、')}。请先编辑并保存新版本；回测与风险生成已暂停。
          </AlertDescription>
        </Alert>
      ) : null}
      {summary.kind === 'invalid' ? (
        <Alert variant="destructive">
          <AlertTitle>策略摘要解析失败</AlertTitle>
          <AlertDescription>
            {summary.reason}。原始定义仍保留在下方诊断信息中；修复前不会开放回测与风险生成。
          </AlertDescription>
        </Alert>
      ) : null}
      {savedRiskApplicationId ? (
        <Alert>
          <AlertTitle>风险应用已保存</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>你仍在来源策略版本中，可以继续回测或查看刚保存的风险应用。</span>
            <div className="flex gap-2">
              <Button
                nativeButton={false}
                render={
                  <Link to={riskCenterApplicationPath(savedRiskApplicationId)}>查看风险应用</Link>
                }
                size="sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('riskApplicationId');
                  setSearchParams(next, { replace: true });
                }}
              >
                收起提示
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (isStrategyVersionTab(value)) onTabChange({ sourceKey, value });
        }}
      >
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="definition">策略定义</TabsTrigger>
          <TabsTrigger value="versions">版本记录</TabsTrigger>
          <TabsTrigger value="backtests">回测记录</TabsTrigger>
          <TabsTrigger value="experiments">
            AI 实验
          </TabsTrigger>
        </TabsList>
        <TabsContent value="definition">
          <div className="flex min-w-0 flex-col gap-5">
            <StrategyDefinitionFields
              fields={summary.kind === 'ready'
                ? summary.sections
                : definitionRows(version).map(([label, value]) => ({ group: 'context', label, value }))}
            />
            <AuthoringVersionSource version={version} />
          </div>
          <details className="mt-4 border-t pt-3">
            <summary className="w-fit cursor-pointer text-sm text-muted-foreground hover:text-foreground">诊断信息与完整定义</summary>
            <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">版本技术标识</dt>
                <dd className="break-all">{version.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">定义格式</dt>
                <dd>当前策略合同</dd>
              </div>
            </dl>
            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-4 text-xs">
              {JSON.stringify(version.schema ?? {}, null, 2)}
            </pre>
          </details>
        </TabsContent>
        <TabsContent value="versions">
          <TableContainer refreshing={refreshing} refreshLabel="正在刷新策略版本">
            <table className="w-full table-fixed text-sm">
              <TableHeader className="border-b text-left">
                <tr>
                  <TableHead className="w-2/3">版本</TableHead>
                  <TableHead className="w-1/3">创建时间</TableHead>
                </tr>
              </TableHeader>
              <tbody>
                {versions.map((candidate) => (
                  <tr key={candidate.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-foreground hover:text-primary/80"
                        to={strategyCenterPath.strategyVersion(strategy.id, candidate.id)}
                      >
                        v{candidate.version}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateTime(candidate.createdAt, '未知')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        </TabsContent>
        <TabsContent value="backtests">
          <StrategyVersionBacktests key={version.id} strategyVersionId={version.id} />
        </TabsContent>
        <TabsContent value="experiments">
          <StrategyVersionExperiments key={version.id} strategyVersionId={version.id} canCreate={actionsAvailable} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StrategyVersionBacktestAction({
  strategy,
  version,
  actionsAvailable,
  onBacktest,
}: {
  strategy: StrategyRecord;
  version: StrategyVersion;
  actionsAvailable: boolean;
  onBacktest: (strategy: StrategyRecord, version: StrategyVersion) => void;
}) {
  if (navFundSymbolForStrategyVersion(version)) {
    return (
      <Button
        nativeButton={false}
        render={
          <Link to={strategyCenterPath.navBacktestSetup(strategy.id, version.id)}>
            开始回测
          </Link>
        }
      />
    );
  }
  return (
    <Button
      disabled={!actionsAvailable}
      title={!actionsAvailable ? '当前定义需要修复后才能回测' : undefined}
      onClick={() => onBacktest(strategy, version)}
    >
      开始回测
    </Button>
  );
}
