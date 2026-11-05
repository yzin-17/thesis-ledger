import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { isEqual } from 'es-toolkit';
import { type StrategyRiskApplicationRead } from '@thesis-ledger/schemas';
import {
  prepareRiskApplicationCommand,
  executeRiskApplicationCommand,
  riskApplicationCommandRejected,
} from './risk-application-command';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useMobileCommand } from '../../app/query/mobile-queries';
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
import { useStrategyLibrary } from '../strategy-library/useStrategyLibrary';
import { StrategyVersionPicker } from '../strategy-library/StrategyVersionPicker';
import { RiskNotificationFields } from './RiskNotificationFields';
import { riskNotificationBody, type RiskNotificationForm } from './risk-notification-model';
import {
  parseStrategyRiskAction,
  strategyRiskStatusLabel,
  riskUpgradeControls,
  riskCapabilityAvailable,
  type StrategyRiskAction,
} from './risk-application-actions';
const config = (row: StrategyRiskApplicationRead): RiskNotificationForm => ({
  enabled: row.notification.enabled,
  cooldown: String(row.notification.cooldownMinutes),
  severity: row.notification.severity,
  feishu: row.notification.channels.includes('feishu'),
});
export function StrategyRiskEditorScreen() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'StrategyRiskEditor'>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const query = useQuery({
    queryKey: [...scope, 'strategy-risk-detail', params.id],
    queryFn: ({ signal }) => api.strategy.risk.read(params.id, signal),
    retry: false,
  });
  const readable = !!query.data && accounts.data?.some((a) => a.id === query.data.accountId);
  return (
    <Page title="管理策略风险应用">
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {query.data && readable ? (
        <StrategyRiskEditorForm
          key={params.id}
          initial={query.data}
          readable={!query.isError && !accounts.isError}
        />
      ) : null}
      {!readable && query.isSuccess && accounts.isSuccess ? (
        <Copy>应用不属于当前账户模式，不能修改。</Copy>
      ) : null}
    </Page>
  );
}
function useStrategyRiskEditorController({
  initial,
  readable,
}: {
  initial: StrategyRiskApplicationRead;
  readable: boolean;
}) {
  const { api, scope, baseUrl, mode } = useMobileRuntime();
  const risk = api.strategy.risk;
  const accounts = useAccounts();
  const library = useStrategyLibrary();
  const cache = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const caps=useQuery({queryKey:[...scope,'optimization-capabilities'],queryFn:({signal})=>api.strategy.optimization.capabilities(signal),retry:false});
  const capabilityEnabled=riskCapabilityAvailable(caps);
  const [current, setCurrent] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled ? 'yes' : 'no');
  const [notification, setNotification] = useState(() => config(initial));
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [receipt, setReceipt] = useState('');
  const key = JSON.stringify(['mobile-strategy-risk-action-v1', baseUrl, mode, initial.id]);
  const pending = useQuery({
    queryKey: [...scope, 'strategy-risk-action-pending', initial.id],
    queryFn: async (): Promise<StrategyRiskAction | null> => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const value = parseStrategyRiskAction(JSON.parse(raw));
      if (value.id !== initial.id) throw Error('风险应用操作身份不一致。');
      return value;
    },
    retry: false,
  });
  let dirty = true;
  try {
    dirty =
      enabled !== (current.enabled ? 'yes' : 'no') ||
      !isEqual(riskNotificationBody(notification), current.notification);
  } catch {
    /* 无效通知配置保持未保存状态。 */
  }
  useDirtyForm(dirty, () => {
    setEnabled(current.enabled ? 'yes' : 'no');
    setNotification(config(current));
  });
  const signature = JSON.stringify({ id: current.id, revision: current.revision, target });
  const [submitted, setSubmitted] = useState<{ signature: string; target: string } | null>(null);
  const preview = useQuery({
    queryKey: [...scope, 'strategy-risk-upgrade-preview', current.id, submitted],
    enabled: !!submitted && submitted.signature === signature,
    queryFn: () => risk.previewUpgrade(current.id, submitted!.target),
    retry: false,
  });
  const activePreview = submitted?.signature === signature ? preview.data : undefined;
  const accept = (row: StrategyRiskApplicationRead) => {
    setCurrent(row);
    setEnabled(row.enabled ? 'yes' : 'no');
    setNotification(config(row));
    setSubmitted(null);
    cache.setQueryData([...scope, 'strategy-risk-detail', initial.id], row);
  };
  const command = useMobileCommand(
    async (action: 'update' | 'archive' | 'upgrade' | 'resume' | 'review' | 'load') => {
      const now = await risk.read(initial.id);
      if (!accounts.data?.some((a) => a.id === now.accountId && a.active) || accounts.isError)
        throw Error('应用账户不在当前可修改范围。');
      if (action === 'review') {
        if (!rejected) throw Error('原操作尚未确认被拒绝，凭据仍保留。');
        await AsyncStorage.removeItem(key);
        await pending.refetch();
        setCurrent(now);
        setSubmitted(null);
        setRejected(false);
        setMessage('已保留表单并读取最新修订，请重新核对后提交。');
        return;
      }
      if (action === 'load') {
        if (dirty && !(await confirmAction('使用服务端配置？', '当前输入会替换为服务端最新修订。')))
          return;
        accept(now);
        return;
      }
      let entry = pending.data;
      if (!entry) {
        if (action === 'resume') throw Error('没有待确认操作。');
        entry = prepareRiskApplicationCommand({
          action,
          current,
          latest: now,
          readable,
          dirty,
          preview: activePreview,
          previewError: preview.isError,
          target,
          enabled: enabled === 'yes',
          notification,
          idempotencyKey: randomUUID(),
        });
        if (
          !(await confirmAction(
            action === 'archive' ? '归档策略风险应用？' : '确认风险应用更改？',
            action === 'archive'
              ? '将停用生成规则并保留历史。'
              : `账户 ${now.accountId} · ${now.symbol} · 修订 ${now.revision}；请核对开关、通知与计划差异。`,
          ))
        )
          return;
        await AsyncStorage.setItem(key, JSON.stringify(entry));
        await pending.refetch();
      }
      try {
        const result = await executeRiskApplicationCommand(risk, entry, now, capabilityEnabled);
        if (result.id === initial.id) accept(result);
        else setReceipt(result.id);
        await AsyncStorage.removeItem(key);
        await pending.refetch();
        await cache.invalidateQueries({ queryKey: [...scope, 'strategy-risk-list'] });
        setMessage('风险应用更改已确认，历史与当前状态仍可查看。');
      } catch (error) {
        setRejected(riskApplicationCommandRejected(error));
        throw error;
      }
    },
    { refresh: false },
  );
  const execute = (action: 'update' | 'archive' | 'upgrade' | 'resume' | 'review' | 'load') =>
    void command.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  const locked = command.isPending || !!pending.data || !!current.archivedAt || !readable || !capabilityEnabled;
  const upgradeControls=riskUpgradeControls({locked,dirty,target,currentVersion:current.strategyVersionId,reading:preview.isFetching,
    previewAvailable:Boolean(activePreview&&activePreview.currentRevision===current.revision),previewError:preview.isError,pendingKnown:pending.isSuccess});
  const owner = library.data?.find((s) =>
    s.versions.some((v) => v.id === current.strategyVersionId),
  );
  return {
    caps,
    upgradeControls,
    current,
    accounts,
    enabled,
    locked,
    setEnabled,
    notification,
    setNotification,
    pending,
    execute,
    command,
    library,
    owner,
    target,
    dirty,
    setTarget,
    setSubmitted,
    preview,
    signature,
    setMessage,
    submitted,
    activePreview,
    rejected,
    message,
    receipt,
    navigation,
  };
}
function StrategyRiskEditorForm({
  initial,
  readable,
}: {
  initial: StrategyRiskApplicationRead;
  readable: boolean;
}) {
  const state = useStrategyRiskEditorController({ initial, readable });
  const {
    caps,
    upgradeControls,
    current,
    accounts,
    enabled,
    locked,
    setEnabled,
    notification,
    setNotification,
    pending,
    execute,
    command,
    library,
    owner,
    target,
    dirty,
    setTarget,
    setSubmitted,
    preview,
    signature,
    setMessage,
    submitted,
    activePreview,
    rejected,
    message,
    receipt,
    navigation,
  } = state;
  return (
    <>
      <QueryStatus query={caps} retry={()=>void caps.refetch()}/>
      <Section title={`${current.symbol} · 修订 ${current.revision}`}>
        <Copy>应用 {current.id}</Copy>
        <Copy>
          账户 {accounts.data?.find((a) => a.id === current.accountId)?.name ?? current.accountId}
        </Copy>
        <Copy>
          策略版本 {current.strategyVersionId} · {strategyRiskStatusLabel(current)}
        </Copy>
        <Copy>
          计划指纹 {current.planHash} · 覆盖 {current.coverage.riskMapped}/
          {current.coverage.riskTotal}
        </Copy>
        <Copy>{JSON.stringify(current.plan, null, 2)}</Copy>
      </Section>
      <Choices
        label="修改应用开关"
        value={enabled}
        disabled={locked}
        onChange={setEnabled}
        options={[
          { value: 'no', label: '停用风险应用' },
          { value: 'yes', label: '启用风险应用' },
        ]}
      />
      <RiskNotificationFields value={notification} onChange={setNotification} disabled={locked} />
      <Action
        label="确认修改风险应用"
        disabled={locked || !pending.isSuccess}
        onPress={() => execute('update')}
      />
      <Action
        label="使用服务端风险配置"
        disabled={command.isPending || !!pending.data}
        onPress={() => execute('load')}
      />
      <QueryStatus query={library} retry={() => void library.refetch()} />
      <StrategyVersionPicker
        rows={owner ? [owner] : []}
        label="升级目标版本"
        value={target}
        disabled={locked || dirty}
        onChange={(value) => {
          setTarget(value);
          setSubmitted(null);
        }}
      />
      <Action
        label="预览风险应用升级"
        disabled={!upgradeControls.preview}
        onPress={() => {
          setSubmitted({ signature, target });
          setMessage(null);
        }}
      />
      {submitted ? <QueryStatus query={preview} retry={() => void preview.refetch()} /> : null}
      {activePreview ? (
        <Section title="升级差异与当前修订">
          <Copy>{JSON.stringify(activePreview, null, 2)}</Copy>
        </Section>
      ) : null}
      <Action
        label="确认升级风险应用"
        disabled={!upgradeControls.confirm}
        onPress={() => execute('upgrade')}
      />
      <Action
        label="归档策略风险应用"
        disabled={locked || !pending.isSuccess}
        onPress={() => execute('archive')}
      />
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      {pending.data ? (
        <Section title="原风险操作待确认">
          <Copy>{JSON.stringify(pending.data, null, 2)}</Copy>
          <Action
            label="找回原风险应用操作"
            disabled={command.isPending}
            onPress={() => execute('resume')}
          />
        </Section>
      ) : null}
      {rejected ? (
        <Action
          label="重新核对被拒绝的风险操作"
          disabled={command.isPending}
          onPress={() => execute('review')}
        />
      ) : null}
      <Feedback message={message} error={command.isError} />
      {receipt ? (
        <Action
          label="打开目标风险应用"
          onPress={() => navigation.navigate('StrategyRiskEditor', { id: receipt })}
        />
      ) : null}
    </>
  );
}
