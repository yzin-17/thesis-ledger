import { LoadingState, Spinner } from '@/components/ui/spinner';
import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  journalPeriodReviewRequestSchema,
  type JournalPeriodReviewResult,
  type JournalPeriodReviewResponse,
} from '@thesis-ledger/schemas';
import { journalReviewWindow } from '@thesis-ledger/domain';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { JournalWindowTimeInput } from './JournalWindowTimeInput.js';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getDesktopApiClient } from '@/shared/api/client';
import { useToastManager } from '@/components/ui/toast';
import {
  journalPeriodExplanationInput,
  matchesCurrentPeriodExplanation,
} from './JournalPeriodAiExplanation.js';
import { JournalPeriodResult } from './JournalPeriodResult.js';
import { JournalRequestError } from './JournalReviewFeedback.js';
import { JournalPeriodAiPanel } from './JournalPeriodAiPanel.js';

const presetLabels = { '7': '最近 7 天', '30': '最近 30 天', custom: '自定义窗口' };
function recentWindow(days: number) {
  const end = new Date();
  end.setSeconds(0, 0);
  return { start: new Date(end.getTime() - days * 86400000).toISOString(), end: end.toISOString() };
}
export function JournalPeriodReview(props: JournalPeriodReviewProps) {
  const {
    onSelect,
    preset,
    setPreset,
    window,
    setWindow,
    completed,
    setAiRunId,
    analysis,
    result,
    changed,
    ai,
    aiQuery,
    currentRun,
    aiBusy,
    aiError,
    save,
    canExplain,
    canSave,
  } = useJournalPeriodController(props);
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup className="max-w-xs">
        <Field>
          <FieldLabel>统计周期</FieldLabel>
          <Select
            value={preset}
            onValueChange={(next) => {
              if (next !== '7' && next !== '30' && next !== 'custom') return;
              setPreset(next);
              if (next !== 'custom') setWindow(recentWindow(Number(next)));
            }}
          >
            <SelectTrigger aria-label="统计周期" className="w-full">
              <SelectValue>{presetLabels[preset]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(presetLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      {preset === 'custom' && (
        <FieldGroup className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>开始时间</FieldLabel>
            <JournalWindowTimeInput
              aria-label="周期开始时间"
              value={window.start}
              onValueChange={(start) => setWindow({ ...window, start })}
            />
          </Field>
          <Field>
            <FieldLabel>结束时间</FieldLabel>
            <JournalWindowTimeInput
              aria-label="周期结束时间"
              value={window.end}
              onValueChange={(end) => setWindow({ ...window, end })}
            />
          </Field>
        </FieldGroup>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-busy={analysis.isPending}
          disabled={analysis.isPending || save.isPending}
          onClick={() => {
            setAiRunId(null);
            ai.reset();
            save.reset();
            analysis.mutate();
          }}
        >
          {analysis.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {analysis.isPending ? '分析中…' : '分析周期'}
        </Button>
        <Button
          variant="outline"
          disabled={!canExplain || aiBusy}
          aria-busy={aiBusy}
          onClick={() => {
            if (!completed || !canExplain) return;
            setAiRunId(null);
            ai.reset();
            ai.mutate({ data: completed.data, sequence: completed.sequence });
          }}
        >
          {aiBusy && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {periodAiActionLabel(aiBusy, Boolean(currentRun?.result))}
        </Button>
        <Button
          variant="outline"
          aria-busy={save.isPending}
          disabled={!canSave}
          onClick={() => save.mutate()}
        >
          {save.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {save.isPending ? '保存中…' : '保存复盘快照'}
        </Button>
      </div>
      {analysis.isError && <JournalRequestError title="周期分析未完成" error={analysis.error} />}
      {save.isError && <JournalRequestError title="周期快照未保存" error={save.error} />}
      {!result && !analysis.isError && (
        <>
          <Separator />
          {analysis.isPending ? (
            <LoadingState label="正在分析周期" className="min-h-64" />
          ) : (
            <Empty className="min-h-64 py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon" aria-hidden="true">
                  <ChartLineUpIcon />
                </EmptyMedia>
                <EmptyTitle>暂无周期分析结果</EmptyTitle>
                <EmptyDescription>
                  选择统计周期并点击「分析周期」，查看交易统计与样本明细。分析完成后可使用 AI 解读。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </>
      )}
      {result && (
        <>
          {changed && (
            <p className="text-sm text-muted-foreground">
              筛选条件已修改，以下仍为上次分析结果；请重新分析以更新结果和 AI 解读。
            </p>
          )}
          <Separator />
          <JournalPeriodResult result={result} onSelect={onSelect} />
          <Separator />
          <JournalPeriodAiPanel
            run={currentRun}
            busy={aiBusy}
            error={aiError}
            onRetry={() => {
              if (aiQuery.isError) void aiQuery.refetch();
              else if (completed && canExplain) {
                setAiRunId(null);
                ai.reset();
                ai.mutate({ data: completed.data, sequence: completed.sequence });
              }
            }}
          />
        </>
      )}
    </div>
  );
}

type JournalPeriodReviewProps = {
  accountId: string;
  mode: 'actual' | 'shadow';
  onSelect: (id: string) => void;
};

function useJournalPeriodController({ accountId, mode, onSelect }: JournalPeriodReviewProps) {
  const [preset, setPreset] = useState<keyof typeof presetLabels>('7');
  const [window, setWindow] = useState(() => recentWindow(7));
  const [completed, setCompleted] = useState<{
    data: JournalPeriodReviewResponse;
    sequence: number;
  }>();
  const sequence = useRef(0);
  const client = useQueryClient();
  const toast = useToastManager();
  const api = getDesktopApiClient().journalReviews;
  const [aiRunId, setAiRunId] = useState<string | null>(null);
  const analysis = useMutation({
    mutationFn: async () => {
      const current = ++sequence.current;
      const request = journalPeriodReviewRequestSchema.safeParse({
        accountId,
        mode,
        ...window,
      });
      if (!request.success) throw new Error('请选择有效的开始和结束时间');
      journalReviewWindow(request.data);
      const data = await api.period(request.data);
      return { data, sequence: current };
    },
    onSuccess: setCompleted,
  });
  const result = completed?.data.result;
  const changed =
    result !== undefined &&
    (result.window.start !== window.start || result.window.end !== window.end);
  const ai = useMutation({
    mutationFn: async (input: { data: JournalPeriodReviewResponse; sequence: number }) => {
      const run = await api.explainPeriod(journalPeriodExplanationInput(input.data));
      if (!matchesCurrentPeriodExplanation(run, input.data))
        throw new Error('AI 解读与本次周期输入不一致');
      return { run, sequence: input.sequence };
    },
    onSuccess: ({ run, sequence: runSequence }) => {
      if (runSequence === sequence.current) setAiRunId(run.id);
    },
  });
  const aiQuery = useQuery({
    queryKey: ['journal-period-current-ai', accountId, mode, completed?.sequence, aiRunId],
    enabled: aiRunId !== null && completed !== undefined,
    queryFn: async ({ signal }) => {
      if (!aiRunId || !completed) throw new Error('本次解读任务不存在');
      const run = await api.periodExplanation(aiRunId, { accountId, mode }, signal);
      if (!matchesCurrentPeriodExplanation(run, completed.data))
        throw new Error('AI 解读与本次周期输入不一致，请重新分析');
      return run;
    },
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.status ?? '') ? 2000 : false,
    retry: false,
  });
  const currentRun = aiQuery.data ?? ai.data?.run ?? null;
  const aiBusy =
    ai.isPending ||
    (aiRunId !== null &&
      (aiQuery.isPending || ['queued', 'running'].includes(currentRun?.status ?? '')));
  const aiError = periodAiRequestError(ai, aiQuery);
  const canUseResult = periodAnalysisUsable(result, changed, analysis);
  const save = useMutation({
    mutationFn: () => {
      if (!completed || !canUseResult || aiBusy || aiQuery.isError)
        throw new Error('请等待本次分析和 AI 解读完成后再保存');
      return api.savePeriod({
        ...journalPeriodExplanationInput(completed.data),
        ...(aiRunId && currentRun?.status === 'succeeded' && currentRun.result ? { aiRunId } : {}),
      });
    },
    onSuccess: () => {
      toast.add({ title: '周期复盘快照已保存', type: 'success' });
      void client.invalidateQueries({ queryKey: ['journal-review-history', accountId, mode] });
    },
  });
  const canExplain = canUseResult && !save.isPending;
  const canSave = canUseResult && !save.isPending && !aiBusy && !aiQuery.isError;
  return {
    onSelect,
    preset,
    setPreset,
    window,
    setWindow,
    completed,
    setAiRunId,
    analysis,
    result,
    changed,
    ai,
    aiQuery,
    currentRun,
    aiBusy,
    aiError,
    save,
    canExplain,
    canSave,
  };
}

function periodAiRequestError(
  ai: { isError: boolean; error: unknown },
  query: { isError: boolean; error: unknown },
): unknown {
  if (ai.isError) return ai.error;
  if (query.isError) return query.error;
  return null;
}

function periodAnalysisUsable(
  result: JournalPeriodReviewResult | undefined,
  changed: boolean,
  analysis: { isPending: boolean; isError: boolean },
) {
  return Boolean(result) && !changed && !analysis.isPending && !analysis.isError;
}

function periodAiActionLabel(busy: boolean, hasResult: boolean) {
  if (busy) return '解读中…';
  if (hasResult) return '重新生成 AI 解读';
  return 'AI 解读';
}
