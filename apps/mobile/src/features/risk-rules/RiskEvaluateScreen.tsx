import { useRef, useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import type { RiskTestResultsWire } from '@thesis-ledger/schemas';
import type { PortfolioStackParams } from '../../app/navigation-types';
import { confirmAction, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand, useValuation } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import {
  Action,
  Copy,
  Feedback,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { useRiskRules } from './risk-queries';
import { mobileRiskContexts } from './risk-context';
export function RiskEvaluateScreen() {
  const { params } = useRoute<RouteProp<PortfolioStackParams, 'RiskEvaluate'>>();
  const { api, scope, mode } = useMobileRuntime();
  const rules = useRiskRules();
  const valuation = useValuation();
  const routing = useQuery({
    queryKey: [...scope, 'notification-routing'],
    queryFn: ({ signal }) => api.risk.getRouting(signal),
  });
  const rule = rules.data?.find((row) => row.id === params.ruleId);
  const [test, setTest] = useState<{ version: number; results: RiskTestResultsWire } | null>(null);
  const [scan, setScan] = useState<{
    scanId: string;
    results: Array<{ ruleId: string; eventId?: string; error?: string }>;
  } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const prepared = useRef<{ key: string; scanId: string } | null>(null);
  const contexts = valuation.data ? mobileRiskContexts(valuation.data) : [];
  const trial = Boolean(params.ruleId);
  const mutation = useMobileCommand(async () => {
    if (trial) {
      if (!rule) throw new Error('规则不可读取。');
      return {
        kind: 'test' as const,
        version: rule.version,
        results: await api.risk.testRule(rule.id, contexts),
      };
    }
    const key = JSON.stringify(contexts);
    if (prepared.current?.key !== key) prepared.current = { key, scanId: Crypto.randomUUID() };
    return {
      kind: 'scan' as const,
      result: await api.risk.scan({
        security: contexts,
        scanId: prepared.current.scanId,
        allowStale: false,
      }),
    };
  });
  const blocked =
    mutation.isPending ||
    !canUseReadForWrite(rules) ||
    !canUseReadForWrite(valuation) ||
    contexts.length === 0 ||
    Boolean(trial && (!rule || rule.needsRepair || rule.archivedAt)) ||
    (!trial && !canUseReadForWrite(routing));
  const submit = async () => {
    if (blocked) return;
    const message = trial
      ? '试算验证当前规则并记录测试审计，不外发通知。'
      : '扫描会写入风险事件；模拟范围不外发，实际范围按已配置路由处理通知。';
    if (!(await confirmAction(trial ? '开始规则试算？' : '扫描当前范围？', message))) return;
    try {
      const result = await mutation.mutateAsync(undefined);
      if (result.result.kind === 'test')
        setTest({ version: result.result.version, results: result.result.results });
      else {
        setScan(result.result.result);
        prepared.current = null;
      }
      setFeedback(
        result.refreshFailed ? '操作已成功，相关数据尚未刷新，请先核对结果。' : '操作已完成。',
      );
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page title={trial ? '规则试算' : '风险扫描'}>
      <Copy>
        {mode === 'shadow' ? '模拟范围' : '实际范围'} · {contexts.length} 个持仓上下文
      </Copy>
      <Copy muted>输入使用当前组合估值，缺失或陈旧信息继续交由服务端拒绝或明确标记。</Copy>
      <QueryStatus query={rules} retry={() => void rules.refetch()} />
      <QueryStatus query={valuation} retry={() => void valuation.refetch()} />
      <QueryStatus query={routing} retry={() => void routing.refetch()} />
      <Copy muted>
        通知路由 {routing.isError ? '读取失败，状态未知' : `${routing.data?.routes.length ?? 0} 条`}
      </Copy>
      <Feedback message={feedback} error={mutation.isError} />
      <Action
        label={trial ? '执行规则试算' : '执行风险扫描'}
        primary
        disabled={blocked}
        onPress={() => void submit()}
      />
      {test ? (
        <Section title={`试算结果 · 规则版本 ${test.version}`}>
          {rule?.version !== test.version ? (
            <Copy muted>规则版本已变化，以下保留此前结果。</Copy>
          ) : null}
          {!test.results.length ? <Copy>没有可评估的匹配上下文。</Copy> : null}
          {test.results.map((row, index) => (
            <Copy key={row.id ?? index}>
              {row.triggered ? '触发' : '未触发'} · {row.message ?? '请核对上下文'}
            </Copy>
          ))}
        </Section>
      ) : null}
      {scan ? (
        <Section title="扫描结果">
          <Copy muted>扫描标识 {scan.scanId}</Copy>
          {!scan.results.length ? <Copy>本轮未产生新的评估记录。</Copy> : null}
          {scan.results.map((row, index) => (
            <Section key={`${row.ruleId}:${index}`}>
              <Copy>
                规则 {row.ruleId} · 事件 {row.eventId ?? '未写入'}
              </Copy>
              {row.error ? <Feedback message={row.error} error /> : null}
            </Section>
          ))}
        </Section>
      ) : null}
    </Page>
  );
}
