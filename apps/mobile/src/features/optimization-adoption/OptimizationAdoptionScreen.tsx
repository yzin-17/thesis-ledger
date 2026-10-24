import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { candidateAdoptionEligibility, optimizationAdoptSchema } from '@thesis-ledger/schemas';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
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
export function OptimizationAdoptionScreen() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'OptimizationAdoption'>>();
  const { api, scope, baseUrl } = useMobileRuntime();
  const optimization = api.strategy.optimization;
  const cache = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const [ack, setAck] = useState('no');
  const [message, setMessage] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [receipt, setReceipt] = useState<{ strategyId: string; versionId: string } | null>(null);
  const key = JSON.stringify([
    'mobile-optimization-adoption-v1',
    baseUrl,
    params.id,
    params.candidateId,
  ]);
  const compare = useQuery({
    queryKey: [...scope, 'optimization-detail', params.id],
    queryFn: ({ signal }) => optimization.compare(params.id, signal),
    retry: false,
  });
  const candidate = compare.data?.candidates.find((v) => v.id === params.candidateId);
  const reason =
    compare.data && candidate
      ? candidateAdoptionEligibility(compare.data.experiment, candidate)
      : '尚未核对当前候选';
  const context = useQuery({
    queryKey: [...scope, 'optimization-adoption-context', params],
    enabled: compare.isSuccess && !reason,
    queryFn: ({ signal }) => optimization.adoptionContext(params.id, params.candidateId, signal),
    retry: false,
  });
  const pending = useQuery({
    queryKey: [...scope, 'optimization-adoption-pending', params],
    queryFn: async () => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const body = optimizationAdoptSchema.parse(JSON.parse(raw));
      if (body.candidateId !== params.candidateId) throw Error('采用凭据与当前候选不一致。');
      return body;
    },
    retry: false,
  });
  const command = useMobileCommand(
    async (action: 'adopt' | 'review') => {
      if (action === 'review') {
        if (!rejected) throw Error('原请求尚未确认拒绝，不能丢弃采用凭据。');
        await AsyncStorage.removeItem(key);
        await pending.refetch();
        await compare.refetch();
        await context.refetch();
        setAck('no');
        setRejected(false);
        return;
      }
      let body = pending.data;
      if (!body) {
        if (reason || !context.data || context.isError || compare.isError || ack !== 'yes')
          throw Error('请核对当前候选、版本关系与三方差异。');
        if (
          !(await confirmAction(
            '确认采用候选？',
            `当前正式版本 ${context.data.expectedStrategyVersion}；将创建新的正式策略版本，风险应用不会自动启用。`,
          ))
        )
          return;
        body = optimizationAdoptSchema.parse({
          candidateId: params.candidateId,
          candidateHash: context.data.candidate.executionHash,
          expectedStrategyVersion: context.data.expectedStrategyVersion,
          idempotencyKey: randomUUID(),
          acknowledgeTestExposure: true,
        });
        await AsyncStorage.setItem(key, JSON.stringify(body));
        await pending.refetch();
      }
      try {
        const result = await optimization.adopt(params.id, body);
        setReceipt({
          strategyId: result.strategyVersion.strategyId,
          versionId: result.strategyVersion.id,
        });
        await AsyncStorage.removeItem(key);
        await pending.refetch();
        await cache.invalidateQueries({ queryKey: [...scope, 'strategy-library'] });
        setMessage(
          `正式版本 ${result.strategyVersion.version} 已保存；监控计划 ${result.monitoringPlan.planHash}，风险应用升级需另行预览确认。`,
        );
      } catch (error) {
        if (error instanceof ThesisLedgerApiError) {
          const rawCode = error.payload?.errorCode ?? error.payload?.code ?? error.payload?.error;
          const code = typeof rawCode === 'string' ? rawCode : '';
          setRejected(
            [
              'ADOPTION_NOT_REVEALED',
              'ADOPTION_NOT_ELIGIBLE',
              'ADOPTION_CANDIDATE_HASH_MISMATCH',
              'ADOPTION_SOURCE_MISMATCH',
              'ADOPTION_STALE_BASELINE',
            ].includes(code),
          );
        }
        throw error;
      }
    },
    { refresh: false },
  );
  const execute = (action: 'adopt' | 'review') =>
    void command.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  return (
    <Page title="审核采用候选">
      <Copy>
        实验 {params.id} · 候选 {params.candidateId}
      </Copy>
      <QueryStatus query={compare} retry={() => void compare.refetch()} />
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      {reason ? (
        <Copy>{reason}</Copy>
      ) : (
        <QueryStatus query={context} retry={() => void context.refetch()} />
      )}
      {context.data ? (
        <>
          <Section title="版本关系与三方差异">
            <Copy>预期正式版本 {context.data.expectedStrategyVersion}</Copy>
            <Copy>
              基线 {context.data.baseline.id} · 当前 {context.data.current?.id ?? '尚无正式版本'}
            </Copy>
            <Copy>候选指纹 {context.data.candidate.executionHash}</Copy>
            <Copy>候选与基线 {JSON.stringify(context.data.candidateVsBaseline, null, 2)}</Copy>
            <Copy>候选与当前 {JSON.stringify(context.data.candidateVsCurrent, null, 2)}</Copy>
          </Section>
          <Section title="候选完整定义">
            <Copy>{JSON.stringify(context.data.candidate.schema, null, 2)}</Copy>
          </Section>
          <Choices
            label="候选采用确认"
            value={ack}
            disabled={command.isPending || !!pending.data}
            onChange={setAck}
            options={[
              { value: 'no', label: '尚未确认' },
              { value: 'yes', label: '已核对定义、差异与测试结果揭示' },
            ]}
          />
        </>
      ) : null}
      {pending.data ? (
        <Section title="原采用待确认">
          <Copy>
            预期版本 {pending.data.expectedStrategyVersion} · 标识 {pending.data.idempotencyKey}
          </Copy>
          <Copy>找回将复用原候选指纹、版本与提交标识。</Copy>
        </Section>
      ) : null}
      <Action
        label={pending.data ? '找回原候选采用' : '确认采用候选'}
        primary
        disabled={
          command.isPending ||
          !!receipt ||
          !pending.isSuccess ||
          (!pending.data && (!!reason || !context.isSuccess || ack !== 'yes'))
        }
        onPress={() => execute('adopt')}
      />
      {rejected ? (
        <Action
          label="重新审核被拒绝的采用请求"
          disabled={command.isPending}
          onPress={() => execute('review')}
        />
      ) : null}
      <Feedback message={message} error={command.isError} />
      {receipt ? (
        <Action
          label="打开采用后的正式版本"
          onPress={() => navigation.navigate('StrategyVersion', receipt)}
        />
      ) : null}
    </Page>
  );
}
