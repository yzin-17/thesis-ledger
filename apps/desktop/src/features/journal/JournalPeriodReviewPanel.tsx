import type { JournalReviewWorkspace } from './useJournalReview.js';
import {
  latestWindow,
  toLocalDateTime,
  fromLocalDateTime,
  errorMessage,
} from './journal-review-input.js';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';

import { TabsContent } from '@/components/ui/tabs';
import { LoaderCircle } from 'lucide-react';

import { PeriodReviewResult } from './JournalReviewResults.js';
import { ReviewCandidateList } from './ReviewCandidateList.js';

export function JournalPeriodReviewPanel({ state }: { state: JournalReviewWorkspace }) {
  const {
    setTab,
    symbolFilter,
    setSymbolFilter,
    periodWindow,
    periodTradesOverride,
    periodResult,
    periodAiRun,
    setPeriodAiRun,
    candidateQuery,
    candidates,
    periodTrades,
    periodAnalysis,
    periodExplanation,
    selectCandidate,
  } = state;
  return (
    <TabsContent value="period" className="flex flex-col gap-4">
      <JournalPeriodWindow state={state} />
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
        legacyItems={candidateQuery.data?.legacyItems}
        instrumentDirectory={candidateQuery.data?.instrumentDirectory}
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
              ? new Error(errorMessage(periodExplanation.error, '提供方不可用。'))
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
  );
}

function JournalPeriodWindow({ state }: { state: JournalReviewWorkspace }) {
  const {
    setAdvancedOpen,
    setAdvancedMode,
    periodPreset,
    setPeriodPreset,
    periodWindow,
    setPeriodWindow,
    periodTradesOverride,
    setPeriodTradesOverride,
    setPeriodResult,
    setPeriodAiRun,
    candidates,
    periodCandidates,
    periodTrades,
    periodWindowInvalid,
    periodAnalysis,
    startPeriodReview,
  } = state;
  return (
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
            <div className="flex flex-col gap-2 text-sm font-medium">
              <span>开始时间</span>
              <DateInput
                aria-label="开始时间"
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
            </div>
            <div className="flex flex-col gap-2 text-sm font-medium">
              <span>结束时间</span>
              <DateInput
                aria-label="结束时间"
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
            </div>
          </div>
        )}
        {periodWindowInvalid && (
          <Alert variant="destructive">
            <AlertTitle>时间窗口无效</AlertTitle>
            <AlertDescription>结束时间必须晚于开始时间，修正后才能生成周期复盘。</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant={periodTrades.length > 0 ? 'secondary' : 'outline'}>
              {periodTrades.length} 笔样本
            </Badge>
            {periodCandidates.length < candidates.length && !periodTradesOverride && (
              <span className="text-xs text-muted-foreground">
                已排除 {candidates.length - periodCandidates.length} 个非完整交易对象
              </span>
            )}
            {periodTradesOverride && <span className="text-muted-foreground">来自高级 JSON</span>}
          </div>
          <Button
            type="button"
            onClick={() => void startPeriodReview()}
            disabled={periodTrades.length === 0 || periodWindowInvalid || periodAnalysis.isPending}
          >
            {periodAnalysis.isPending && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {periodAnalysis.isPending ? '计算中…' : '开始周期复盘'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
