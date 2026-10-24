import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { JournalReviewAnalysisResponse } from '@thesis-ledger/schemas';
import { useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import type { ResearchStackParams, RootTabParams } from '../../app/navigation-types';
import {
  Action,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  failureMessage,
} from '../../components/MobilePrimitives';
import {
  emptyJournalDraft,
  journalObjectRequest,
  journalResultChanged,
  parseJournalDraft,
} from './journal-model';
import { JournalFacts, JournalResult } from './JournalFacts';
import { JournalSourceFacts } from './JournalSourceFacts';
import { JournalAiPanel } from '../journal-ai/JournalAiPanel';
export function JournalObjectScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'JournalObject'>>();
  const { api, scope, mode, transition } = useMobileRuntime();
  const client = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<ResearchStackParams>>();
  const [draft, setDraft] = useState(emptyJournalDraft);
  const [result, setResult] = useState<{
    data: JournalReviewAnalysisResponse;
    fingerprint: string;
    draft: string;
  }>();
  const [message, setMessage] = useState<string | null>(null);
  const [aiRunId, setAiRunId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [...scope, 'journal-object', params],
    enabled: mode === params.mode,
    queryFn: ({ signal }) => api.journalReviews.object(params, signal),
    retry: false,
  });
  useDirtyForm(JSON.stringify(draft) !== JSON.stringify(emptyJournalDraft()), () =>
    setDraft(emptyJournalDraft()),
  );
  const analysis = useMobileCommand(
    async () => {
      if (!query.data || query.isError) throw new Error('请先重新读取当前事实。');
      const data = await api.journalReviews.analyze(
        journalObjectRequest(query.data, parseJournalDraft(draft)),
      );
      setResult({
        data,
        fingerprint: data.candidate.input.projection.evidenceFingerprint,
        draft: JSON.stringify(draft),
      });
      setAiRunId(null);
      setMessage(null);
    },
    { refresh: false },
  );
  const changed = journalResultChanged(result, query.data, draft);
  const save = useMobileCommand(
    async () => {
      if (!result || changed || query.isError) throw new Error('事实或草稿已变化，请重新分析。');
      const value = await api.journalReviews.save({
        ...journalObjectRequest(
          result.data.candidate,
          result.data.candidate.input.analysisDraft ?? {},
        ),
        expectedAlgorithmVersion: result.data.result.algorithmVersion,
        ...(aiRunId ? { aiRunId } : {}),
      });
      setMessage('复盘快照已保存，历史输入与结果保持不变。');
      void client.invalidateQueries({ queryKey: [...scope, 'journal-history'] });
      void client.invalidateQueries({ queryKey: [...scope, 'journal-candidates'] });
      return value;
    },
    { refresh: false },
  );
  const busy = analysis.isPending || save.isPending;
  const execute = (operation: () => Promise<unknown>) =>
    void operation().catch((e) => setMessage(failureMessage(e)));
  return (
    <Page title="单笔复盘">
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {query.data ? <JournalFacts candidate={query.data} /> : null}
      {query.data ? (
        <Action
          label="定位原始交易"
          onPress={() =>
            void transition(() =>
              navigation
                .getParent<BottomTabNavigationProp<RootTabParams>>()
                ?.navigate('Portfolio', {
                  screen: 'TradeDetail',
                  params: {
                    accountId: params.accountId,
                    mode,
                    tradeId: query.data.input.reference.tradeId,
                    ...(query.data.input.reference.reviewObjectType === 'CLOSE_SLICE'
                      ? { closeSliceId: query.data.input.reference.closeSliceId }
                      : {}),
                  },
                }),
            )
          }
        />
      ) : null}
      <Field
        label="计划入场价"
        value={draft.plannedEntry}
        editable={!busy}
        onChange={(v) => setDraft({ ...draft, plannedEntry: v })}
      />
      <Field
        label="计划离场价"
        value={draft.plannedExit}
        editable={!busy}
        onChange={(v) => setDraft({ ...draft, plannedExit: v })}
      />
      <Field
        label="计划止损价"
        value={draft.stopLoss}
        editable={!busy}
        onChange={(v) => setDraft({ ...draft, stopLoss: v })}
      />
      <Field
        label="预期持有天数"
        value={draft.expectedHoldingDays}
        editable={!busy}
        keyboardType="number-pad"
        onChange={(v) => setDraft({ ...draft, expectedHoldingDays: v })}
      />
      <Field
        label="本次复盘备注"
        value={draft.note}
        editable={!busy}
        multiline
        onChange={(v) => setDraft({ ...draft, note: v })}
      />
      <Action
        label="开始复盘"
        disabled={busy || !query.data || query.isError}
        onPress={() => execute(() => analysis.mutateAsync(undefined))}
      />
      <Action
        label="保存复盘快照"
        disabled={busy || !result || changed || query.isError}
        onPress={() => execute(() => save.mutateAsync(undefined))}
      />
      <Feedback message={message} error={analysis.isError || save.isError} />
      {changed ? <Copy>事实或草稿已修改，下方保留上次结果，请重新分析后保存。</Copy> : null}
      {result ? (
        <>
          <JournalResult result={result.data.result} />
          <JournalAiPanel
            key={result.fingerprint + result.draft}
            accountId={params.accountId}
            mode={params.mode}
            kind="object"
            disabled={busy || changed || query.isError}
            createRun={() =>
              api.journalReviews.explain({
                ...journalObjectRequest(
                  result.data.candidate,
                  result.data.candidate.input.analysisDraft ?? {},
                ),
                expectedAlgorithmVersion: result.data.result.algorithmVersion,
              })
            }
            onSelected={setAiRunId}
          />
        </>
      ) : null}
      <Action
        label="查看历史快照"
        onPress={() =>
          navigation.navigate('JournalHistory', {
            accountId: params.accountId,
            mode,
            reviewObjectId: params.reviewObjectId,
          })
        }
      />
      {query.data ? <JournalSourceFacts input={query.data.input} /> : null}
    </Page>
  );
}
