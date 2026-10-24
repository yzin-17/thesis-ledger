import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  canRevealTestMetrics,
  canSelectCandidateForTest,
  candidateAdoptionEligibility,
} from '@thesis-ledger/schemas';
import { confirmAction, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
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
import {
  cloneExperimentInput,
  parseExperimentAction,
  type ExperimentAction,
} from './experiment-actions';
import { optimizationStatusLabels } from './optimization-labels';
function useOptimizationDetailController({ id }: { id: string }) {
  const { api, scope, baseUrl } = useMobileRuntime();
  const optimization = api.strategy.optimization;
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const [name, setName] = useState('');
  const [ack, setAck] = useState('no');
  const [selected, setSelected] = useState<string[]>([]);
  const [preferred, setPreferred] = useState('');
  const [planVersion, setPlanVersion] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [cloned, setCloned] = useState<string | null>(null);
  const key = JSON.stringify(['mobile-experiment-action-v1', baseUrl, id]);
  const query = useQuery({
    queryKey: [...scope, 'optimization-detail', id],
    queryFn: ({ signal }) => optimization.compare(id, signal),
    retry: false,
    refetchInterval: (q) =>
      q.state.data && ['queued', 'running', 'testing'].includes(q.state.data.experiment.status)
        ? 2000
        : false,
  });
  const pending = useQuery({
    queryKey: [...scope, 'optimization-action-pending', id],
    queryFn: async (): Promise<ExperimentAction | null> => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const value = parseExperimentAction(JSON.parse(raw));
      if (value.id !== id) throw Error('实验操作身份不一致。');
      return value;
    },
    retry: false,
  });
  const plan = useQuery({
    queryKey: [...scope, 'optimization-monitoring-plan', planVersion],
    enabled: !!planVersion,
    queryFn: ({ signal }) => optimization.monitoringPlan(planVersion, signal),
    retry: false,
  });
  const command = useMobileCommand(
    async (action: 'rename' | 'clone' | 'cancel' | 'finalize' | 'resume') => {
      let entry = pending.data;
      const current = await optimization.compare(id);
      if (!entry) {
        if (action === 'resume') throw Error('没有待确认实验操作。');
        if (query.isError) throw Error('请先重新读取实验。');
        if (action === 'rename') entry = { id, action, body: { name } };
        else if (action === 'clone')
          entry = {
            id,
            action,
            body: {
              idempotencyKey: randomUUID(),
              acknowledgeUnknownCost: ack === 'yes',
              ...(name.trim() ? { name } : {}),
            },
          };
        else if (action === 'cancel') entry = { id, action, body: {} };
        else {
          if (
            selected.some(
              (cid) =>
                !current.candidates.some(
                  (c) => c.id === cid && canSelectCandidateForTest(current.experiment, c, false),
                ),
            )
          )
            throw Error('候选资格已变化，请重新核对。');
          entry = {
            id,
            action,
            body: {
              candidateIds: selected,
              selectedCandidateId: preferred,
              expectedStage: 'awaiting_finalization',
            },
          };
        }
        entry = parseExperimentAction(entry);
        if (
          !(await confirmAction(
            action === 'finalize' ? '锁定并进行封存测试？' : '确认实验操作？',
            action === 'clone'
              ? '克隆会创建新实验并消费上述模型与预算，请核对未知费用确认。'
              : `实验 ${current.experiment.name}；请核对当前输入。`,
          ))
        )
          return;
        await AsyncStorage.setItem(key, JSON.stringify(entry));
        await pending.refetch();
      }
      if (entry.action === 'rename') {
        if (current.experiment.name !== entry.body.name)
          await optimization.rename(id, entry.body.name);
      } else if (entry.action === 'clone') {
        const result = await optimization.clone(id, cloneExperimentInput(entry));
        setCloned(result.id);
      } else if (entry.action === 'cancel') {
        if (!['succeeded', 'failed', 'cancelled'].includes(current.experiment.status))
          await optimization.cancel(id);
      } else if (current.experiment.stage === 'awaiting_finalization')
        await optimization.finalize(id, entry.body);
      else if (
        !entry.body.candidateIds.every((cid) =>
          current.experiment.lockedCandidateIds?.includes(cid),
        )
      )
        throw Error('实验阶段已变化，锁定集合与原请求不一致，保留凭据。');
      await AsyncStorage.removeItem(key);
      await pending.refetch();
      await query.refetch();
      setMessage('实验操作已确认，当前状态已重新读取。');
    },
    { refresh: false },
  );
  const execute = (action: 'rename' | 'clone' | 'cancel' | 'finalize' | 'resume') =>
    void command.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  const data = query.data;
  const locked = command.isPending || !!pending.data || query.isError || !pending.isSuccess;
  return {
    data,
    query,
    pending,
    name,
    locked,
    setName,
    execute,
    ack,
    setAck,
    command,
    cloned,
    navigation,
    setPlanVersion,
    selected,
    setSelected,
    setPreferred,
    preferred,
    planVersion,
    plan,
    message,
  };
}
export function OptimizationDetailScreen({ id }: { id: string }) {
  const state = useOptimizationDetailController({ id });
  const {
    data,
    query,
    pending,
    name,
    locked,
    setName,
    execute,
    ack,
    setAck,
    command,
    cloned,
    navigation,
    setPlanVersion,
    selected,
    setSelected,
    setPreferred,
    preferred,
    planVersion,
    plan,
    message,
  } = state;
  return (
    <Page title={data?.experiment.name ?? '实验详情'}>
      <QueryStatus query={query} retry={() => void query.refetch()} />
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      {data ? (
        <>
          <Section title={optimizationStatusLabels[data.experiment.status] ?? '状态待核对'}>
            <Copy>
              实验 {id} · 基线版本 {data.experiment.baselineStrategyVersionId}
            </Copy>
            <Copy>{data.note}</Copy>
            <Copy>
              费用状态：{data.experiment.costSummary.knownAmount ?? '未知'}{' '}
              {data.experiment.costSummary.currency ?? ''}
            </Copy>
            <Copy>停止原因 {data.experiment.stopReason ?? '无'} · 模型用量以操作记录为准</Copy>
            <Copy>来源 {JSON.stringify(data.experiment.source ?? null)}</Copy>
            <Copy>交易成本假设 {JSON.stringify(data.experiment.tradingCost)}</Copy>
          </Section>
          <Field label="实验新名称或克隆名称" value={name} editable={!locked} onChange={setName} />
          <Action
            label="确认修改实验名称"
            disabled={locked || !name.trim()}
            onPress={() => execute('rename')}
          />
          <Choices
            label="克隆未知费用确认"
            value={ack}
            disabled={locked}
            onChange={setAck}
            options={[
              { value: 'no', label: '尚未确认' },
              { value: 'yes', label: '接受克隆实验的未知费用' },
            ]}
          />
          <Action label="克隆当前实验" disabled={locked} onPress={() => execute('clone')} />
          <Action
            label="取消当前实验"
            disabled={
              locked || ['succeeded', 'failed', 'cancelled'].includes(data.experiment.status)
            }
            onPress={() => execute('cancel')}
          />
          {pending.data ? (
            <Section title="原实验操作待确认">
              <Copy>
                {
                  (
                    { clone: '克隆', rename: '改名', cancel: '取消', finalize: '锁定候选' } as const
                  )[pending.data.action]
                }{' '}
                · {id}
              </Copy>
              <Action
                label="找回原实验操作"
                disabled={command.isPending}
                onPress={() => execute('resume')}
              />
            </Section>
          ) : null}
          {cloned ? (
            <Action
              label="打开克隆实验"
              onPress={() => navigation.navigate('OptimizationResults', { id: cloned })}
            />
          ) : null}
          <Section title="基线指标">
            <Copy>
              {JSON.stringify(
                canRevealTestMetrics(data.experiment)
                  ? data.baseline.metrics
                  : {
                      development: data.baseline.metrics.development,
                      validation: data.baseline.metrics.validation,
                    },
                null,
                2,
              )}
            </Copy>
            <Copy>基线 Run {JSON.stringify(data.baseline.runRefs)}</Copy>
            <Action
              label="读取基线监控计划"
              onPress={() => setPlanVersion(data.experiment.baselineStrategyVersionId)}
            />
          </Section>
          {data.candidates.map((candidate) => {
            const adoptionReason = candidateAdoptionEligibility(data.experiment, candidate);
            return (
              <Section key={candidate.id} title={`候选 ${candidate.candidateNumber}`}>
                <Copy>
                  模型 {candidate.modelKey} · 版本 {candidate.candidateStrategyVersionId}
                </Copy>
                <Copy>来源 {JSON.stringify(candidate.source ?? null)}</Copy>
                <Copy>
                  {JSON.stringify(
                    canRevealTestMetrics(data.experiment, candidate)
                      ? candidate.metrics
                      : {
                          development: candidate.metrics.development,
                          validation: candidate.metrics.validation,
                        },
                    null,
                    2,
                  )}
                </Copy>
                <Copy>差异 {JSON.stringify(candidate.diff, null, 2)}</Copy>
                <Copy>Run {JSON.stringify(candidate.runRefs)}</Copy>
                <Action
                  label={`${selected.includes(candidate.id) ? '取消锁定' : '锁定'}候选 ${candidate.candidateNumber}`}
                  disabled={
                    locked ||
                    (!selected.includes(candidate.id) && selected.length >= 3) ||
                    !canSelectCandidateForTest(data.experiment, candidate, false)
                  }
                  onPress={() => {
                    setSelected((v) =>
                      v.includes(candidate.id)
                        ? v.filter((cid) => cid !== candidate.id)
                        : [...v, candidate.id],
                    );
                    setPreferred('');
                  }}
                />
                <Action
                  label={`读取候选 ${candidate.candidateNumber} 监控计划`}
                  onPress={() => setPlanVersion(candidate.candidateStrategyVersionId)}
                />
                {adoptionReason ? <Copy muted>{adoptionReason}</Copy> : null}
                <Action
                  label={`审核采用候选 ${candidate.candidateNumber}`}
                  disabled={locked || !!adoptionReason}
                  onPress={() =>
                    navigation.navigate('OptimizationAdoption', { id, candidateId: candidate.id })
                  }
                />
              </Section>
            );
          })}
          {selected.length ? (
            <>
              <Choices
                label="封存测试预选候选"
                value={preferred}
                disabled={locked}
                onChange={setPreferred}
                options={data.candidates
                  .filter((c) => selected.includes(c.id))
                  .map((c) => ({ value: c.id, label: `候选 ${c.candidateNumber}` }))}
              />
              <Action
                label="确认锁定并进行封存测试"
                disabled={locked || !preferred || data.experiment.stage !== 'awaiting_finalization'}
                onPress={() => execute('finalize')}
              />
            </>
          ) : null}
          {planVersion ? (
            <>
              <QueryStatus query={plan} retry={() => void plan.refetch()} />
              {plan.data ? (
                <Section title="策略监控计划">
                  <Copy>{JSON.stringify(plan.data, null, 2)}</Copy>
                </Section>
              ) : null}
            </>
          ) : null}
          <Section title="模型执行与费用记录">
            {data.attempts.map((attempt) => (
              <Copy key={attempt.id}>
                {attempt.modelKey} ·{' '}
                {(
                  {
                    succeeded: '成功',
                    failed: '失败',
                    running: '运行中',
                    queued: '排队中',
                    cancelled: '已取消',
                  } as Record<string, string>
                )[attempt.status] ?? '待核对'}{' '}
                · 输入 {attempt.inputTokens ?? '未知'} / 输出 {attempt.outputTokens ?? '未知'} ·
                费用 {attempt.cost ?? '未知'} · {attempt.error ?? ''}
              </Copy>
            ))}
          </Section>
        </>
      ) : null}
      <Feedback message={message} error={command.isError} />
    </Page>
  );
}
