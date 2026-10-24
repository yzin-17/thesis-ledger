import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  riskApplicationCreateSchema,
  riskApplicationPreviewInputSchema,
} from '@thesis-ledger/schemas';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useMobileCommand } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { useStrategyLibrary } from '../strategy-library/useStrategyLibrary';
import { StrategyVersionPicker } from '../strategy-library/StrategyVersionPicker';
import { RiskNotificationFields } from './RiskNotificationFields';
import { emptyRiskNotification, riskNotificationBody } from './risk-notification-model';
import { riskCapabilityAvailable, riskCreateControls } from './risk-application-actions';
function useStrategyRiskCreateController() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'StrategyRiskCreate'>>();
  const { api, scope, baseUrl, mode } = useMobileRuntime();
  const risk = api.strategy.risk;
  const accounts = useAccounts();
  const library = useStrategyLibrary();
  const cache = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const [versionId, setVersionId] = useState(params?.versionId ?? '');
  const [accountId, setAccountId] = useState('');
  const [symbol, setSymbol] = useState<string | null>(null);
  const [cycleMode, setCycleMode] = useState<'existingAndFuture' | 'nextPositionCycle'>(
    'existingAndFuture',
  );
  const [enabled, setEnabled] = useState('no');
  const [notification, setNotification] = useState(emptyRiskNotification);
  const [edited, setEdited] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [receipt, setReceipt] = useState('');
  const version = library.data?.flatMap((v) => v.versions).find((v) => v.id === versionId);
  const execution = version?.schema?.executionInstrument as { symbol?: string } | undefined;
  const effectiveSymbol = symbol ?? execution?.symbol ?? '';
  const account = accounts.data?.find((v) => v.id === accountId && v.active);
  const caps = useQuery({
    queryKey: [...scope, 'optimization-capabilities'],
    queryFn: ({ signal }) => api.strategy.optimization.capabilities(signal),
    retry: false,
  });
  const key = JSON.stringify(['mobile-strategy-risk-create-v1', baseUrl, mode]);
  const pending = useQuery({
    queryKey: [...scope, 'strategy-risk-create-pending'],
    queryFn: async () => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (typeof value.enabled !== 'boolean' || !value.notification)
        throw Error('原风险申请缺少显式开关，凭据已保留。');
      return riskApplicationCreateSchema.parse(value);
    },
    retry: false,
  });
  const signature = JSON.stringify({
    versionId,
    accountId,
    symbol: effectiveSymbol,
    cycleMode,
    enabled,
    notification,
  });
  const [submitted, setSubmitted] = useState<{
    signature: string;
    body: Parameters<typeof risk.preview>[0];
  } | null>(null);
  const preview = useQuery({
    queryKey: [...scope, 'strategy-risk-preview', submitted],
    enabled: !!submitted && submitted.signature === signature,
    queryFn: () => risk.preview(submitted!.body),
    retry: false,
  });
  const current = submitted?.signature === signature ? preview.data : undefined;
  useDirtyForm(edited, () => {
    setEdited(false);
    setSubmitted(null);
  });
  const capabilityReady = canUseReadForWrite(caps) && riskCapabilityAvailable(caps);
  const ready =
    canUseReadForWrite(accounts) &&
    canUseReadForWrite(library) &&
    capabilityReady;
  const command = useMobileCommand(
    async (action: 'create' | 'review') => {
      if (action === 'review') {
        if (!rejected) throw Error('原申请尚未确认被拒绝，请保留原凭据。');
        await AsyncStorage.removeItem(key);
        await pending.refetch();
        setSubmitted(null);
        setRejected(false);
        return;
      }
      let body = pending.data;
      if (!body) {
        if (!ready || !account || !version || !current || preview.isError)
          throw Error('账户、版本或当前预览尚未通过。');
        if (
          !(await confirmAction(
            '确认创建策略风险应用？',
            `${account.name} · ${effectiveSymbol}；应用${enabled === 'yes' ? '启用' : '停用'}，通知${notification.enabled ? '启用' : '关闭'}。`,
          ))
        )
          return;
        body = riskApplicationCreateSchema.parse({
          ...submitted!.body,
          previewHash: current.previewHash,
          idempotencyKey: randomUUID(),
          enabled: enabled === 'yes',
          notification: riskNotificationBody(notification),
        });
        await AsyncStorage.setItem(key, JSON.stringify(body));
        await pending.refetch();
      }
      if (!capabilityReady)
        throw Error('策略风险能力尚未就绪，原申请已保留，未提交。');
      if (
        !canUseReadForWrite(accounts) ||
        !accounts.data?.some((v) => v.id === body.accountId && v.active)
      )
        throw Error('原申请账户不在当前可用范围，未提交。');
      try {
        const result = await risk.create(body);
        setReceipt(result.id);
        setEdited(false);
        await AsyncStorage.removeItem(key);
        await pending.refetch();
        await cache.invalidateQueries({ queryKey: [...scope, 'strategy-risk-list'] });
        setMessage('风险应用已确认，可打开管理页。');
      } catch (error) {
        if (error instanceof ThesisLedgerApiError && [400, 409].includes(error.status))
          setRejected(true);
        throw error;
      }
    },
    { refresh: false },
  );
  const {locked,submitDisabled}=riskCreateControls({writing:command.isPending,pending:!!pending.data,
    receipt:!!receipt,pendingKnown:pending.isSuccess,capabilityReady,previewCurrent:!!current,
    previewFailed:preview.isError,ready});
  const edit = (change: () => void) => {
    change();
    setEdited(true);
    setSubmitted(null);
  };
  const prepare = () => {
    try {
      if (!ready || !account || !version)
        throw Error('请先核对当前模式的账户、正式版本与功能能力。');
      const body = riskApplicationPreviewInputSchema.parse({
        strategyVersionId: versionId,
        accountId,
        symbol: effectiveSymbol,
        cycleMode,
      });
      setSubmitted({ signature, body });
      setMessage(null);
    } catch (e) {
      setMessage(failureMessage(e));
    }
  };
  const execute = (action: 'create' | 'review') =>
    void command.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  return {
    accounts,
    library,
    caps,
    pending,
    versionId,
    locked,
    edit,
    setVersionId,
    setSymbol,
    accountId,
    setAccountId,
    effectiveSymbol,
    cycleMode,
    setCycleMode,
    enabled,
    setEnabled,
    notification,
    setNotification,
    ready,
    submitDisabled,
    preview,
    prepare,
    submitted,
    current,
    command,
    receipt,
    execute,
    rejected,
    message,
    navigation,
  };
}
export function StrategyRiskCreateScreen() {
  const state = useStrategyRiskCreateController();
  const {
    accounts,
    library,
    caps,
    pending,
    versionId,
    locked,
    edit,
    setVersionId,
    setSymbol,
    accountId,
    setAccountId,
    effectiveSymbol,
    cycleMode,
    setCycleMode,
    enabled,
    setEnabled,
    notification,
    setNotification,
    ready,
    submitDisabled,
    preview,
    prepare,
    submitted,
    current,
    command,
    receipt,
    execute,
    rejected,
    message,
    navigation,
  } = state;
  return (
    <Page title="预览新策略风险应用">
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <QueryStatus query={library} retry={() => void library.refetch()} />
      <QueryStatus query={caps} retry={() => void caps.refetch()} />
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      {!caps.data?.riskApplicationsEnabled ? (
        <Copy>策略风险应用尚未就绪；此页只读能力状态。</Copy>
      ) : null}
      <StrategyVersionPicker
        rows={library.data ?? []}
        label="风险策略版本"
        value={versionId}
        disabled={locked}
        onChange={(v) =>
          edit(() => {
            setVersionId(v);
            setSymbol(null);
          })
        }
      />
      <Choices
        label="风险应用账户"
        value={accountId}
        disabled={locked}
        onChange={(v) => edit(() => setAccountId(v))}
        options={(accounts.data ?? [])
          .filter((v) => v.active)
          .map((v) => ({ value: v.id, label: v.name }))}
      />
      <Field
        label="风险应用标的"
        value={effectiveSymbol}
        editable={!locked}
        onChange={(v) => edit(() => setSymbol(v))}
      />
      <Choices
        label="风险应用生效范围"
        value={cycleMode}
        disabled={locked}
        onChange={(v) => edit(() => setCycleMode(v))}
        options={[
          { value: 'existingAndFuture', label: '当前及未来持仓周期' },
          { value: 'nextPositionCycle', label: '下个持仓周期' },
        ]}
      />
      <Choices
        label="风险应用开关"
        value={enabled}
        disabled={locked}
        onChange={(v) => edit(() => setEnabled(v))}
        options={[
          { value: 'no', label: '保存为停用' },
          { value: 'yes', label: '启用风险应用' },
        ]}
      />
      <RiskNotificationFields
        value={notification}
        disabled={locked}
        onChange={(v) => edit(() => setNotification(v))}
      />
      <Action
        label="预览策略风险计划"
        disabled={locked || !ready || preview.isFetching}
        onPress={prepare}
      />
      {submitted ? <QueryStatus query={preview} retry={() => void preview.refetch()} /> : null}
      {current ? (
        <Section title="风险计划预览">
          <Copy>预览指纹 {current.previewHash}</Copy>
          <Copy>{JSON.stringify(current, null, 2)}</Copy>
        </Section>
      ) : null}
      {pending.data ? (
        <Section title="原风险申请待确认">
          <Copy>{JSON.stringify(pending.data, null, 2)}</Copy>
        </Section>
      ) : null}
      <Action
        label={pending.data ? '找回原风险应用申请' : '确认保存策略风险应用'}
        primary
        disabled={submitDisabled}
        onPress={() => execute('create')}
      />
      {rejected ? (
        <Action
          label="重新预览被拒绝的申请"
          disabled={command.isPending}
          onPress={() => execute('review')}
        />
      ) : null}
      <Feedback message={message} error={command.isError} />
      {receipt ? (
        <Action
          label="打开已保存风险应用"
          onPress={() => navigation.navigate('StrategyRiskEditor', { id: receipt })}
        />
      ) : null}
    </Page>
  );
}
