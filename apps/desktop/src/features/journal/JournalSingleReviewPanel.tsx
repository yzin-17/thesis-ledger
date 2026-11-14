import type { JournalReviewWorkspace } from './useJournalReview.js';
import { errorMessage } from './journal-review-input.js';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { TabsContent } from '@/components/ui/tabs';
import { LoaderCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

import { EvidenceEditorSheet } from './EvidenceEditorSheet.js';
import { ManualReviewForm } from './ManualReviewForm.js';
import { SingleReviewResult } from './JournalReviewResults.js';
import { ReviewCandidateList } from './ReviewCandidateList.js';

import {
  JournalReviewEmptyActions,
  JournalReviewSelectionPrompt,
} from './JournalSingleEmptyState.js';

import type { ReviewTrade } from './journal.types.js';
import { EvidenceSummary } from './JournalReviewState.js';

export function JournalSingleReviewPanel({ state }: { state: JournalReviewWorkspace }) {
  const {
    symbolFilter,
    setSymbolFilter,
    singleStartDate,
    setSingleStartDate,
    singleEndDate,
    setSingleEndDate,
    selectedCandidate,
    setSelectedCandidate,
    setManualTrade,
    evidenceDraft,
    setEvidenceDraft,
    evidenceOpen,
    setEvidenceOpen,
    manualOpen,
    setManualOpen,
    setAdvancedOpen,
    setAdvancedMode,
    setSingleResult,
    setSingleAiRun,
    candidateQuery,
    candidates,
    currentSingleTrade,
    singleWorkspaceVisible,
    selectCandidate,
  } = state;
  return (
    <TabsContent value="single" className="flex flex-col gap-4">
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
      <div
        className={cn(
          'grid min-w-0 gap-4',
          singleWorkspaceVisible && 'xl:grid-cols-[minmax(18rem,25rem)_minmax(0,1fr)]',
        )}
      >
        <ReviewCandidateList
          candidates={candidates}
          legacyItems={candidateQuery.data?.legacyItems}
          instrumentDirectory={candidateQuery.data?.instrumentDirectory}
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
          emptyActions={
            candidates.length === 0 && !candidateQuery.isPending ? (
              <JournalReviewEmptyActions
                onManualReview={() => setManualOpen(true)}
                onAdvancedJson={() => {
                  setAdvancedMode('single');
                  setAdvancedOpen(true);
                }}
              />
            ) : undefined
          }
        />
        {singleWorkspaceVisible && (
          <div className="flex min-w-0 flex-col gap-4">
            <JournalSingleSelection state={state} />
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
        )}
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
  );
}

function JournalSingleSelection({ state }: { state: JournalReviewWorkspace }) {
  const {
    selectedCandidate,
    manualOpen,
    setManualOpen,
    setAdvancedOpen,
    setAdvancedMode,
    currentSingleTrade,
  } = state;
  if (selectedCandidate && !currentSingleTrade)
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>该复盘对象的证据不足</CardTitle>
          <CardDescription>
            当前投影没有足够的确定性事实，不能把缺失字段当作零值继续计算。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            缺少：{selectedCandidate.missingEvidence.join('、') || '已实现净收益'}。
          </p>
          {selectedCandidate.excludedReasons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedCandidate.excludedReasons.map((reason) => (
                <Badge key={reason} variant="outline">
                  {reason}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  if (currentSingleTrade)
    return <JournalSingleTradeReview state={state} currentSingleTrade={currentSingleTrade} />;
  return (
    <>
      {!manualOpen && (
        <JournalReviewSelectionPrompt
          onManualReview={() => setManualOpen(true)}
          onAdvancedJson={() => {
            setAdvancedMode('single');
            setAdvancedOpen(true);
          }}
        />
      )}
    </>
  );
}

function JournalSingleTradeReview({
  state,
  currentSingleTrade,
}: {
  state: JournalReviewWorkspace;
  currentSingleTrade: ReviewTrade;
}) {
  const {
    selectedCandidate,
    evidenceDraft,
    setEvidenceOpen,
    setAdvancedOpen,
    setAdvancedMode,
    singleResult,
    singleAiRun,
    setSingleAiRun,
    candidateQuery,
    singleAnalysis,
    singleExplanation,
    persistReviewSnapshot,
    startSingleReview,
  } = state;
  return (
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
            <p className="text-sm text-muted-foreground">不会创建订单或修改账本。</p>
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
          instrumentDirectory={candidateQuery.data?.instrumentDirectory}
          aiRun={singleAiRun}
          aiPending={singleExplanation.isPending}
          aiError={
            singleExplanation.isError
              ? new Error(errorMessage(singleExplanation.error, '提供方不可用。'))
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
              .then(async (run) => {
                setSingleAiRun(run);
                await persistReviewSnapshot(currentSingleTrade, {
                  ...singleResult,
                  aiRun: run,
                });
              })
              .catch(() => undefined);
          }}
        />
      )}
    </>
  );
}
