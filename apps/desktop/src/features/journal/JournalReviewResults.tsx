import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { LoaderCircle } from 'lucide-react';
import type {
  BehaviorReviewResult,
  DeterministicJournalReviewResult,
  JournalReviewCandidate,
  JournalReviewResult,
  ReviewTrade,
  ReviewWindow,
} from './journal.types.js';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readNumber = (value: unknown, key: string) => {
  const candidate = asRecord(value)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
};

const readString = (value: unknown, key: string) => {
  const candidate = asRecord(value)[key];
  return typeof candidate === 'string' ? candidate : null;
};

const formatMoney = (value: number | null) =>
  value === null
    ? '证据不足'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);

const formatNumber = (value: number | null, suffix = '') =>
  value === null ? '证据不足' : `${value.toFixed(2)}${suffix}`;

const formatPercent = (value: number | null) =>
  value === null ? '证据不足' : `${(value * 100).toFixed(1)}%`;

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
};

const holdingDays = (trade: ReviewTrade) => {
  const days = (new Date(trade.exitAt).getTime() - new Date(trade.entryAt).getTime()) / 86_400_000;
  return Number.isFinite(days) ? days : null;
};

const completenessLabel = (value: JournalReviewCandidate['evidenceCompleteness']) => {
  if (value === 'complete') return '证据完整';
  if (value === 'partial') return '计划部分缺失';
  return '仅有实际交易';
};

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-muted/20 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="truncate text-base font-medium">{value}</strong>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function EvidenceStatus({
  label,
  detected,
  evidence,
}: {
  label: string;
  detected: boolean | null;
  evidence: string;
}) {
  let status = '证据不足';
  let variant: 'default' | 'secondary' | 'outline' = 'outline';
  if (detected === true) {
    status = '发现偏差';
    variant = 'default';
  } else if (detected === false) {
    status = '未发现偏差';
    variant = 'secondary';
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <Badge variant={variant}>{status}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{evidence}</p>
    </div>
  );
}

export function AiReviewPanel({
  aiRun,
  isPending,
  error,
  onExplain,
}: {
  aiRun: JournalReviewResult['aiRun'] | null;
  isPending: boolean;
  error: Error | null;
  onExplain: () => void;
}) {
  let explainLabel = '生成 AI 解读';
  if (isPending) explainLabel = '生成中…';
  else if (aiRun) explainLabel = '重新生成 AI 解读';
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>AI 解读</CardTitle>
        <CardDescription>
          AI 只解释已计算的结构化事实，不新增交易事实或生成交易建议。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>AI 解读暂时不可用</AlertTitle>
            <AlertDescription>
              {error.message || 'Provider 未返回可用结果。确定性复盘仍然保留。'}
            </AlertDescription>
          </Alert>
        )}
        {aiRun && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">已创建解释任务</Badge>
            <span>
              {aiRun.provider}/{aiRun.model}
            </span>
            <span className="text-muted-foreground">Prompt {aiRun.promptVersion}</span>
            <span className="text-muted-foreground">任务 {aiRun.id.slice(0, 8)}</span>
          </div>
        )}
        <Button type="button" variant="outline" onClick={onExplain} disabled={isPending}>
          {isPending && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {explainLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

export function RawEvidenceSheet({
  open,
  onOpenChange,
  title = '原始复盘证据',
  description = '只读查看本次复盘使用的结构化事实。',
  value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  value: unknown;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(100vw,48rem)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <pre className="mx-4 overflow-x-auto rounded-lg border bg-muted/20 p-4 text-xs leading-5 whitespace-pre-wrap">
          {JSON.stringify(value, null, 2)}
        </pre>
      </SheetContent>
    </Sheet>
  );
}

export function SingleReviewResult({
  trade,
  candidate,
  result,
  aiRun,
  aiPending,
  aiError,
  onExplain,
}: {
  trade: ReviewTrade;
  candidate: JournalReviewCandidate | null;
  result: DeterministicJournalReviewResult;
  aiRun: JournalReviewResult['aiRun'] | null;
  aiPending: boolean;
  aiError: Error | null;
  onExplain: () => void;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const planned = result.plannedVsActual;
  const behavior = result.behavior;
  const counterfactual = result.counterfactual;
  const stopDetected =
    trade.plannedStop === undefined || trade.actualExit === undefined
      ? null
      : trade.actualExit < trade.plannedStop;
  const earlyProfitDetected =
    trade.plannedExit === undefined || trade.actualExit === undefined
      ? null
      : trade.actualExit < trade.plannedExit;
  const positionDetected =
    trade.targetWeight === undefined || trade.peakWeight === undefined
      ? null
      : trade.peakWeight > trade.targetWeight;
  const missing = candidate?.missingEvidence ?? [];
  const rawEvidence = useMemo(
    () => ({ trade, planned, behavior, counterfactual }),
    [behavior, counterfactual, planned, trade],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{trade.symbol} · 复盘结论</CardTitle>
              <CardDescription>
                {formatDateTime(trade.entryAt)} → {formatDateTime(trade.exitAt)}
              </CardDescription>
            </div>
            <Badge variant={candidate ? 'secondary' : 'outline'}>
              {candidate ? completenessLabel(candidate.evidenceCompleteness) : '手动输入'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <Metric label="已实现盈亏" value={formatMoney(trade.pnl)} />
          <Metric label="实际持有" value={formatNumber(holdingDays(trade), ' 天')} />
          <Metric label="成交数量" value={formatNumber(trade.quantity ?? null)} />
          <Metric
            label="证据状态"
            value={missing.length === 0 ? '可完整判断' : '部分证据缺失'}
            hint={missing.join('、')}
          />
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>计划与执行</CardTitle>
          <CardDescription>
            计划值、实际值和差值并列展示；缺少必要事实时保留证据不足。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="入场价偏差"
            value={formatMoney(readNumber(planned, 'entryDeviation'))}
            hint={`实际 ${formatMoney(trade.entryPrice ?? null)} / 计划 ${formatMoney(trade.plannedEntry ?? null)}`}
          />
          <Metric
            label="退出价偏差"
            value={formatMoney(readNumber(planned, 'exitDeviation'))}
            hint={`实际 ${formatMoney(trade.exitPrice ?? null)} / 计划 ${formatMoney(trade.plannedExit ?? null)}`}
          />
          <Metric
            label="持有天数偏差"
            value={formatNumber(readNumber(planned, 'holdingDayDeviation'), ' 天')}
            hint={`实际 ${formatNumber(holdingDays(trade), ' 天')} / 计划 ${formatNumber(trade.plannedHoldingDays ?? null, ' 天')}`}
          />
          <Metric
            label="仓位偏差"
            value={formatPercent(
              trade.targetWeight === undefined || trade.peakWeight === undefined
                ? null
                : trade.peakWeight - trade.targetWeight,
            )}
            hint={`最高 ${formatPercent(trade.peakWeight ?? null)} / 目标 ${formatPercent(trade.targetWeight ?? null)}`}
          />
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>行为证据</CardTitle>
          <CardDescription>这些是规则命中的研究分类，不是心理诊断。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <EvidenceStatus
            label="未按计划止损"
            detected={stopDetected}
            evidence={
              stopDetected === null
                ? '需要计划止损价和实际退出价。'
                : `计划止损 ${formatMoney(trade.plannedStop ?? null)}，实际退出 ${formatMoney(trade.actualExit ?? null)}。`
            }
          />
          <EvidenceStatus
            label="提前止盈 / 退出"
            detected={earlyProfitDetected}
            evidence={
              earlyProfitDetected === null
                ? '需要计划退出价和实际退出价。'
                : `计划退出 ${formatMoney(trade.plannedExit ?? null)}，实际退出 ${formatMoney(trade.actualExit ?? null)}。`
            }
          />
          <EvidenceStatus
            label="仓位超过目标"
            detected={positionDetected}
            evidence={
              positionDetected === null
                ? '需要目标仓位和最高仓位。'
                : `目标 ${formatPercent(trade.targetWeight ?? null)}，最高 ${formatPercent(trade.peakWeight ?? null)}。`
            }
          />
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>反事实比较</CardTitle>
          <CardDescription>假设结果不代表可实现收益，边界说明始终保留在结果中。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="实际盈亏" value={formatMoney(readNumber(counterfactual, 'actualPnl'))} />
            <Metric
              label="假设盈亏"
              value={formatMoney(readNumber(counterfactual, 'counterfactualPnl'))}
            />
            <Metric label="差额" value={formatMoney(readNumber(counterfactual, 'difference'))} />
          </div>
          <p className="text-xs text-muted-foreground">
            {readString(counterfactual, 'assumption') ??
              '按计划止损价成交，数量按每笔 1 单位归一化，未计滑点和流动性影响。'}
          </p>
        </CardContent>
      </Card>

      <AiReviewPanel aiRun={aiRun} isPending={aiPending} error={aiError} onExplain={onExplain} />
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={() => setRawOpen(true)}>
          查看原始证据
        </Button>
      </div>
      <RawEvidenceSheet open={rawOpen} onOpenChange={setRawOpen} value={rawEvidence} />
    </div>
  );
}

export function PeriodReviewResult({
  result,
  window,
  sampleCount,
  aiRun,
  aiPending,
  aiError,
  onExplain,
}: {
  result: Omit<BehaviorReviewResult, 'aiRun'>;
  window: ReviewWindow;
  sampleCount: number;
  aiRun: BehaviorReviewResult['aiRun'];
  aiPending: boolean;
  aiError: Error | null;
  onExplain: () => void;
}) {
  const review = asRecord(result.window);
  const behavior = asRecord(review.behavior ?? result.metrics);
  const activity = asRecord(review.activity);
  const holding = asRecord(review.holding);
  const [rawOpen, setRawOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>周期复盘结果</CardTitle>
          <CardDescription>
            窗口：{formatDateTime(window.start)} → {formatDateTime(window.end)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="交易数" value={String(readNumber(review, 'tradeCount') ?? sampleCount)} />
          <Metric label="胜率" value={formatPercent(readNumber(behavior, 'winRate'))} />
          <Metric label="盈亏比" value={formatNumber(readNumber(behavior, 'profitLossRatio'))} />
          <Metric label="平均持有" value={formatNumber(readNumber(holding, 'average'), ' 天')} />
          <Metric label="中位持有" value={formatNumber(readNumber(holding, 'median'), ' 天')} />
          <Metric
            label="换手"
            value={formatMoney(readNumber(activity, 'turnover'))}
            hint={`止损偏离 ${readNumber(behavior, 'missedStops') ?? '证据不足'} 次`}
          />
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>窗口证据</CardTitle>
          <CardDescription>
            周期请求使用你选择的起止时间，样本数量不会静默改写窗口。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            实际请求窗口：{formatDateTime(window.start)} → {formatDateTime(window.end)}；纳入样本{' '}
            {sampleCount} 笔。
          </p>
          <Separator />
          <p>重点回看建议：优先检查亏损交易、止损偏离和计划证据缺失的样本。</p>
        </CardContent>
      </Card>
      <AiReviewPanel aiRun={aiRun} isPending={aiPending} error={aiError} onExplain={onExplain} />
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={() => setRawOpen(true)}>
          查看原始证据
        </Button>
      </div>
      <RawEvidenceSheet
        open={rawOpen}
        onOpenChange={setRawOpen}
        title="周期原始证据"
        value={{ window, metrics: result.metrics, review: result.window }}
      />
    </div>
  );
}
