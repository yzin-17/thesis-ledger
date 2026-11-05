import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type {
  BacktestNavPreparationRequestV3,
  BacktestNavPreparationResultV3,
  BacktestRunPreparationRequestV3,
  BacktestRunPreparationResultV3,
} from '@thesis-ledger/schemas';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import {
  Action,
  Copy,
  Feedback,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { useStrategyLibrary } from '../strategy-library/useStrategyLibrary';
import {
  newBacktestForm,
  ordinaryPreparationIntent,
  navPreparationIntent,
  type BacktestForm,
} from './backtest-intent';
import {
  freezeNavSubmission,
  freezeOrdinarySubmission,
  parsePendingBacktest,
  type PendingBacktest,
} from './backtest-submission';
import { BacktestInputFields } from './BacktestInputFields';
import { BacktestPreparationEvidence } from './BacktestPreparationEvidence';
type Intent =
  | { kind: 'ordinary'; body: BacktestRunPreparationRequestV3; signature: string }
  | { kind: 'nav'; body: BacktestNavPreparationRequestV3; signature: string };
type Prepared = BacktestRunPreparationResultV3 | BacktestNavPreparationResultV3;
function useBacktestSetupController() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'BacktestSetup'>>();
  const { api, scope, baseUrl } = useMobileRuntime();
  const library = useStrategyLibrary();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const version = library.data
    ?.find((v) => v.id === params.strategyId)
    ?.versions.find((v) => v.id === params.versionId);
  const instrument = version?.schema?.executionInstrument as { symbol?: string } | undefined;
  const key = JSON.stringify(['mobile-backtest-submit-v1', baseUrl, params.kind, params.versionId]);
  const pendingQuery = useQuery({
    queryKey: [...scope, 'backtest-pending', key],
    queryFn: async (): Promise<PendingBacktest | null> => {
      const raw = await AsyncStorage.getItem(key);
      return raw ? parsePendingBacktest(JSON.parse(raw)) : null;
    },
    retry: false,
  });
  const [form, setForm] = useState<BacktestForm>(() => newBacktestForm(instrument?.symbol ?? ''));
  const [edited, setEdited] = useState(false);
  const [submitted, setSubmitted] = useState<Intent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const signature = JSON.stringify(form);
  useDirtyForm(edited, () => {
    setEdited(false);
    setSubmitted(null);
  });
  const preparation = useQuery<Prepared>({
    queryKey: [...scope, 'backtest-preparation', params.kind, params.versionId, submitted],
    enabled: !!submitted && submitted.signature === signature,
    queryFn: ({ signal }) => {
      if (!submitted) throw Error('尚未提交准备。');
      if (submitted.kind === 'ordinary')
        return api.backtests.prepareCheckedRunConfig(submitted.body, signal);
      return api.backtests.prepareNavRunConfig(submitted.body, signal);
    },
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === 'preparing' ? 2000 : false),
  });
  const current = submitted?.signature === signature ? preparation.data : undefined;
  const command = useMobileCommand(
    async () => {
      let pending = pendingQuery.data;
      if (!pending) {
        if (!current || current.status !== 'prepared' || preparation.isError || !version)
          throw Error('请重新准备当前版本与输入，阻断时不会创建 Run。');
        if (
          !(await confirmAction(
            '确认创建回测？',
            '请核对准备结果、冻结来源与研究假设。本次会创建后台任务。',
          ))
        )
          return;
        pending =
          params.kind === 'ordinary'
            ? freezeOrdinarySubmission(
                params.versionId,
                current as BacktestRunPreparationResultV3,
                randomUUID(),
              )
            : freezeNavSubmission(
                params.versionId,
                current as BacktestNavPreparationResultV3,
                randomUUID(),
              );
        await AsyncStorage.setItem(key, JSON.stringify(pending));
        await pendingQuery.refetch();
      }
      if (pending.kind !== params.kind) throw Error('原提交类别不一致。');
      const run =
        pending.kind === 'ordinary'
          ? await api.backtests.createRun(pending.body)
          : await api.backtests.createNavRun(pending.body);
      setReceipt(run.id);
      await AsyncStorage.removeItem(key);
      await pendingQuery.refetch();
      setEdited(false);
      setSubmitted(null);
      setMessage('服务端已确认 Run，可查看任务与结果。');
    },
    { refresh: false },
  );
  const prepare = () => {
    try {
      if (!version) throw Error('当前版本不可读，请重新选择。');
      const input = { ...form, symbol: instrument?.symbol ?? form.symbol };
      const body =
        params.kind === 'ordinary'
          ? ordinaryPreparationIntent(
              input,
              params.versionId,
              randomUUID(),
              new Date().toISOString(),
            )
          : navPreparationIntent(input, params.versionId, randomUUID(), new Date().toISOString());
      setSubmitted({ kind: params.kind, body, signature } as Intent);
      setMessage(null);
    } catch (e) {
      setMessage(failureMessage(e));
    }
  };
  const locked = command.isPending || !!pendingQuery.data || !!receipt;
  return {
    params,
    library,
    pendingQuery,
    form,
    instrument,
    locked,
    setForm,
    setEdited,
    setSubmitted,
    version,
    preparation,
    prepare,
    submitted,
    current,
    command,
    receipt,
    setMessage,
    message,
    navigation,
  };
}
export function BacktestSetupScreen() {
  const state = useBacktestSetupController();
  const {
    params,
    library,
    pendingQuery,
    form,
    instrument,
    locked,
    setForm,
    setEdited,
    setSubmitted,
    version,
    preparation,
    prepare,
    submitted,
    current,
    command,
    receipt,
    setMessage,
    message,
    navigation,
  } = state;
  return (
    <Page title={params.kind === 'ordinary' ? '准备普通回测' : '准备净值回测'}>
      <Copy>策略版本 {params.versionId}</Copy>
      <QueryStatus query={library} retry={() => void library.refetch()} />
      <QueryStatus query={pendingQuery} retry={() => void pendingQuery.refetch()} />
      <BacktestInputFields
        kind={params.kind}
        value={{ ...form, symbol: instrument?.symbol ?? form.symbol }}
        disabled={locked}
        onChange={(next) => {
          setForm(next);
          setEdited(true);
          setSubmitted(null);
        }}
      />
      <Action
        label="准备并预检回测配置"
        disabled={locked || !version || !pendingQuery.isSuccess || preparation.isFetching}
        onPress={prepare}
      />
      {submitted ? (
        <QueryStatus query={preparation} retry={() => void preparation.refetch()} />
      ) : null}
      {current ? (
        <Section
          title={
            ({ prepared: '准备已通过', blocked: '准备被阻断', preparing: '来源正在准备' } as const)[
              current.status
            ]
          }
        >
          <BacktestPreparationEvidence key={current.requestId} value={current} />
        </Section>
      ) : null}
      {pendingQuery.data ? (
        <Section title="原 Run 提交待确认">
          <Copy>幂等标识 {pendingQuery.data.body.idempotencyKey}</Copy>
          <Copy>原冻结输入已留在本机。显式找回会复用相同输入和标识。</Copy>
        </Section>
      ) : null}
      <Action
        label={pendingQuery.data ? '找回原 Run 提交' : '确认冻结并创建回测'}
        primary
        disabled={
          command.isPending ||
          !pendingQuery.isSuccess ||
          !!receipt ||
          (!pendingQuery.data &&
            (current?.status !== 'prepared' || preparation.isError || preparation.isFetching))
        }
        onPress={() =>
          void command.mutateAsync(undefined).catch((e) => setMessage(failureMessage(e)))
        }
      />
      <Feedback message={message} error={command.isError} />
      {receipt ? (
        <Action
          label="打开已创建回测"
          onPress={() => navigation.navigate('BacktestResult', { kind: params.kind, id: receipt })}
        />
      ) : null}
    </Page>
  );
}
