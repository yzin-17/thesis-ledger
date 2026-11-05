import { useState } from 'react';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { JournalPeriodReviewResponse } from '@thesis-ledger/schemas';
import { useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import type { ResearchStackParams } from '../../app/navigation-types';
import {
  Action,
  Copy,
  Feedback,
  Field,
  Page,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { journalWindow } from '../journal-trade/journal-model';
import { JournalMetrics } from '../journal-trade/JournalFacts';
import { JournalAiPanel } from '../journal-ai/JournalAiPanel';
const recent = (days: number) => ({
  start: new Date(Date.now() - days * 86400000).toISOString(),
  end: new Date().toISOString(),
});
export function JournalPeriodScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'JournalPeriod'>>();
  const { api } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<ResearchStackParams>>();
  const [window, setWindow] = useState(() => recent(7));
  const [symbol, setSymbol] = useState('');
  const [edited, setEdited] = useState(false);
  const [result, setResult] = useState<JournalPeriodReviewResponse>();
  const [error, setError] = useState<string | null>(null);
  useDirtyForm(edited, () => {
    setWindow(recent(7));
    setSymbol('');
    setEdited(false);
  });
  const analysis = useMobileCommand(
    async () => {
      const value = await api.journalReviews.period({
        ...params,
        ...journalWindow(window.start, window.end),
        ...(symbol.trim() ? { symbol: symbol.trim() } : {}),
      });
      setResult(value);
      setError(null);
    },
    { refresh: false },
  );
  let changed = true;
  try {
    const normalized = journalWindow(window.start, window.end);
    changed =
      !result ||
      normalized.start !== result.result.window.start ||
      normalized.end !== result.result.window.end ||
      (symbol.trim() || null) !== result.symbol;
  } catch {
    /* 无效输入保留上次结果。 */
  }
  return (
    <Page title="行为与区间复盘">
      <Action
        label="最近 7 天"
        onPress={() => {
          setWindow(recent(7));
          setEdited(true);
        }}
      />
      <Action
        label="最近 30 天"
        onPress={() => {
          setWindow(recent(30));
          setEdited(true);
        }}
      />
      <Field
        label="区间开始时间"
        value={window.start}
        onChange={(start) => {
          setWindow({ ...window, start });
          setEdited(true);
        }}
      />
      <Field
        label="区间结束时间"
        value={window.end}
        onChange={(end) => {
          setWindow({ ...window, end });
          setEdited(true);
        }}
      />
      <Field
        label="区间标的代码"
        value={symbol}
        onChange={(v) => {
          setSymbol(v);
          setEdited(true);
        }}
      />
      <Copy muted>时间须带时区。开始时刻计入，结束时刻不计入。</Copy>
      <Action
        label="分析区间"
        disabled={analysis.isPending}
        onPress={() =>
          void analysis.mutateAsync(undefined).catch((e) => setError(failureMessage(e)))
        }
      />
      <Feedback message={error} error />
      {result ? (
        <>
          <Copy>
            本次结果：[{result.result.window.start}, {result.result.window.end})
          </Copy>
          {(['tradeCycles', 'closeSlices'] as const).map((key) => (
            <Section key={key} title={key === 'tradeCycles' ? '完整交易周期' : '单次减仓'}>
              <Copy>
                观察 {result.result[key].observedSampleCount} 个，纳入{' '}
                {result.result[key].includedObjectIds.length} 个，排除{' '}
                {result.result[key].excluded.length} 个。
              </Copy>
              <JournalMetrics metrics={result.result[key].metrics} />
              {result.result[key].includedObjectIds.map((id) => (
                <Action
                  key={id}
                  label={`定位 ${id}`}
                  onPress={() =>
                    navigation.navigate('JournalObject', { ...params, reviewObjectId: id })
                  }
                />
              ))}
              {result.result[key].excluded.map((row) => (
                <Copy key={row.reviewObjectId}>
                  {row.reviewObjectId}：{row.reasons.join('；')}
                </Copy>
              ))}
            </Section>
          ))}
          {result.result.unknownTime.map((row) => (
            <Copy key={row.reviewObjectId}>
              时间未知：{row.reviewObjectId} · {row.reasons.join('；')}
            </Copy>
          ))}
          {result.result.assumptions.map((note, i) => (
            <Copy muted key={i}>
              {note}
            </Copy>
          ))}
          {changed ? <Copy>窗口已修改，保留上次结果，重新分析后才能提交对应解读。</Copy> : null}
          <JournalAiPanel
            key={JSON.stringify(result)}
            accountId={params.accountId}
            mode={params.mode}
            kind="period"
            disabled={changed || analysis.isPending}
            createRun={() =>
              api.journalReviews.explainPeriod({
                ...params,
                start: result.result.window.start,
                end: result.result.window.end,
                ...(result.symbol ? { symbol: result.symbol } : {}),
                expectedLedgerRevision: result.ledgerRevision,
                expectedProjectionGeneration: result.projectionGeneration,
                expectedAlgorithmVersion: result.result.algorithmVersion,
                objectFingerprints: Object.fromEntries(
                  result.candidates.map((c) => [
                    c.input.reference.reviewObjectId,
                    c.input.projection.evidenceFingerprint,
                  ]),
                ),
              })
            }
          />
        </>
      ) : null}
    </Page>
  );
}
