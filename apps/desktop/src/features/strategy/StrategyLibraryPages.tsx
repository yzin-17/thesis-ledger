import { useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { AlertCircle, ArrowLeft, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  StrategySchema,
  StrategyVersion,
} from './strategy.types.js';
import {
  findStrategyVersion,
  latestStrategyVersion,
  strategyCenterFocusTarget,
  strategyCenterPath,
  strategyCenterTriggerId,
} from './strategy-center.navigation.js';
import { formatCompactDateTime } from './strategy-list-presentation.js';
import { StrategyLibraryToolbar, StrategyRecentBacktest } from './StrategyListPresentation.js';
import {
  strategyStatusLabel,
  strategyVersionDisplayLabel,
  strategyVersionSummary,
} from './strategy-version-summary.model.js';
import { riskCenterApplicationPath } from './strategy-risk-application.model.js';

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

const isV2Version = (version: StrategyVersion | null | undefined) =>
  version?.schemaVersion === 2 || schemaRecord(version?.schema).schemaVersion === 2;

const schemaSymbols = (schema: StrategySchema | undefined) => {
  const universe = schemaRecord(schema?.universe);
  const executionInstrument = schemaRecord(schema?.executionInstrument);
  const symbols = Array.isArray(universe.symbols)
    ? universe.symbols.filter((value): value is string => typeof value === 'string')
    : [];
  if (symbols.length > 0) return symbols;
  return typeof executionInstrument.symbol === 'string' ? [executionInstrument.symbol] : [];
};

const definitionRows = (version: StrategyVersion) => {
  const schema = schemaRecord(version.schema);
  const rows = [
    ['策略说明', typeof schema.description === 'string' ? schema.description : '未填写'],
    ['执行标的', schemaSymbols(version.schema).join('、') || '未配置'],
    ['主周期', typeof schema.primaryTimeframe === 'string' ? schema.primaryTimeframe : '未配置'],
    ['状态', typeof schema.status === 'string' ? schema.status : '未标注'],
  ];
  const entrySignals = Array.isArray(schema.entrySignals) ? schema.entrySignals.length : 0;
  const exitSignals = Array.isArray(schema.exitSignals) ? schema.exitSignals.length : 0;
  rows.push(['入场条件', entrySignals > 0 ? `${entrySignals} 条结构化条件` : '未配置']);
  rows.push(['退出条件', exitSignals > 0 ? `${exitSignals} 条结构化条件` : '未配置']);
  return rows;
};

export function StrategyLibraryPage({
  strategies,
  jobs,
  loading,
  onBacktest,
}: {
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
        const symbols = strategy.versions.flatMap((version) => schemaSymbols(version.schema));
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
      {!loading && visible.length === 0 ? (
        <Empty className="border border-dashed">
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="w-[34%] px-4 py-3 font-medium">策略名称 / 标的</th>
                <th className="w-[16%] px-4 py-3 font-medium">最新版本</th>
                <th className="w-[20%] px-4 py-3 font-medium">最近回测</th>
                <th className="w-[18%] px-4 py-3 font-medium">更新时间</th>
                <th data-table-action-static className="w-[12%] px-4 py-3 text-right font-medium">
                  操作
                </th>
              </tr>
            </thead>
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
                    <td className="min-w-0 px-4 py-3">
                      {latest ? (
                        <Link
                          className="font-medium text-foreground hover:underline"
                          to={strategyCenterPath.strategyVersion(strategy.id, latest.id)}
                        >
                          {strategy.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{strategy.name}</span>
                      )}
                      <div className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                        {schemaSymbols(latest?.schema).join('、') ||
                          strategy.description ||
                          '未填写执行范围'}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {latest ? `v${latest.version}` : '无版本'}
                      <div className="mt-1 text-xs text-muted-foreground">
                        共 {strategy.versions.length} 个版本
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StrategyRecentBacktest job={recentJob} />
                    </td>
                    <td
                      className="px-4 py-3 align-top text-muted-foreground"
                      title={formatDateTime(latest?.createdAt ?? strategy.updatedAt, '未知')}
                    >
                      {formatCompactDateTime(latest?.createdAt ?? strategy.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!latest}
                        onClick={() => latest && onBacktest(strategy, latest)}
                      >
                        回测
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
  strategies,
  loading,
  onBacktest,
  tabState,
  onTabChange,
}: {
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
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">正在读取策略版本…</div>
    );
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
  const isV2 = isV2Version(version);
  const summary = strategyVersionSummary(version);
  const versionLabel = strategyVersionDisplayLabel(version);
  const versionOptions = versions.map((candidate) => ({
    value: candidate.id,
    label: strategyVersionDisplayLabel(candidate),
  }));
  const v2ActionsAvailable = !isV2 || summary.kind === 'ready';
  const sourceKey = `${strategy.id}:${version.id}`;
  const requestedTab = tabState.sourceKey === sourceKey ? tabState.value : 'definition';
  const activeTab =
    requestedTab === 'experiments' && (!isV2 || summary.kind !== 'ready')
      ? 'definition'
      : requestedTab;
  const savedRiskApplicationId = searchParams.get('riskApplicationId');
  const definitionSections =
    summary.kind === 'ready'
      ? summary.sections
      : definitionRows(version).map(([label, value]) => ({ label, value }));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
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
          <h2 className="truncate text-2xl font-semibold tracking-tight">{strategy.name}</h2>
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
        <div className="flex flex-wrap items-end gap-2">
          <Button
            id={strategyCenterTriggerId.editVersion}
            nativeButton={false}
            render={
              <Link to={strategyCenterPath.editStrategyVersion(strategy.id, version.id)}>
                编辑当前版本
              </Link>
            }
            variant="outline"
          />
          {isV2 && summary.kind === 'ready' ? (
            <Button
              id={strategyCenterTriggerId.riskApplication}
              nativeButton={false}
              render={
                <Link to={strategyCenterPath.riskApplication(strategy.id, version.id)}>
                  生成风险规则
                </Link>
              }
              variant="outline"
            />
          ) : null}
          <Button
            disabled={!v2ActionsAvailable}
            title={!v2ActionsAvailable ? '当前定义需要修复后才能回测' : undefined}
            onClick={() => onBacktest(strategy, version)}
          >
            开始回测
          </Button>
        </div>
      </div>
      {!isV2 ? (
        <Alert>
          <AlertTitle>V1 能力边界</AlertTitle>
          <AlertDescription>
            此版本可继续查看、编辑和回测。AI 优化与风险生成仅支持正式 V2 策略。
          </AlertDescription>
        </Alert>
      ) : null}
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
          <TabsTrigger value="experiments" disabled={!isV2 || summary.kind !== 'ready'}>
            AI 实验
          </TabsTrigger>
        </TabsList>
        <TabsContent value="definition" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            {definitionSections.map((section) => (
              <Card key={section.label}>
                <CardHeader className="pb-2">
                  <CardDescription>{section.label}</CardDescription>
                  <CardTitle className="text-base">{section.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
          <details className="mt-4 rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">诊断信息与完整定义</summary>
            <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">版本技术标识</dt>
                <dd className="break-all">{version.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">定义格式</dt>
                <dd>{isV2 ? 'Strategy Schema V2' : 'Strategy Schema V1'}</dd>
              </div>
            </dl>
            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-4 text-xs">
              {JSON.stringify(version.schema ?? {}, null, 2)}
            </pre>
          </details>
        </TabsContent>
        <TabsContent value="versions" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b bg-muted/30 text-left">
                <tr>
                  <th className="w-2/3 px-4 py-3 font-medium">版本</th>
                  <th className="w-1/3 px-4 py-3 text-right font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((candidate) => (
                  <tr key={candidate.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-foreground hover:underline"
                        to={strategyCenterPath.strategyVersion(strategy.id, candidate.id)}
                      >
                        v{candidate.version}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatDateTime(candidate.createdAt, '未知')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="backtests" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">当前版本回测</CardTitle>
              <CardDescription>
                当前页面只展示版本身份；任务执行与结果读取由回测任务入口承载。
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
        <TabsContent value="experiments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">基于当前版本创建实验</CardTitle>
              <CardDescription>
                实验来源会锁定为 {strategy.name} v{version.version}。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                nativeButton={false}
                render={
                  <Link
                    to={`${strategyCenterPath.newExperiment}?strategyVersionId=${encodeURIComponent(version.id)}`}
                  >
                    新建 AI 实验
                  </Link>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
