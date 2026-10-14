import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JournalAnalysisDraft, JournalReviewCandidateContract } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalFactSummary } from './JournalFactSummary.js';
import { JournalDraftSheet } from './JournalDraftSheet.js';
import { JournalDecimalResult } from './JournalMetricTable.js';
import { JournalRequestError } from './JournalReviewFeedback.js';
import { JournalAiExplanation } from './JournalAiExplanation.js';
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

export function JournalObjectReview({
  accountId,
  mode,
  reviewObjectId,
  onHistory,
}: {
  accountId: string;
  mode: 'actual' | 'shadow';
  reviewObjectId: string;
  onHistory: () => void;
}) {
  const queryClient = useQueryClient();
  const api = getDesktopApiClient().journalReviews;
  const [draft, setDraft] = useState<JournalAnalysisDraft>({});
  const [draftVersion, setDraftVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [aiRunId, setAiRunId] = useState<string | null>(null);
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
    onSuccess: setResult,
  });
  const save = useMutation({
    mutationFn: () => {
      if (!result) throw new Error('请先完成确定性分析');
      return api.save({
        ...request(result.candidate, result.candidate.input.analysisDraft ?? {}),
        expectedAlgorithmVersion: result.result.algorithmVersion,
        ...(aiRunId ? { aiRunId } : {}),
      });
    },
    onSuccess: () => {
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
  const busy = analysis.isPending || save.isPending;
  if (object.isPending) return <Skeleton className="h-48 w-full" />;
  if (object.isError)
    return (
      <JournalRequestError
        title="对象读取失败"
        error={object.error}
        retry={() => void object.refetch()}
      />
    );
  const candidate = object.data;
  return (
    <div className="flex flex-col gap-4">
      <JournalFactSummary candidate={candidate} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => setOpen(true)}>
          核对与补充本次草稿
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            save.reset();
            setAiRunId(null);
            sequence.current += 1;
            analysis.mutate({
              candidate,
              draft,
              version: draftVersion,
              sequence: sequence.current,
            });
          }}
        >
          {analysis.isPending ? '分析中…' : '开始复盘'}
        </Button>
        <Button
          variant="outline"
          disabled={busy || !result || changed}
          onClick={() => save.mutate()}
        >
          {save.isPending ? '保存中…' : '保存复盘快照'}
        </Button>
        <Button variant="ghost" onClick={onHistory}>
          查看历史快照
        </Button>
      </div>
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
      {save.isSuccess && (
        <Alert>
          <AlertTitle>复盘快照已保存</AlertTitle>
          <AlertDescription>原始事实、草稿与计算结果已保留，可在历史快照中读取。</AlertDescription>
        </Alert>
      )}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>确定性复盘结果</CardTitle>
            <CardDescription>计划、实际、偏差与反事实分别呈现。AI 解读单独运行。</CardDescription>
          </CardHeader>
          <CardContent>
            <JournalDecimalResult result={result.result} />
          </CardContent>
        </Card>
      )}
      {result && (
        <JournalAiExplanation
          key={result.sequence}
          request={{
            ...request(result.candidate, result.candidate.input.analysisDraft ?? {}),
            expectedAlgorithmVersion: result.result.algorithmVersion,
          }}
          disabled={busy || changed}
          onRunSelected={(id) => {
            if (sequence.current === result.sequence) setAiRunId(id);
          }}
        />
      )}
      {open && (
        <JournalDraftSheet
          candidate={candidate}
          value={draft}
          open={open}
          onOpenChange={setOpen}
          onApply={(next) => {
            setDraft(next);
            setDraftVersion((value) => value + 1);
            save.reset();
          }}
        />
      )}
    </div>
  );
}
