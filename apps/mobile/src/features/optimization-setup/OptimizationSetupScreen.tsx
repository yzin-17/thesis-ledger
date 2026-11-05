import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  optimizationExperimentCreateSchema,
  optimizationRunPreparationRequestSchema,
  optimizationDiscoveryScopeSchema,
  type OptimizationExperimentCreate,
  type OptimizationPreparationTarget,
} from '@thesis-ledger/schemas';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
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
import { BacktestInputFields } from '../backtest-setup/BacktestInputFields';
import { newBacktestForm, ordinaryPreparationIntentBase } from '../backtest-setup/backtest-intent';
function useOptimizationSetupController() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'OptimizationSetup'>>();
  const { api, scope, baseUrl } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const optimization = api.strategy.optimization;
  const library = useStrategyLibrary();
  const caps = useQuery({
    queryKey: [...scope, 'optimization-capabilities'],
    queryFn: ({ signal }) => optimization.capabilities(signal),
    retry: false,
  });
  const capabilityReady = canUseReadForWrite(caps) && caps.data?.aiOptimizationEnabled === true;
  const [name, setName] = useState('');
  const [source, setSource] = useState<'existing' | 'discovery'>('existing');
  const [versionId, setVersionId] = useState(params?.versionId ?? '');
  const [discovery, setDiscovery] = useState(
    '{"executionInstrument":{"symbol":"","market":"CN","assetType":"stock"},"primaryTimeframe":"1d"}',
  );
  const [models, setModels] = useState<string[]>([]);
  const [efforts, setEfforts] = useState<Record<string, string>>({});
  const [parameters, setParameters] = useState<string[]>([]);
  const [objective, setObjective] = useState('{"mode":"balanced","minClosedTrades":1}');
  const [split, setSplit] = useState(
    '{"development":{"start":"","end":""},"validation":{"start":"","end":""},"test":{"start":"","end":""}}',
  );
  const [budget, setBudget] = useState(
    '{"maxAiCalls":6,"maxBacktestRuns":20,"maxInputTokens":100000,"maxOutputTokens":20000,"maxDurationSeconds":1800}',
  );
  const [rounds, setRounds] = useState('2');
  const [ack, setAck] = useState('no');
  const [form, setForm] = useState(() => newBacktestForm(''));
  const [warmup, setWarmup] = useState('0');
  const [edited, setEdited] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    signature: string;
    body: Parameters<typeof optimization.prepare>[0];
  } | null>(null);
  const key = JSON.stringify(['mobile-optimization-create-v1', baseUrl]);
  const pending = useQuery({
    queryKey: [...scope, 'optimization-pending'],
    queryFn: async (): Promise<OptimizationExperimentCreate | null> => {
      const raw = await AsyncStorage.getItem(key);
      return raw ? optimizationExperimentCreateSchema.parse(JSON.parse(raw)) : null;
    },
    retry: false,
  });
  const descriptors = useQuery({
    queryKey: [...scope, 'optimization-parameters', versionId],
    enabled: source === 'existing' && !!versionId,
    queryFn: ({ signal }) => optimization.parameters(versionId, signal),
    retry: false,
  });
  const signature = JSON.stringify({ source, versionId, discovery, parameters, form, warmup });
  useDirtyForm(edited, () => {
    setEdited(false);
    setSubmitted(null);
  });
  const preparation = useQuery({
    queryKey: [...scope, 'optimization-prepare', submitted],
    enabled: !!submitted && signature === submitted.signature,
    queryFn: ({ signal }) => optimization.prepare(submitted!.body, signal),
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === 'preparing' ? 2000 : false),
  });
  const preparationResult = preparation.data;
  const prepared =
    preparationResult?.status === 'prepared' && submitted?.signature === signature
      ? preparationResult
      : null;
  const command = useMobileCommand(
    async () => {
      if (!capabilityReady) throw Error('实验能力尚未就绪，原提交已保留，未创建实验。');
      let body = pending.data;
      if (!body) {
        if (
          !capabilityReady ||
          preparation.isError ||
          !prepared ||
          prepared.status !== 'prepared'
        )
          throw Error('实验能力或当前准备尚未通过。');
        const target: OptimizationPreparationTarget =
          source === 'existing'
            ? { sourceMode: source, strategyVersionId: versionId }
            : {
                sourceMode: source,
                discoveryScope: optimizationDiscoveryScopeSchema.parse(JSON.parse(discovery)),
              };
        const selected = (caps.data?.providers ?? []).filter((v) =>
          models.includes(JSON.stringify([v.provider, v.model])),
        );
        if (selected.some((v) => v.costStatus === 'unknown') && ack !== 'yes')
          throw Error('请针对所选模型明确确认未知费用。');
        body = optimizationExperimentCreateSchema.parse({
          contractVersion: 3,
          ...target,
          ...(name.trim() ? { name } : {}),
          ...(source === 'existing' ? { allowedParameterIds: parameters } : {}),
          models: selected.map((v) => {
            const effort = efforts[JSON.stringify([v.provider, v.model])];
            return {
              provider: v.provider,
              model: v.model,
              ...(effort && effort !== 'auto' ? { reasoningEffort: effort } : {}),
            };
          }),
          objective: JSON.parse(objective) as unknown,
          split: JSON.parse(split) as unknown,
          budget: JSON.parse(budget) as unknown,
          maxRounds: Number(rounds),
          runConfig: prepared.runConfig,
          acknowledgeUnknownCost: ack === 'yes',
          idempotencyKey: randomUUID(),
        });
        if (
          !(await confirmAction(
            '确认创建优化实验？',
            '本次会按上述预算调用所选模型并运行回测。请核对来源、开发/验证/测试区间与参数授权。',
          ))
        )
          return;
        await AsyncStorage.setItem(key, JSON.stringify(body));
        await pending.refetch();
      }
      const result = await optimization.create(body);
      setReceipt(result.id);
      setEdited(false);
      await AsyncStorage.removeItem(key);
      await pending.refetch();
      setMessage('实验已确认，后台状态可在实验详情查看。');
    },
    { refresh: false },
  );
  const locked = command.isPending || !!pending.data || !!receipt;
  const edit = (update: () => void) => {
    update();
    setEdited(true);
  };
  const prepare = () => {
    try {
      const target =
        source === 'existing'
          ? { sourceMode: source, strategyVersionId: versionId }
          : {
              sourceMode: source,
              discoveryScope: optimizationDiscoveryScopeSchema.parse(JSON.parse(discovery)),
            };
      const extra: unknown = JSON.parse(form.extras);
      if (!extra || typeof extra !== 'object' || Array.isArray(extra))
        throw Error('研究选项必须是 JSON 对象。');
      const intent = ordinaryPreparationIntentBase(
        { ...form, extras: JSON.stringify({ ...extra, warmupBudgetSessions: Number(warmup) }) },
        randomUUID(),
        new Date().toISOString(),
      );
      const body = optimizationRunPreparationRequestSchema.parse({ target, intent });
      setSubmitted({ signature, body });
      setMessage(null);
    } catch (e) {
      setMessage(failureMessage(e));
    }
  };
  return {
    caps,
    capabilityReady,
    pending,
    name,
    locked,
    edit,
    setName,
    source,
    setSource,
    setParameters,
    setSubmitted,
    library,
    versionId,
    setVersionId,
    descriptors,
    parameters,
    discovery,
    setDiscovery,
    models,
    setModels,
    setAck,
    efforts,
    setEfforts,
    ack,
    objective,
    setObjective,
    split,
    setSplit,
    budget,
    setBudget,
    rounds,
    setRounds,
    form,
    setForm,
    warmup,
    setWarmup,
    preparation,
    prepare,
    submitted,
    signature,
    command,
    receipt,
    prepared,
    setMessage,
    message,
    navigation,
  };
}
export function OptimizationSetupScreen() {
  const state = useOptimizationSetupController();
  const {
    caps,
    capabilityReady,
    pending,
    name,
    locked,
    edit,
    setName,

    setSubmitted,

    objective,
    setObjective,
    split,
    setSplit,
    budget,
    setBudget,
    rounds,
    setRounds,
    form,
    setForm,
    warmup,
    setWarmup,
    preparation,
    prepare,
    submitted,
    signature,
    command,
    receipt,
    prepared,
    setMessage,
    message,
    navigation,
  } = state;
  return (
    <Page title="创建优化实验">
      <QueryStatus query={caps} retry={() => void caps.refetch()} />
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      {!caps.data?.aiOptimizationEnabled ? (
        <Copy>AI 优化未就绪，未创建实验。此处只读能力状态。</Copy>
      ) : null}
      <Field
        label="实验名称"
        value={name}
        editable={!locked}
        onChange={(v) => edit(() => setName(v))}
      />
      <OptimizationSelectionFields state={state} />
      <Field
        label="优化目标 JSON"
        value={objective}
        multiline
        editable={!locked}
        onChange={(v) => edit(() => setObjective(v))}
      />
      <Field
        label="开发、验证与封存测试区间 JSON"
        value={split}
        multiline
        editable={!locked}
        onChange={(v) => edit(() => setSplit(v))}
      />
      <Field
        label="实验预算 JSON"
        value={budget}
        multiline
        editable={!locked}
        onChange={(v) => edit(() => setBudget(v))}
      />
      <Field
        label="最大轮数（1～3）"
        value={rounds}
        editable={!locked}
        onChange={(v) => edit(() => setRounds(v))}
      />
      <BacktestInputFields
        kind="ordinary"
        value={form}
        disabled={locked}
        onChange={(v) =>
          edit(() => {
            setForm(v);
            setSubmitted(null);
          })
        }
      />
      <Field
        label="候选预热交易日预算"
        value={warmup}
        editable={!locked}
        onChange={(v) =>
          edit(() => {
            setWarmup(v);
            setSubmitted(null);
          })
        }
      />
      <Action
        label="准备实验价格与执行配置"
        disabled={
          locked || !capabilityReady || preparation.isFetching
        }
        onPress={prepare}
      />
      {submitted ? (
        <QueryStatus query={preparation} retry={() => void preparation.refetch()} />
      ) : null}
      {submitted && submitted.signature === signature && preparation.data ? (
        <Section title="实验准备结果">
          <Copy>{JSON.stringify(preparation.data, null, 2)}</Copy>
        </Section>
      ) : null}
      {pending.data ? (
        <Copy>原实验提交待确认：{pending.data.idempotencyKey}；将原样复用冻结输入。</Copy>
      ) : null}
      <Action
        label={pending.data ? '找回原实验提交' : '确认创建优化实验'}
        primary
        disabled={
          command.isPending ||
          !!receipt ||
          !pending.isSuccess ||
          !capabilityReady ||
          (!pending.data && (!prepared || preparation.isError))
        }
        onPress={() =>
          void command.mutateAsync(undefined).catch((e) => setMessage(failureMessage(e)))
        }
      />
      <Feedback message={message} error={command.isError} />
      {receipt ? (
        <Action
          label="打开已创建实验"
          onPress={() => navigation.navigate('OptimizationResults', { id: receipt })}
        />
      ) : null}
    </Page>
  );
}

function OptimizationSelectionFields({
  state,
}: {
  state: ReturnType<typeof useOptimizationSetupController>;
}) {
  const {
    source,
    locked,
    edit,
    setSource,
    setParameters,
    setSubmitted,
    library,
    versionId,
    setVersionId,
    descriptors,
    parameters,
    discovery,
    setDiscovery,
    caps,
    models,
    setModels,
    setAck,
    efforts,
    setEfforts,
    ack,
  } = state;
  return (
    <>
      {' '}
      <Choices
        label="实验来源"
        value={source}
        disabled={locked}
        onChange={(v) =>
          edit(() => {
            setSource(v);
            setParameters([]);
            setSubmitted(null);
          })
        }
        options={[
          { value: 'existing', label: '现有策略优化' },
          { value: 'discovery', label: '从零探索' },
        ]}
      />
      {source === 'existing' ? (
        <>
          <QueryStatus query={library} retry={() => void library.refetch()} />
          <Choices
            label="实验策略版本"
            value={versionId}
            disabled={locked}
            onChange={(v) =>
              edit(() => {
                setVersionId(v);
                setParameters([]);
                setSubmitted(null);
              })
            }
            options={(library.data ?? []).flatMap((s) =>
              s.versions
                .filter((v) => v.version > 0)
                .map((v) => ({ value: v.id, label: `${s.name} · 版本 ${v.version}` })),
            )}
          />
          <QueryStatus query={descriptors} retry={() => void descriptors.refetch()} />
          {descriptors.data?.map((p) => (
            <Section key={p.parameterId} title={p.label}>
              <Copy>
                当前值 {String(p.currentValue)} ·{' '}
                {JSON.stringify(p.optimizationRange ?? p.schemaRange ?? '范围未记录')}
              </Copy>
              <Action
                label={`${parameters.includes(p.parameterId) ? '取消授权' : '授权优化'} ${p.label}`}
                disabled={locked || descriptors.isError}
                onPress={() =>
                  edit(() =>
                    setParameters((v) =>
                      v.includes(p.parameterId)
                        ? v.filter((x) => x !== p.parameterId)
                        : [...v, p.parameterId],
                    ),
                  )
                }
              />
            </Section>
          ))}
        </>
      ) : (
        <Field
          label="探索边界 JSON"
          value={discovery}
          multiline
          editable={!locked}
          onChange={(v) => edit(() => setDiscovery(v))}
        />
      )}
      <Section title="模型与价格">
        {(caps.data?.providers ?? []).map((v) => {
          const modelKey = JSON.stringify([v.provider, v.model]);
          const selected = models.includes(modelKey);
          return (
            <Section key={modelKey} title={`${v.provider} / ${v.model}`}>
              <Copy>
                {v.costStatus === 'unknown'
                  ? '费用未知'
                  : `价格已配置 · ${v.costCurrency ?? '币种未记录'}`}
              </Copy>
              <Action
                label={`${selected ? '取消选择' : '选择模型'} ${v.provider} / ${v.model}`}
                disabled={locked || (!selected && models.length >= 3)}
                onPress={() =>
                  edit(() => {
                    setModels((list) =>
                      selected ? list.filter((x) => x !== modelKey) : [...list, modelKey],
                    );
                    setAck('no');
                  })
                }
              />
              {selected && v.reasoning ? (
                <Choices
                  label="模型推理强度"
                  value={efforts[modelKey] ?? 'auto'}
                  disabled={locked}
                  onChange={(value) => edit(() => setEfforts({ ...efforts, [modelKey]: value }))}
                  options={[
                    { value: 'auto', label: '使用已配置默认' },
                    ...(v.reasoning.supportedEfforts ?? []).map((value) => ({
                      value,
                      label:
                        (
                          {
                            none: '无推理',
                            minimal: '极简',
                            low: '低',
                            medium: '中',
                            high: '高',
                            xhigh: '很高',
                            max: '最高',
                          } as Record<string, string>
                        )[value] ?? '其他可用强度',
                    })),
                  ]}
                />
              ) : null}
            </Section>
          );
        })}
        <Choices
          label="实验未知费用确认"
          value={ack}
          disabled={locked}
          onChange={setAck}
          options={[
            { value: 'no', label: '尚未确认' },
            { value: 'yes', label: '接受所选模型的未知费用' },
          ]}
        />
      </Section>
    </>
  );
}
