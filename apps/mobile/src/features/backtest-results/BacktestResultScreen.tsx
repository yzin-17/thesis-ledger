import { useState } from 'react';
import { backtestMetricDisplay, backtestStageDisplay, isBacktestRunUpdateOlder } from '@thesis-ledger/domain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { resultReadEligibilitySchema, type BacktestResultV3 } from '@thesis-ledger/schemas';
import { PriceResearchResult } from './PriceResearchResult';
import { BacktestDailyOrders } from './BacktestDailyOrders';
import { BacktestRuleObservations } from './BacktestRuleObservations';
import { confirmAction, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { MobileChart } from '../../platform/charts/MobileChart';
import { exportCsv } from '../../platform/output/export-file';
import {
  backtestActionRecovered,
  backtestActionControls,
  backtestStatusLabels,
  isBacktestActive,
  parseBacktestAction,
  type MobileBacktestRun,
  type PendingBacktestAction,
} from '../backtest-jobs/backtest-state';
import { mobileEquityChart, mobileEquityCsv } from './backtest-equity';
function useBacktestResultController() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'BacktestResult'>>();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const { api, scope, baseUrl } = useMobileRuntime();
  const client = useQueryClient();
  const runs = api.backtests;
  const [message, setMessage] = useState<string | null>(null);
  const [evidence, setEvidence] = useState(false);
  const [range, setRange] = useState<'all' | 'month' | 'quarter'>('all');
  const key = JSON.stringify(['mobile-backtest-action-v1', baseUrl, params.kind, params.id]);
  const read = (): Promise<MobileBacktestRun> =>
    params.kind === 'ordinary' ? runs.getRun(params.id) : runs.getNavRun(params.id);
  const query = useQuery<MobileBacktestRun>({
    queryKey: [...scope, 'backtest-run', params.kind, params.id],
    queryFn: ({ signal }) =>
      params.kind === 'ordinary'
        ? runs.getRun(params.id, signal)
        : runs.getNavRun(params.id, signal),
    retry: false,
    structuralSharing: (before, after) => isBacktestRunUpdateOlder(before, after) ? before : after,
    refetchInterval: (q) => (q.state.data && isBacktestActive(q.state.data.status) ? 2000 : false),
  });
  const pending = useQuery({
    queryKey: [...scope, 'backtest-action-pending', params.kind, params.id],
    queryFn: async (): Promise<PendingBacktestAction | null> => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const body = parseBacktestAction(JSON.parse(raw));
      if (body.id !== params.id || body.kind !== params.kind) throw Error('原操作范围不一致。');
      return body;
    },
    retry: false,
  });
  const command = useMobileCommand(
    async (action: 'cancel' | 'retry' | 'recover') => {
      const current = await read();
      let body = pending.data;
      if (!body) {
        if (action === 'recover') throw Error('没有待确认操作。');
        if (
          action === 'retry' &&
          (!['failed', 'succeeded'].includes(current.status) || current.executionAttempt === undefined)
        )
          throw Error('仅可对轮次明确的失败或已完成Run使用冻结输入重试。');
        if (action === 'cancel' && !isBacktestActive(current.status))
          throw Error('当前 Run 已终止，请重新读取。');
        if (
          !(await confirmAction(
            action === 'retry' ? '重试当前 Run？' : '取消当前 Run？',
            `Run ${params.id}；原冻结快照会保留。`,
          ))
        )
          return;
        body = {
          id: params.id,
          kind: params.kind,
          action,
          expectedAttempt: current.executionAttempt ?? null,
          expectedStatus: current.status,
        };
        await AsyncStorage.setItem(key, JSON.stringify(body));
        await pending.refetch();
      }
      if (backtestActionRecovered(body, current))
        setMessage('已从原 Run 找回操作进展，不会重复投递。');
      else if (action === 'recover') {
        throw Error('原操作尚未确认，可显式原样重试；查询失败不会补投。');
      } else {
        if (body.action === 'retry' && !['failed', 'succeeded'].includes(current.status))
          throw Error('当前状态不能重试，请读取原 Run。');
        await client.cancelQueries({ queryKey: [...scope, 'backtest-run', params.kind, params.id] });
        let receipt: MobileBacktestRun;
        if (params.kind === 'ordinary') {
          if (body.action === 'retry') receipt = await runs.retryRun(params.id);
          else receipt = await runs.cancelRun(params.id);
        } else if (body.action === 'retry') receipt = await runs.retryNavRun(params.id);
        else receipt = await runs.cancelNavRun(params.id);
        client.setQueryData([...scope, 'backtest-run', params.kind, receipt.id], receipt);
        if (receipt.id !== params.id) {
          await AsyncStorage.removeItem(key);
          navigation.replace('BacktestResult', { id: receipt.id, kind: params.kind });
          return;
        }
        setMessage('请求已确认，终态以重新读取结果为准。');
      }
      await AsyncStorage.removeItem(key);
      await pending.refetch();
      await query.refetch();
    },
    { refresh: false },
  );
  const execute = (action: 'cancel' | 'retry' | 'recover') =>
    void command.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  const run = query.data;
  const eligibility =
    run && 'readEligibility' in run
      ? resultReadEligibilitySchema.safeParse(run.readEligibility)
      : null;
  const readable =
    params.kind === 'nav' || (eligibility?.success && eligibility.data.state === 'readable');
  const result = run?.status === 'succeeded' && readable ? run.result : null;
  const timezone = run?.runConfig?.valuationPolicy.baseTimezone ?? 'UTC';
  const currency =
    run?.runConfig?.baseCurrency ?? result?.equityCurve[0]?.value.currency ?? '币种未记录';
  const exportCommand = useMobileCommand(
    async () => {
      if (!result || query.isError) throw Error('结果尚未核对或受读取限制，不能导出。');
      await exportCsv(
        `backtest-${params.id.replace(/[^a-zA-Z0-9-]/g, '_')}.csv`,
        mobileEquityCsv(result, timezone, currency, range),
      );
    },
    { refresh: false },
  );
  const controls = backtestActionControls(run, {busy:command.isPending,readFailed:query.isError,
    pending:Boolean(pending.data),pendingKnown:pending.isSuccess,reading:query.isFetching});
  return {
    openRun: (id: string) => navigation.navigate('BacktestResult', { id, kind: params.kind }),
    controls,
    params,
    query,
    pending,
    run,
    command,
    execute,
    readable,
    result,
    currency,
    timezone,
    range,
    setRange,
    exportCommand,
    setMessage,
    evidence,
    setEvidence,
    message,
  };
}
export function BacktestResultScreen() {
  const state = useBacktestResultController();
  const {
    controls,
    params,
    query,
    pending,
    run,
    command,
    execute,
    readable,
    result,

    exportCommand,

    evidence,
    setEvidence,
    message,
  } = state;
  return (
    <Page title={params.kind === 'ordinary' ? '普通回测结果' : '净值回测结果'}>
      <QueryStatus query={query} retry={() => void query.refetch()} />
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      {run ? (
        <>
          <Section title={run.cancelRequestedAt && isBacktestActive(run.status) ? '正在取消' : backtestStatusLabels[run.status]}>
            <Copy>Run {run.id}</Copy>
            <Copy>策略版本 {run.strategyVersionId}</Copy>
            <Copy>
              进度{' '}
              {run.progress === undefined || run.progress === null ? '未记录' : `${run.progress}%`}{' '}
              · 执行轮次 {run.executionAttempt ?? '未记录'}
            </Copy>
            <Copy>冻结快照 {run.snapshotId ?? '尚未生成'}</Copy>
            <Copy>{backtestStageDisplay(run.stage)}</Copy>
            {run.replayOfRunId ? <Copy>冻结输入原Run：{run.replayOfRunId}</Copy> : null}
            {run.replayOfRunId ? <Action label="查看原冻结输入Run" onPress={() => state.openRun(run.replayOfRunId!)} /> : null}
            {run.errorCode ? (
              <Copy>
                {run.errorCode}：{run.errorSummary ?? '请查看运行诊断'}
              </Copy>
            ) : null}
          </Section>
          {pending.data ? (
            <Section title="原操作待确认">
              <Copy>
                {pending.data.action === 'retry' ? '重试' : '取消'} · 原轮次{' '}
                {pending.data.expectedAttempt ?? '未记录'}
              </Copy>
              <Action
                label="读取原 Run 找回操作"
                disabled={command.isPending}
                onPress={() => execute('recover')}
              />
              <Action
                label="原样重试当前操作"
                disabled={command.isPending}
                onPress={() => execute(pending.data!.action)}
              />
            </Section>
          ) : null}
          <Action
            label="取消当前回测"
            disabled={!controls.cancel}
            onPress={() => execute('cancel')}
          />
          <Action
            label="使用冻结输入重试"
            disabled={!controls.retry}
            onPress={() => execute('retry')}
          />
          {run.status === 'succeeded' && !readable ? (
            <Copy>当前结果读取受限或授权未记录，请重新核对；不会揭示封存指标。</Copy>
          ) : null}
          {result ? <BacktestEconomicResult result={result} state={state} /> : null}
          <Action
            label={evidence ? '收起冻结来源与证据' : '展开冻结来源与证据'}
            onPress={() => setEvidence((v) => !v)}
          />
          {evidence ? (
            <Section title="冻结输入、来源与结果证据">
              <Copy>
                {JSON.stringify(
                  {
                    id: run.id,
                    strategyVersionId: run.strategyVersionId,
                    snapshotId: run.snapshotId,
                    runConfig: run.runConfig,
                    snapshotManifest: run.snapshotManifest,
                    result: readable ? run.result : null,
                  },
                  null,
                  2,
                )}
              </Copy>
            </Section>
          ) : null}
        </>
      ) : null}
      <Feedback busy={command.isPending || exportCommand.isPending} message={message} error={command.isError || exportCommand.isError} />
    </Page>
  );
}

function BacktestEconomicResult({
  result,
  state,
}: {
  result: NonNullable<MobileBacktestRun['result']>;
  state: ReturnType<typeof useBacktestResultController>;
}) {
  const { currency, timezone, range, setRange, exportCommand, setMessage, query } = state;
  const research = 'priceResearch' in result ? result.priceResearch : undefined;
  return (
    <>
      <Copy>
        {result.completeness === 'complete' ? '结果完整' : '结果存在限制'} · 币种 {currency} · 时区{' '}
        {timezone}
      </Copy>
      {result.warnings.map((v, i) => (
        <Copy key={i}>{v}</Copy>
      ))}
      {research && <PriceResearchResult result={result as BacktestResultV3} currency={currency} />}
      <BacktestDailyOrders key={state.params.id} value={'dailyOrders' in result ? result.dailyOrders : undefined} unit={research ? '研究单位' : '实际股／份'} />
      <Choices
        label="权益曲线范围"
        value={range}
        onChange={setRange}
        options={[
          { value: 'all', label: '全部' },
          { value: 'month', label: '近一月' },
          { value: 'quarter', label: '近三月' },
        ]}
      />
      <MobileChart data={mobileEquityChart(result, range)} />
      <Copy muted>
        图表最多显示末尾 3000 点。CSV 保留所选日期范围的全部原始金额；未返回的分项留空。
      </Copy>
      <Section title="回测指标">
        {Object.entries(result.metrics).map(([name, metric]) => (
          <Copy key={name}>
            {backtestMetricDisplay(name, metric, currency).label}：{backtestMetricDisplay(name, metric, currency).value}
          </Copy>
        ))}
      </Section>
      <BacktestRuleObservations value={'ruleDiagnostics' in result ? result.ruleDiagnostics : undefined} />
      <Action
        label="导出权益 CSV"
        disabled={exportCommand.isPending || query.isError}
        onPress={() =>
          void exportCommand.mutateAsync(undefined).catch((e) => setMessage(failureMessage(e)))
        }
      />
    </>
  );
}
