import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoaderCircle, SlidersHorizontal } from 'lucide-react';
import { useToastManager } from '@/components/ui/toast';

import type { Account } from '../portfolio/portfolio.types.js';
import { AdvancedJsonSheet } from './AdvancedJsonSheet.js';
import { EvidenceEditorSheet } from './EvidenceEditorSheet.js';
import { ManualReviewForm } from './ManualReviewForm.js';
import { PeriodReviewResult, SingleReviewResult } from './JournalReviewResults.js';
import { ReviewCandidateList } from './ReviewCandidateList.js';
import {
  useBehaviorAnalysisMutation,
  useBehaviorExplanationMutation,
  useSingleTradeAnalysisMutation,
  useSingleTradeExplanationMutation,
} from './journal.mutations.js';
import { useReviewCandidatesQuery } from './journal.queries.js';
import type {
  BehaviorReviewResult,
  DeterministicJournalReviewResult,
  JournalReviewCandidate,
  JournalReviewResult,
  ReviewEvidenceDraft,
  ReviewTrade,
  ReviewWindow,
  ReviewWindowPreset,
} from './journal.types.js';

const optionalTradeKeys: Array<keyof ReviewTrade> = [
  'plannedStop',
  'actualExit',
  'plannedHoldingDays',
  'entryPrice',
  'exitPrice',
  'plannedEntry',
  'plannedExit',
  'turnover',
  'peakWeight',
  'targetWeight',
  'quantity',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toReviewTrade = (
  candidate: JournalReviewCandidate,
  evidence: ReviewEvidenceDraft = {},
): ReviewTrade => {
  const trade: ReviewTrade = {
    symbol: candidate.symbol,
    entryAt: candidate.entryAt,
    exitAt: candidate.exitAt,
    pnl: candidate.pnl,
  };
  for (const key of optionalTradeKeys) {
    const candidateValue = candidate[key];
    const evidenceValue = evidence[key as keyof ReviewEvidenceDraft];
    const value = evidenceValue ?? candidateValue;
    if (value !== undefined) trade[key] = value as never;
  }
  return trade;
};

const parseTrade = (value: unknown): ReviewTrade | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.symbol !== 'string' ||
    value.symbol.trim().length === 0 ||
    typeof value.entryAt !== 'string' ||
    typeof value.exitAt !== 'string' ||
    !isFiniteNumber(value.pnl)
  ) {
    return null;
  }
  if (
    Number.isNaN(new Date(value.entryAt).getTime()) ||
    Number.isNaN(new Date(value.exitAt).getTime())
  ) {
    return null;
  }
  const trade: ReviewTrade = {
    symbol: value.symbol,
    entryAt: value.entryAt,
    exitAt: value.exitAt,
    pnl: value.pnl,
  };
  for (const key of optionalTradeKeys) {
    if (isFiniteNumber(value[key])) trade[key] = value[key] as never;
  }
  return trade;
};

const parseTrades = (value: unknown): ReviewTrade[] | null => {
  if (!Array.isArray(value)) return null;
  const trades = value.map(parseTrade);
  return trades.every((trade): trade is ReviewTrade => trade !== null) && trades.length > 0
    ? trades
    : null;
};

const latestWindow = (preset: Exclude<ReviewWindowPreset, 'custom'>): ReviewWindow => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (preset === '7d' ? 7 : 30));
  return { start: start.toISOString(), end: end.toISOString() };
};

const toLocalDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
};

const fromLocalDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function AccountState({
  accounts,
  pending,
  error,
  onRetry,
  onNavigateAccounts,
  onNavigatePosition,
}: {
  accounts: Account[];
  pending: boolean;
  error: boolean;
  onRetry?: (() => void) | undefined;
  onNavigateAccounts?: (() => void) | undefined;
  onNavigatePosition?: (() => void) | undefined;
}) {
  if (pending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="正在加载账户">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>账户读取失败</AlertTitle>
        <AlertDescription>无法确定复盘账户范围。请检查服务状态后重试。</AlertDescription>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            重新加载账户
          </Button>
        )}
      </Alert>
    );
  }
  if (accounts.length === 0) {
    return (
      <Empty className="min-h-64 rounded-xl border bg-card p-8">
        <EmptyHeader>
          <EmptyTitle>还没有可用账户</EmptyTitle>
          <EmptyDescription>先创建账户或导入持仓，投资复盘才能读取已平仓交易。</EmptyDescription>
        </EmptyHeader>
        {(onNavigateAccounts || onNavigatePosition) && (
          <div className="flex flex-wrap justify-center gap-2">
            {onNavigateAccounts && (
              <Button type="button" onClick={onNavigateAccounts}>
                去账户管理
              </Button>
            )}
            {onNavigatePosition && (
              <Button type="button" variant="outline" onClick={onNavigatePosition}>
                去录入持仓
              </Button>
            )}
          </div>
        )}
      </Empty>
    );
  }
  return null;
}

function EvidenceSummary({
  candidate,
  trade,
  temporaryEvidence,
  onEdit,
}: {
  candidate: JournalReviewCandidate | null;
  trade: ReviewTrade;
  temporaryEvidence: ReviewEvidenceDraft;
  onEdit: () => void;
}) {
  const plan = candidate?.plan;
  const missing = candidate?.missingEvidence ?? [];
  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>交易事实核对</CardTitle>
            <CardDescription>
              分析前先核对实际成交和已关联计划；补充字段只对本次复盘生效。
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={onEdit}>
            <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
            补充证据
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-xs text-muted-foreground">实际入场</span>
            <p className="font-medium">{trade.entryPrice ?? '待补充'}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">实际退出</span>
            <p className="font-medium">{trade.exitPrice ?? trade.actualExit ?? '待补充'}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">成交数量</span>
            <p className="font-medium">{trade.quantity ?? '待补充'}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">已实现盈亏</span>
            <p className="font-medium">{trade.pnl}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant={candidate?.evidenceCompleteness === 'complete' ? 'secondary' : 'outline'}
            >
              {plan ? '已关联交易计划' : '未关联交易计划'}
            </Badge>
            {Object.keys(temporaryEvidence).length > 0 && (
              <Badge variant="outline">本次临时补充</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              计划事实来源可追溯，未自动按日期猜测。
            </span>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <span>计划入场：{trade.plannedEntry ?? '待补充'}</span>
            <span>计划退出：{trade.plannedExit ?? '待补充'}</span>
            <span>计划止损：{trade.plannedStop ?? '待补充'}</span>
            <span>目标仓位：{trade.targetWeight ?? '待补充'}</span>
            <span>计划持有：{trade.plannedHoldingDays ?? '待补充'}</span>
            <span>最高仓位：{trade.peakWeight ?? '待补充'}</span>
          </div>
        </div>
        {missing.length > 0 && (
          <p className="text-sm text-muted-foreground">
            当前缺少：{missing.join('、')}。相关结论会标记为证据不足。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function JournalDashboard({
  accounts = [],
  accountsReady = true,
  accountsPending = false,
  accountsError = false,
  onRetry,
  onNavigateAccounts,
  onNavigatePosition,
}: {
  accounts?: Account[];
  accountsReady?: boolean;
  accountsPending?: boolean;
  accountsError?: boolean;
  onRetry?: () => void;
  onNavigateAccounts?: () => void;
  onNavigatePosition?: () => void;
}) {
  const toastManager = useToastManager();
  const [tab, setTab] = useState<'single' | 'period'>('single');
  const [accountId, setAccountId] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [singleStartDate, setSingleStartDate] = useState('');
  const [singleEndDate, setSingleEndDate] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<JournalReviewCandidate | null>(null);
  const [manualTrade, setManualTrade] = useState<ReviewTrade | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<ReviewEvidenceDraft>({});
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedMode, setAdvancedMode] = useState<'single' | 'period'>('single');
  const [periodPreset, setPeriodPreset] = useState<ReviewWindowPreset>('7d');
  const [periodWindow, setPeriodWindow] = useState<ReviewWindow>(() => latestWindow('7d'));
  const [periodTradesOverride, setPeriodTradesOverride] = useState<ReviewTrade[] | null>(null);
  const [singleResult, setSingleResult] = useState<DeterministicJournalReviewResult | null>(null);
  const [periodResult, setPeriodResult] = useState<Omit<BehaviorReviewResult, 'aiRun'> | null>(
    null,
  );
  const [singleAiRun, setSingleAiRun] = useState<JournalReviewResult['aiRun']>(null);
  const [periodAiRun, setPeriodAiRun] = useState<BehaviorReviewResult['aiRun']>(null);

  useEffect(() => {
    if (accountId && accounts.some((account) => account.id === accountId)) return;
    const nextAccount = accounts.find((account) => account.active !== false) ?? accounts[0];
    setAccountId(nextAccount?.id ?? '');
  }, [accountId, accounts]);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const candidateParams = useMemo(
    () => ({
      accountId,
      ...(symbolFilter.trim() ? { symbol: symbolFilter.trim() } : {}),
      limit: 100,
      ...(tab === 'period'
        ? { start: periodWindow.start, end: periodWindow.end }
        : {
            ...(singleStartDate ? { start: `${singleStartDate}T00:00:00.000Z` } : {}),
            ...(singleEndDate ? { end: `${singleEndDate}T23:59:59.999Z` } : {}),
          }),
    }),
    [
      accountId,
      periodWindow.end,
      periodWindow.start,
      singleEndDate,
      singleStartDate,
      symbolFilter,
      tab,
    ],
  );
  const candidateQuery = useReviewCandidatesQuery(
    candidateParams,
    Boolean(accountId && accountsReady && !accountsError),
  );
  const candidates = candidateQuery.data?.items ?? [];

  const currentSingleTrade = useMemo(() => {
    if (manualTrade) return manualTrade;
    if (selectedCandidate) return toReviewTrade(selectedCandidate, evidenceDraft);
    return null;
  }, [evidenceDraft, manualTrade, selectedCandidate]);
  const periodTrades =
    periodTradesOverride ?? candidates.map((candidate) => toReviewTrade(candidate));
  const periodWindowInvalid = periodWindow.start >= periodWindow.end;

  const singleAnalysis = useSingleTradeAnalysisMutation();
  const periodAnalysis = useBehaviorAnalysisMutation();
  const singleExplanation = useSingleTradeExplanationMutation();
  const periodExplanation = useBehaviorExplanationMutation();

  const resetReviewState = () => {
    setSelectedCandidate(null);
    setManualTrade(null);
    setEvidenceDraft({});
    setSingleResult(null);
    setPeriodResult(null);
    setSingleAiRun(null);
    setPeriodAiRun(null);
    setPeriodTradesOverride(null);
  };

  const selectAccount = (nextAccountId: string) => {
    if (nextAccountId === accountId) return;
    setAccountId(nextAccountId);
    setSymbolFilter('');
    setSingleStartDate('');
    setSingleEndDate('');
    resetReviewState();
  };

  const selectCandidate = (candidate: JournalReviewCandidate) => {
    setSelectedCandidate(candidate);
    setManualTrade(null);
    setEvidenceDraft({});
    setSingleResult(null);
    setSingleAiRun(null);
  };

  const startSingleReview = async () => {
    if (!currentSingleTrade) return;
    setSingleAiRun(null);
    try {
      const result = await singleAnalysis.mutateAsync(currentSingleTrade);
      setSingleResult(result);
      toastManager.add({
        title: '单笔复盘完成',
        description: '确定性事实已计算；AI 解读需要单独触发。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '确定性复盘失败',
        description: '请检查服务状态后重试；已保留当前交易证据。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  const startPeriodReview = async () => {
    if (periodTrades.length === 0 || periodWindowInvalid) return;
    setPeriodAiRun(null);
    try {
      const result = await periodAnalysis.mutateAsync({
        trades: periodTrades,
        window: periodWindow,
      });
      setPeriodResult(result);
      toastManager.add({
        title: '周期复盘完成',
        description: `已按明确窗口计算 ${periodTrades.length} 笔交易。`,
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '周期复盘失败',
        description: '请检查服务状态后重试；窗口和样本仍保留。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  const applyAdvancedJson = (value: unknown) => {
    if (advancedMode === 'single') {
      const parsed = parseTrade(value);
      if (!parsed) {
        toastManager.add({
          title: 'JSON Schema 校验失败',
          description: '单笔对象必须包含 symbol、entryAt、exitAt 和数字 pnl。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
        return;
      }
      setSelectedCandidate(null);
      setManualTrade(parsed);
      setEvidenceDraft({});
      setSingleResult(null);
      setSingleAiRun(null);
      setManualOpen(false);
      return;
    }
    const parsed = parseTrades(value);
    if (!parsed) {
      toastManager.add({
        title: 'JSON Schema 校验失败',
        description: '周期输入必须是包含有效交易对象的非空数组。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
      return;
    }
    setPeriodTradesOverride(parsed);
    setPeriodResult(null);
    setPeriodAiRun(null);
  };

  const accountState = AccountState({
    accounts,
    pending: accountsPending,
    error: accountsError,
    onRetry,
    onNavigateAccounts,
    onNavigatePosition,
  });
  if (accountState) {
    return (
      <section className="module-page flex flex-col gap-6">
        <p className="kicker">Journal Review</p>
        <h1>投资复盘</h1>
        <p className="page-description">
          先计算计划、执行和行为事实，再交给 AI 做有证据边界的解释；只读研究，不写入 Ledger。
        </p>
        {accountState}
      </section>
    );
  }

  const singleJsonValue = currentSingleTrade ?? {};
  const periodJsonValue = periodTradesOverride ?? periodTrades;

  return (
    <section className="module-page flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="kicker">Journal Review</p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1>投资复盘</h1>
            <p className="page-description">
              先计算计划、执行和行为事实，再交给 AI
              做有证据边界的解释；反事实结果会明确假设，不会写入 Ledger 或生成订单。
            </p>
          </div>
          <div className="flex min-w-56 flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="journal-review-account">
              复盘账户
            </label>
            <Select value={accountId} onValueChange={(value) => value && selectAccount(value)}>
              <SelectTrigger id="journal-review-account">
                <SelectValue placeholder="选择账户">
                  {selectedAccount?.name ?? '选择账户'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === 'single') {
            setTab('single');
            return;
          }
          if (value === 'period') setTab('period');
        }}
      >
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="single">单笔复盘</TabsTrigger>
          <TabsTrigger value="period">周期复盘</TabsTrigger>
        </TabsList>
        <TabsContent value="single" className="flex flex-col gap-4 pt-4">
          {candidateQuery.isError && (
            <Alert variant="destructive">
              <AlertTitle>已平仓交易读取失败</AlertTitle>
              <AlertDescription>
                {errorMessage(candidateQuery.error, '候选接口暂时不可用。')}
              </AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void candidateQuery.refetch()}
              >
                重试读取
              </Button>
            </Alert>
          )}
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(18rem,25rem)_minmax(0,1fr)]">
            <ReviewCandidateList
              candidates={candidates}
              selectedId={selectedCandidate?.id ?? null}
              filter={symbolFilter}
              onFilterChange={setSymbolFilter}
              startDate={singleStartDate}
              endDate={singleEndDate}
              onStartDateChange={(value) => {
                setSingleStartDate(value);
                setSingleResult(null);
                setSingleAiRun(null);
              }}
              onEndDateChange={(value) => {
                setSingleEndDate(value);
                setSingleResult(null);
                setSingleAiRun(null);
              }}
              onSelect={selectCandidate}
              loading={candidateQuery.isPending}
            />
            <div className="flex min-w-0 flex-col gap-4">
              {currentSingleTrade ? (
                <>
                  <EvidenceSummary
                    candidate={selectedCandidate}
                    trade={currentSingleTrade}
                    temporaryEvidence={evidenceDraft}
                    onEdit={() => setEvidenceOpen(true)}
                  />
                  <Card className="shadow-none">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                      <div>
                        <p className="font-medium">准备好后开始计算确定性事实</p>
                        <p className="text-sm text-muted-foreground">
                          不会创建订单，也不会修改 Ledger。
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setAdvancedMode('single');
                            setAdvancedOpen(true);
                          }}
                        >
                          高级 JSON
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void startSingleReview()}
                          disabled={singleAnalysis.isPending}
                        >
                          {singleAnalysis.isPending && (
                            <LoaderCircle
                              data-icon="inline-start"
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          )}
                          {singleAnalysis.isPending ? '计算中…' : '开始复盘'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  {singleAnalysis.isError && (
                    <Alert variant="destructive">
                      <AlertTitle>确定性复盘失败</AlertTitle>
                      <AlertDescription>
                        {errorMessage(singleAnalysis.error, '分析接口暂时不可用。')}
                      </AlertDescription>
                    </Alert>
                  )}
                  {singleResult && (
                    <SingleReviewResult
                      trade={currentSingleTrade}
                      candidate={selectedCandidate}
                      result={singleResult}
                      aiRun={singleAiRun}
                      aiPending={singleExplanation.isPending}
                      aiError={
                        singleExplanation.isError
                          ? new Error(errorMessage(singleExplanation.error, 'Provider 不可用。'))
                          : null
                      }
                      onExplain={() => {
                        if (!currentSingleTrade || !singleResult) return;
                        void singleExplanation
                          .mutateAsync({
                            trade: currentSingleTrade,
                            result: singleResult,
                            ...(selectedCandidate ? { sources: selectedCandidate.sources } : {}),
                          })
                          .then((run) => setSingleAiRun(run))
                          .catch(() => undefined);
                      }}
                    />
                  )}
                </>
              ) : (
                <Card className="shadow-none">
                  <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                    <CardTitle>选择一笔已平仓交易</CardTitle>
                    <CardDescription>
                      先核对证据，再开始确定性复盘。没有候选时可以手动输入。
                    </CardDescription>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button type="button" onClick={() => setManualOpen((open) => !open)}>
                        {manualOpen ? '收起手动复盘' : '手动复盘'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setAdvancedMode('single');
                          setAdvancedOpen(true);
                        }}
                      >
                        高级 JSON
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {manualOpen && !currentSingleTrade && (
                <ManualReviewForm
                  onSubmit={(trade) => {
                    setManualTrade(trade);
                    setSelectedCandidate(null);
                    setEvidenceDraft({});
                    setSingleResult(null);
                    setSingleAiRun(null);
                  }}
                  onCancel={() => setManualOpen(false)}
                />
              )}
            </div>
          </div>
          {currentSingleTrade && (
            <EvidenceEditorSheet
              candidate={selectedCandidate ?? { symbol: currentSingleTrade.symbol }}
              value={evidenceDraft}
              open={evidenceOpen}
              onOpenChange={setEvidenceOpen}
              onSave={(value) => {
                setEvidenceDraft(value);
                setSingleResult(null);
                setSingleAiRun(null);
              }}
            />
          )}
        </TabsContent>
        <TabsContent value="period" className="flex flex-col gap-4 pt-4">
          <Card className="shadow-none">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>复盘时间窗口</CardTitle>
                  <CardDescription>窗口边界会原样发送给服务端，并保留在结果中。</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setAdvancedMode('period');
                    setAdvancedOpen(true);
                  }}
                >
                  高级 JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={periodPreset === '7d' ? 'default' : 'outline'}
                  onClick={() => {
                    setPeriodPreset('7d');
                    setPeriodWindow(latestWindow('7d'));
                    setPeriodResult(null);
                    setPeriodAiRun(null);
                    setPeriodTradesOverride(null);
                  }}
                >
                  最近 7 天
                </Button>
                <Button
                  type="button"
                  variant={periodPreset === '30d' ? 'default' : 'outline'}
                  onClick={() => {
                    setPeriodPreset('30d');
                    setPeriodWindow(latestWindow('30d'));
                    setPeriodResult(null);
                    setPeriodAiRun(null);
                    setPeriodTradesOverride(null);
                  }}
                >
                  最近 30 天
                </Button>
                <Button
                  type="button"
                  variant={periodPreset === 'custom' ? 'default' : 'outline'}
                  onClick={() => setPeriodPreset('custom')}
                >
                  自定义
                </Button>
              </div>
              {periodPreset === 'custom' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    开始时间
                    <Input
                      type="datetime-local"
                      value={toLocalDateTime(periodWindow.start)}
                      onChange={(event) => {
                        const start = fromLocalDateTime(event.target.value);
                        if (start) {
                          setPeriodWindow((current) => ({ ...current, start }));
                          setPeriodResult(null);
                          setPeriodAiRun(null);
                        }
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    结束时间
                    <Input
                      type="datetime-local"
                      value={toLocalDateTime(periodWindow.end)}
                      onChange={(event) => {
                        const end = fromLocalDateTime(event.target.value);
                        if (end) {
                          setPeriodWindow((current) => ({ ...current, end }));
                          setPeriodResult(null);
                          setPeriodAiRun(null);
                        }
                      }}
                    />
                  </label>
                </div>
              )}
              {periodWindowInvalid && (
                <Alert variant="destructive">
                  <AlertTitle>时间窗口无效</AlertTitle>
                  <AlertDescription>
                    结束时间必须晚于开始时间，修正后才能生成周期复盘。
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={periodTrades.length > 0 ? 'secondary' : 'outline'}>
                    {periodTrades.length} 笔样本
                  </Badge>
                  {periodTradesOverride && (
                    <span className="text-muted-foreground">来自高级 JSON</span>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={() => void startPeriodReview()}
                  disabled={
                    periodTrades.length === 0 || periodWindowInvalid || periodAnalysis.isPending
                  }
                >
                  {periodAnalysis.isPending && (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {periodAnalysis.isPending ? '计算中…' : '开始周期复盘'}
                </Button>
              </div>
            </CardContent>
          </Card>
          {candidateQuery.isError && (
            <Alert variant="destructive">
              <AlertTitle>窗口交易读取失败</AlertTitle>
              <AlertDescription>
                {errorMessage(candidateQuery.error, '候选接口暂时不可用。')}
              </AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void candidateQuery.refetch()}
              >
                重试读取
              </Button>
            </Alert>
          )}
          <ReviewCandidateList
            candidates={candidates}
            filter={symbolFilter}
            onFilterChange={setSymbolFilter}
            loading={candidateQuery.isPending}
            emptyDescription="当前窗口没有已平仓交易，不能生成空报告。"
            onSelect={(candidate) => {
              selectCandidate(candidate);
              setTab('single');
            }}
          />
          {periodAnalysis.isError && (
            <Alert variant="destructive">
              <AlertTitle>周期确定性复盘失败</AlertTitle>
              <AlertDescription>
                {errorMessage(periodAnalysis.error, '分析接口暂时不可用。')}
              </AlertDescription>
            </Alert>
          )}
          {periodResult && (
            <PeriodReviewResult
              result={periodResult}
              window={periodWindow}
              sampleCount={periodTrades.length}
              aiRun={periodAiRun}
              aiPending={periodExplanation.isPending}
              aiError={
                periodExplanation.isError
                  ? new Error(errorMessage(periodExplanation.error, 'Provider 不可用。'))
                  : null
              }
              onExplain={() => {
                if (!periodResult || periodTrades.length === 0) return;
                void periodExplanation
                  .mutateAsync({
                    trades: periodTrades,
                    result: periodResult,
                    window: periodWindow,
                    ...(periodTradesOverride
                      ? {}
                      : { sources: candidates.map((candidate) => candidate.sources) }),
                  })
                  .then((run) => setPeriodAiRun(run))
                  .catch(() => undefined);
              }}
            />
          )}
        </TabsContent>
      </Tabs>
      <AdvancedJsonSheet
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        mode={advancedMode}
        value={advancedMode === 'single' ? singleJsonValue : periodJsonValue}
        onApply={applyAdvancedJson}
      />
    </section>
  );
}
