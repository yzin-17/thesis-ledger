import { useRef } from 'react';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  backtestRunPreparationResultV3Schema,
  backtestNavPreparationResultV3Schema,
  optimizationRunPreparationResultSchema,
  type StrategySubmissionInput,
  type StrategySubmissionReceipt,
} from '@thesis-ledger/schemas';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import { useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
import {
  Action,
  Copy,
  Section,
  QueryStatus,
  failureMessage,
} from '../../components/MobilePrimitives';
import { BacktestPreparationEvidence } from '../backtest-setup/BacktestPreparationEvidence';

export function useContinuousSubmission() {
  const { api, scope } = useMobileRuntime(),
    client = useQueryClient();
  const last = useRef<{ signature: string; id: string; input: StrategySubmissionInput } | null>(
    null,
  );
  return useMutation({
    mutationFn: ({ signature, input }: { signature: string; input: StrategySubmissionInput }) => {
      if (last.current?.signature !== signature)
        last.current = { signature, id: randomUUID(), input };
      return api.strategySubmissions.submit(last.current.id, last.current.input);
    },
    retry: false,
    onSuccess: () => client.invalidateQueries({ queryKey: [...scope, 'strategy-submissions'] }),
  });
}
const labels = {
  queued: '已登记',
  preparing: '准备中',
  ready: '等待创建',
  creating: '创建中',
  awaiting_confirmation: '待确认',
  submitted: '已提交',
  blocked: '已阻塞',
};
function submissionPreparation(row: StrategySubmissionReceipt) {
  const out =
    row.outcome && typeof row.outcome === 'object' && !Array.isArray(row.outcome)
      ? row.outcome
      : null;
  const target = typeof out?.id === 'string' ? out.id : null;
  const p =
    row.kind === 'nav'
      ? backtestNavPreparationResultV3Schema.safeParse(row.prepared)
      : backtestRunPreparationResultV3Schema.safeParse(row.prepared);
  const opt = optimizationRunPreparationResultSchema.safeParse(row.prepared);
  const diagnostics=(p.success && p.data.status==='blocked' && p.data.diagnostics) ||
    (opt.success && opt.data.status==='blocked' && opt.data.diagnostics) || [];
  return { out, target, p, opt, diagnostics };
}

export function StrategySubmissions() {
  const { api, scope } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const list = useQuery({
    queryKey: [...scope, 'strategy-submissions'],
    queryFn: ({ signal }) => api.strategySubmissions.list(signal),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.some((r) => ['queued', 'ready', 'creating', 'preparing'].includes(r.state))
        ? 3000
        : false,
  });
  const confirm = useMutation({
    mutationFn: (id: string) => api.strategySubmissions.confirm(id),
    retry: false,
    onSuccess: () => void list.refetch(),
  });
  if (list.isSuccess && !list.data.length) return null;
  return (
    <Section title="后台提交">
      <QueryStatus query={list} retry={() => void list.refetch()} />
      {confirm.isError && <Copy>{failureMessage(confirm.error)}</Copy>}
      {list.data?.map((row) => {
        const { out, target, p, opt, diagnostics } = submissionPreparation(row);
        return (
          <Section key={row.id} title={labels[row.state]}>
            <Copy>
              {{ ordinary: '普通回测', nav: '净值回测', optimization: '优化实验' }[row.kind]} ·{' '}
              {new Date(row.createdAt).toLocaleString()}
            </Copy>
            {typeof out?.reason === 'string' && <Copy>{out.reason}</Copy>}
            {diagnostics.map((d,i)=><Copy key={i}>{d.message} {'suggestedActions' in d && d.suggestedActions.map(a=>a.description).join('；')}</Copy>)}
            {row.state === 'awaiting_confirmation' && (
              <>
                {p.success && <BacktestPreparationEvidence value={p.data} />}
                {opt.success && opt.data.status === 'prepared' && (
                  <Copy>
                    冻结于 {opt.data.runConfig.dataAsOf} ·{' '}
                    {opt.data.actualSource.provenance.providerId} /{' '}
                    {opt.data.actualSource.provenance.upstreamSource}
                  </Copy>
                )}
                <Action
                  label="确认冻结输入并创建"
                  disabled={confirm.isPending || (!(p.success && p.data.status==='prepared') && !(opt.success && opt.data.status==='prepared'))}
                  onPress={() =>
                    void confirmAction('确认本次运行？', '按已保存的假设、来源和预算继续。').then(
                      (ok) => {
                        if (ok) confirm.mutate(row.id);
                      },
                    )
                  }
                />
              </>
            )}
            {target && (
              <Action
                label="打开任务"
                onPress={() => {
                  if (row.kind === 'optimization')
                    navigation.navigate('OptimizationResults', { id: target });
                  else navigation.navigate('BacktestResult', { kind: row.kind, id: target });
                }}
              />
            )}
          </Section>
        );
      })}
    </Section>
  );
}
