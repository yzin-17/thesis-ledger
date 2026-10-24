import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { aiResearchStartInputSchema, type AiResearchRetryPrefill } from '@thesis-ledger/schemas';
import { researchRetryIssue } from './retry-readiness';
import { researchScopeLabels } from './ResearchObjects';
import { useDirtyForm, useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import type { ResearchStackParams } from '../../app/navigation-types';
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
export function ResearchRetryScreen({ runId }: { runId: string }) {
  const { api, scope, baseUrl, mode } = useMobileRuntime();
  const client = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<ResearchStackParams>>();
  const key = JSON.stringify(['mobile-research-retry-v1', baseUrl, mode, runId]);
  const pending = useQuery({
    queryKey: [...scope, 'research-retry-pending', runId],
    queryFn: () => AsyncStorage.getItem(key),
    retry: false,
  });
  const prefill = useQuery({
    queryKey: [...scope, 'research-retry-prefill', runId],
    queryFn: ({ signal }) => api.researchRuns.retryPrefill(runId, signal),
    retry: false,
  });
  const settings = useQuery({
    queryKey: [...scope, 'research-settings'],
    queryFn: ({ signal }) => api.researchRuns.settings(signal),
    retry: false,
  });
  const capabilities = useQuery({
    queryKey: [...scope, 'ai-capabilities'],
    queryFn: ({ signal }) => api.researchRuns.capabilities(signal),
    retry: false,
  });
  const [question, setQuestion] = useState<string>();
  const [confirmed, setConfirmed] = useState('no');
  const [acknowledged, setAcknowledged] = useState('no');
  const [uncertain, setUncertain] = useState<boolean>();
  const [message, setMessage] = useState<string | null>(null);
  const source = prefill.data;
  const effectiveQuestion = question ?? source?.question ?? '';
  const unknown = uncertain ?? Boolean(pending.data);
  useDirtyForm(Boolean(question), () => setQuestion(undefined));
  const revision = settings.data?.revision;
  const issue = researchRetryIssue({
    source,
    mode,
    confirmed: confirmed === 'yes',
    acknowledged: acknowledged === 'yes',
    modelReady: Boolean(settings.data?.researchDefault) && !settings.isError,
    capabilityReady: capabilities.data?.canStart === true && !capabilities.isError,
  });
  const command = useMobileCommand(
    async () => {
      if (!source || !revision || issue) throw new Error(issue ?? '请重新核对模型设置。');
      const input = aiResearchStartInputSchema.parse({
        question: effectiveQuestion,
        context: source.context,
        retryOfRunId: source.sourceRunId,
        ...(source.templateId ? { templateId: source.templateId } : {}),
        researchSettingsRevision: revision,
        retryConfirmation: {
          contextConfirmed: true as const,
          acknowledgeUnknownOutcomeRisk: acknowledged === 'yes',
        },
      });
      await AsyncStorage.setItem(key, JSON.stringify(input));
      client.setQueryData([...scope, 'research-retry-pending', runId], JSON.stringify(input));
      setUncertain(true);
      const receipt = await api.researchRuns.create(input);
      await AsyncStorage.removeItem(key);
      client.setQueryData([...scope, 'research-retry-pending', runId], null);
      void client.invalidateQueries({ queryKey: [...scope, 'research-list'] });
      setUncertain(false);
      navigation.navigate('ResearchReport', { id: receipt.id, locator: { view: 'legacy' } });
    },
    { refresh: false },
  );
  return (
    <Page title="再次生成预填">
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      <QueryStatus query={prefill} retry={() => void prefill.refetch()} />
      <QueryStatus query={settings} retry={() => void settings.refetch()} />
      <QueryStatus query={capabilities} retry={() => void capabilities.refetch()} />
      <RetrySourceSummary source={source} mode={mode} />
      {unknown ? (
        <Section title="上次请求结果尚未确认">
          <Copy>已保留原输入。请先返回任务历史检查是否已创建，避免自动重复生成。</Copy>
          <Action
            label="核对后允许再次提交"
            onPress={() =>
              void confirmAction(
                '确认再次提交？',
                '原请求结果未知，可能产生重复任务及调用费用。',
              ).then((ok) => {
                if (ok) setUncertain(false);
              })
            }
          />
        </Section>
      ) : null}
      <Field
        label="再次生成问题"
        value={effectiveQuestion}
        onChange={setQuestion}
        editable={!command.isPending && !unknown}
        multiline
      />
      <Choices
        label="核对原范围"
        value={confirmed}
        onChange={setConfirmed}
        options={[
          { value: 'no', label: '尚未确认' },
          { value: 'yes', label: '已核对原范围' },
        ]}
      />
      {source?.requiresUnknownOutcomeAcknowledgement ? (
        <Choices
          label="重复生成风险"
          value={acknowledged}
          onChange={setAcknowledged}
          options={[
            { value: 'no', label: '尚未确认风险' },
            { value: 'yes', label: '确认可能重复生成' },
          ]}
        />
      ) : null}
      <Action
        label="确认并再次生成"
        disabled={
          command.isPending || unknown || !pending.isSuccess || pending.isError || Boolean(issue)
        }
        onPress={() =>
          void command.mutateAsync(undefined).catch((e) => setMessage(failureMessage(e)))
        }
      />
      <Feedback message={message} error />
    </Page>
  );
}
function RetrySourceSummary({
  source,
  mode,
}: {
  source: AiResearchRetryPrefill | undefined;
  mode: 'actual' | 'shadow';
}) {
  if (!source) return null;
  const wrongMode = source.context.mode && source.context.mode !== mode;
  return (
    <Section title="来源任务">
      <Copy>{source.sourceRunId}</Copy>
      <Copy>原问题：{source.question}</Copy>
      <Copy>
        范围 {researchScopeLabels[source.context.scope]} · 账户{' '}
        {source.context.accountId ?? '全范围'}
      </Copy>
      {source.contextState !== 'valid' || wrongMode ? (
        <Copy>原范围缺失、无权读取或与当前模式不一致，不能再次提交。</Copy>
      ) : null}
    </Section>
  );
}
