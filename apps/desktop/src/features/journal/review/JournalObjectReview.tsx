import { useEffect, useRef, useState } from 'react';
import { isEqual } from 'es-toolkit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JournalAnalysisDraft, JournalReviewCandidateContract } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalFactSummary } from './JournalFactSummary.js';
import { JournalDraftSheet } from './JournalDraftSheet.js';
import { JournalDecimalResult } from './JournalMetricTable.js';
import { JournalRequestError } from './JournalReviewFeedback.js';
import { JournalAiExplanation } from './JournalAiExplanation.js';
import { Separator } from '@/components/ui/separator';
import { useToastManager } from '@/components/ui/toast';
import type { JournalReviewAnalysisResponse } from '@thesis-ledger/schemas';

function resultChanges(
  result: (JournalReviewAnalysisResponse & { draftVersion: number }) | undefined,
  candidate: JournalReviewCandidateContract | undefined,
  draftVersion: number,
) {
  const changedFacts =
    result !== undefined &&
    candidate !== undefined &&
    result.candidate.input.projection.evidenceFingerprint !==
      candidate.input.projection.evidenceFingerprint;
  const changedDraft = result !== undefined && result.draftVersion !== draftVersion;
  return { changedFacts, changed: changedFacts || changedDraft };
}

export function JournalObjectReview(props: {
  accountId: string;
  mode: 'actual' | 'shadow';
  reviewObjectId: string;
  onHistory: () => void;
  focusRequest?: number;
  onReturnToCandidates?: () => void;
  instrumentLabel?: string | undefined;
}) {
  const control = useJournalObjectReview(props);
  const {
    reviewRegion,
    onReturnToCandidates,
    object,
    save,
    busy,
    analysis,
    setAiRunId,
    setAiPhase,
    sequence,
    result,
    isCurrentResult,
    changed,
    aiPhase,
    changedFacts,
    request,
  } = control;
  if (object.isPending) return <LoadingState label="正在读取复盘对象" />;
  if (!object.data)
    return (
      <JournalRequestError
        title="对象读取失败"
        error={object.error}
        retry={() => void object.refetch()}
      />
    );
  const candidate = object.data;
  return (
    <section
      ref={reviewRegion}
      tabIndex={-1}
      aria-label="当前复盘对象"
      className="flex min-w-0 scroll-mt-4 flex-col gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
    >
      {onReturnToCandidates && (
        <Button variant="ghost" size="sm" className="self-start" onClick={onReturnToCandidates}>
          返回对象列表
        </Button>
      )}
      {object.isError && (
        <JournalRequestError
          title={save.isSuccess ? '快照已保存，当前对象暂未更新' : '当前对象暂未更新'}
          error={object.error}
          retry={() => void object.refetch()}
        />
      )}
      <JournalObjectFacts
        control={control}
        candidate={candidate}
        instrumentLabel={props.instrumentLabel}
      />
      {analysis.isError && <JournalRequestError title="分析未完成" error={analysis.error} />}
      {changed && (
        <Alert>
          <AlertTitle>需要重新分析</AlertTitle>
          <AlertDescription>
            {changedFacts
              ? '当前事实已变化。下方保留上次分析结果，重新读取并分析后才能保存。'
              : '本次草稿已修改。下方保留上次分析结果，重新分析后才能保存。'}
          </AlertDescription>
        </Alert>
      )}
      {save.isError && <JournalRequestError title="快照未保存" error={save.error} />}
      {result && (
        <section className="flex min-w-0 flex-col gap-4 pt-2" aria-label="确定性复盘结果">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-semibold">确定性复盘结果</h3>
          </div>
          <JournalDecimalResult result={result.result} />
        </section>
      )}
      {result && isCurrentResult && (
        <section className="flex min-w-0 flex-col gap-4 pt-2" aria-label="本次 AI 解读">
          <Separator />
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-semibold">AI 解读</h3>
            <p className="text-sm text-muted-foreground">
              本次重新生成的解读，只有保存复盘快照后才会正式关联保存。
            </p>
          </div>
          <JournalAiExplanation
            key={result.sequence}
            request={{
              ...request(result.candidate, result.candidate.input.analysisDraft ?? {}),
              expectedAlgorithmVersion: result.result.algorithmVersion,
            }}
            disabled={busy || changed}
            embedded
            autoStart
            onRunStatusChange={(status) => {
              if (sequence.current === result.sequence) setAiPhase(status);
            }}
            onRunSelected={(id) => {
              if (sequence.current === result.sequence) setAiRunId(id);
            }}
          />
        </section>
      )}
      {result && isCurrentResult && aiPhase === 'failed' && (
        <p className="text-sm text-muted-foreground">
          本次 AI 解读未完成，仍可单独保存确定性复盘结果，快照不会关联失败的 AI 任务。
        </p>
      )}
    </section>
  );
}

function useJournalObjectReview({
  accountId,
  mode,
  reviewObjectId,
  onHistory,
  focusRequest = 0,
  onReturnToCandidates,
}: {
  accountId: string;
  mode: 'actual' | 'shadow';
  reviewObjectId: string;
  onHistory: () => void;
  focusRequest?: number;
  onReturnToCandidates?: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToastManager();
  const api = getDesktopApiClient().journalReviews;
  const [draft, setDraft] = useState<JournalAnalysisDraft>({});
  const [draftVersion, setDraftVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const previouslyEditing = useRef(false);
  useEffect(() => {
    if (previouslyEditing.current && !open) editTriggerRef.current?.focus();
    previouslyEditing.current = open;
  }, [open]);
  const [aiRunId, setAiRunId] = useState<string | null>(null);
  const [aiPhase, setAiPhase] = useState<'idle' | 'running' | 'succeeded' | 'failed'>('idle');
  const [result, setResult] = useState<
    JournalReviewAnalysisResponse & { draftVersion: number; sequence: number }
  >();
  const sequence = useRef(0);
  const object = useQuery({
    queryKey: ['journal-review-object', accountId, mode, reviewObjectId],
    queryFn: ({ signal }) => api.object({ accountId, mode, reviewObjectId }, signal),
    retry: false,
  });
  const request = (
    candidate: JournalReviewCandidateContract,
    analysisDraft: JournalAnalysisDraft,
  ) => ({
    accountId,
    mode,
    reference: candidate.input.reference,
    evidenceFingerprint: candidate.input.projection.evidenceFingerprint,
    analysisDraft,
  });
  const analysis = useMutation({
    mutationFn: async (input: {
      candidate: JournalReviewCandidateContract;
      draft: JournalAnalysisDraft;
      version: number;
      sequence: number;
    }) => ({
      ...(await api.analyze(request(input.candidate, input.draft))),
      draftVersion: input.version,
      sequence: input.sequence,
    }),
    onSuccess: (completed) => {
      if (completed.sequence === sequence.current) setResult(completed);
    },
    onError: (_error, input) => {
      if (input.sequence === sequence.current) setAiPhase('failed');
    },
  });
  const save = useMutation({
    mutationFn: () => {
      if (!result || result.sequence !== sequence.current || aiPhase === 'running') {
        throw new Error('请等待本次复盘与 AI 解读完成后再保存');
      }
      return api.save({
        ...request(result.candidate, result.candidate.input.analysisDraft ?? {}),
        expectedAlgorithmVersion: result.result.algorithmVersion,
        ...(aiPhase === 'succeeded' && aiRunId ? { aiRunId } : {}),
      });
    },
    onSuccess: () => {
      toast.add({
        title: '复盘快照已保存',
        description: '原始事实、草稿与计算结果已保留，可在历史快照中读取。',
        type: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: ['journal-review-history', accountId, mode] });
      void queryClient.invalidateQueries({
        queryKey: ['journal-review-candidates', accountId, mode],
      });
      void queryClient.invalidateQueries({
        queryKey: ['journal-review-object', accountId, mode, reviewObjectId],
        exact: true,
      });
    },
  });
  const { changedFacts, changed } = resultChanges(result, object.data, draftVersion);
  const isCurrentResult = result !== undefined && result.sequence === sequence.current;
  const reviewRegion = useRef<HTMLElement>(null);
  const hasCandidate = Boolean(object.data);
  useEffect(() => {
    if (!focusRequest || !hasCandidate) return;
    reviewRegion.current?.focus({ preventScroll: true });
    reviewRegion.current?.scrollIntoView?.({ block: 'start' });
  }, [focusRequest, hasCandidate]);
  const busy = analysis.isPending || save.isPending || object.isError;

  return {
    reviewRegion,
    onReturnToCandidates,
    object,
    save,
    open,
    editTriggerRef,
    busy,
    setOpen,
    analysis,
    setAiRunId,
    setAiPhase,
    sequence,
    draft,
    draftVersion,
    result,
    isCurrentResult,
    changed,
    aiPhase,
    onHistory,
    setDraft,
    setDraftVersion,
    changedFacts,
    request,
  };
}

function JournalObjectFacts({
  control,
  candidate,
  instrumentLabel,
}: {
  control: ReturnType<typeof useJournalObjectReview>;
  candidate: JournalReviewCandidateContract;
  instrumentLabel?: string | undefined;
}) {
  return (
    <>
      <JournalFactSummary
        candidate={candidate}
        compact={Boolean(control.result)}
        instrumentLabel={instrumentLabel}
        actions={
          !control.open && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                ref={control.editTriggerRef}
                variant="outline"
                disabled={control.busy}
                onClick={() => control.setOpen(true)}
              >
                补充计划与假设
              </Button>
              <Button
                aria-busy={control.analysis.isPending}
                disabled={control.busy}
                onClick={() => {
                  control.save.reset();
                  control.setAiRunId(null);
                  control.setAiPhase('running');
                  control.sequence.current += 1;
                  control.analysis.mutate({
                    candidate,
                    draft: control.draft,
                    version: control.draftVersion,
                    sequence: control.sequence.current,
                  });
                }}
              >
                {control.analysis.isPending && (
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                )}
                {control.analysis.isPending ? '分析中…' : '开始复盘'}
              </Button>
              <Button
                aria-busy={control.save.isPending}
                variant="outline"
                disabled={
                  control.busy ||
                  !control.result ||
                  !control.isCurrentResult ||
                  control.changed ||
                  control.aiPhase === 'running' ||
                  control.analysis.isError
                }
                onClick={() => control.save.mutate()}
              >
                {control.save.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
                {control.save.isPending ? '保存中…' : '保存复盘快照'}
              </Button>
              <Button variant="outline" onClick={control.onHistory}>
                查看历史快照
              </Button>
            </div>
          )
        }
        editor={
          control.open && (
            <JournalDraftSheet
              inline
              candidate={candidate}
              value={control.draft}
              open={control.open}
              onOpenChange={control.setOpen}
              onApply={(next) => {
                if (!isEqual(next, control.draft)) {
                  control.setDraft(next);
                  control.setDraftVersion((value) => value + 1);
                  control.save.reset();
                }
              }}
            />
          )
        }
      />
    </>
  );
}
