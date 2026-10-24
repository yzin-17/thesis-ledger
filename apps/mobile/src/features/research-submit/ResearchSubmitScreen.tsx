import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { normalizeResearchSubmissionV2, type ResearchSubmissionV2 } from '@thesis-ledger/schemas';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
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
import { ResearchObjects, researchScopeLabels } from './ResearchObjects';
import { readResearchPending, researchPendingKey, saveResearchPending } from './research-pending';
import { ResearchRetryScreen } from './ResearchRetryScreen';
const noRunCodes = new Map([
  ['RESEARCH_V2_WRITES_DISABLED', 400],
  ['RESEARCH_INPUT_BUDGET_EXCEEDED', 400],
  ['RESEARCH_REQUIRED_EVIDENCE_UNAVAILABLE', 400],
  ['RESEARCH_SETTINGS_REVISION_CHANGED', 409],
]);
export function ResearchSubmitScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'ResearchSubmit'>>();
  if (params?.retryRunId) return <ResearchRetryScreen runId={params.retryRunId} />;
  return <ResearchNewScreen />;
}
export function ResearchNewScreen() {
  const { api, scope, baseUrl, mode } = useMobileRuntime();
  const client = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<ResearchStackParams>>();
  const key = researchPendingKey(baseUrl, mode);
  const restored = useQuery({
    queryKey: [...scope, 'research-pending'],
    queryFn: () => readResearchPending(key),
    retry: false,
    staleTime: Infinity,
  });
  const [pending, setPending] = useState<ResearchSubmissionV2 | null>();
  const effectivePending = pending === undefined ? restored.data : pending;
  const [selection, setSelection] = useState<ResearchSubmissionV2['scope']>({
    scope: 'instrument',
    instrumentId: '',
  });
  const [question, setQuestion] = useState('');
  const [templateId, setTemplate] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const capabilities = useQuery({
    queryKey: [...scope, 'research-capabilities'],
    queryFn: ({ signal }) => api.research.capabilities(signal),
    retry: false,
    staleTime: 15000,
  });
  const settings = useQuery({
    queryKey: [...scope, 'research-settings'],
    queryFn: ({ signal }) => api.researchRuns.settings(signal),
    retry: false,
    staleTime: 15000,
  });
  const model = settings.data?.researchDefault;
  const candidate = settings.data?.candidates.find(
    (c) => c.providerId === model?.providerId && c.model === model?.model,
  );
  const modelReady = Boolean(model && candidate?.enabled);
  useDirtyForm(Boolean(question || effectivePending), () => {
    setQuestion('');
  });
  const submit = useMobileCommand(
    async (action: 'submit' | 'find' | 'cancel') => {
      let input = effectivePending;
      if (!input) {
        if (
          !modelReady ||
          !capabilities.data?.canCreate ||
          capabilities.isError ||
          settings.isError
        )
          throw new Error('研究预检未通过，请先核对当前模型与能力。');
        input = normalizeResearchSubmissionV2({
          version: 2,
          submissionId: randomUUID(),
          mode,
          scope: selection,
          question,
          ...(templateId ? { templateId } : {}),
          researchSettingsRevision: settings.data!.revision,
        });
        if (!capabilities.data.scopes.includes(input.scope.scope))
          throw new Error('当前研究范围不可用。');
      }
      await saveResearchPending(key, input);
      client.setQueryData([...scope, 'research-pending'], input);
      setPending(input);
      try {
        const receipt = await api.research[action](input);
        await saveResearchPending(key, null);
        client.setQueryData([...scope, 'research-pending'], null);
        void client.invalidateQueries({ queryKey: [...scope, 'research-list'] });
        setPending(null);
        setQuestion('');
        setMessage(`服务端已确认：${receipt.runId}`);
        navigation.navigate('ResearchReport', {
          id: receipt.runId,
          locator: { view: 'scoped', mode, scope: 'all' },
        });
      } catch (error) {
        if (
          action === 'submit' &&
          error instanceof ThesisLedgerApiError &&
          noRunCodes.get(String(error.payload?.errorCode ?? error.payload?.error)) === error.status
        ) {
          await saveResearchPending(key, null);
          client.setQueryData([...scope, 'research-pending'], null);
          setPending(null);
        }
        throw error;
      }
    },
    { refresh: false },
  );
  const execute = (action: 'submit' | 'find' | 'cancel') =>
    void submit.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  return (
    <Page title="新建研究">
      <QueryStatus query={restored} retry={() => void restored.refetch()} />
      <Section title="提交前预检">
        <QueryStatus query={capabilities} retry={() => void capabilities.refetch()} />
        <QueryStatus query={settings} retry={() => void settings.refetch()} />
        <Copy>当前默认模型：{model ? `${model.providerId} / ${model.model}` : '未配置'}</Copy>
        <Copy>{capabilities.data?.canCreate ? '研究写入可用' : '研究写入受控，未提交任务'}</Copy>
        {!modelReady ? <Copy>当前模型未满足启用、健康或价格配置要求。</Copy> : null}
      </Section>
      {effectivePending ? (
        <Section title="继续确认原提交">
          <Copy>{effectivePending.question}</Copy>
          <Copy>提交标识 {effectivePending.submissionId}</Copy>
          <Copy muted>响应尚未确认。找回或原样重试复用同一标识及原始输入。</Copy>
          <Action label="找回原提交" disabled={submit.isPending} onPress={() => execute('find')} />
          <Action label="原样重试" disabled={submit.isPending} onPress={() => execute('submit')} />
          <Action
            label="取消已提交任务"
            disabled={submit.isPending}
            onPress={() => execute('cancel')}
          />
        </Section>
      ) : (
        <>
          <Choices
            label="研究范围"
            value={selection.scope}
            disabled={submit.isPending}
            options={Object.entries(researchScopeLabels).map(([value, label]) => ({
              value: value as ResearchSubmissionV2['scope']['scope'],
              label,
              disabled: capabilities.data
                ? !capabilities.data.scopes.includes(
                    value as ResearchSubmissionV2['scope']['scope'],
                  )
                : true,
            }))}
            onChange={(value) => {
              if (value === 'instrument') setSelection({ scope: value, instrumentId: '' });
              else if (value === 'account') setSelection({ scope: value, accountId: '' });
              else if (value === 'position')
                setSelection({ scope: value, accountId: '', symbol: '' });
              else if (value === 'strategy') setSelection({ scope: value, strategyVersionId: '' });
              else setSelection({ scope: value });
            }}
          />
          <ResearchObjects value={selection} onChange={setSelection} disabled={submit.isPending} />
          <Field
            label="研究问题"
            value={question}
            onChange={setQuestion}
            editable={!submit.isPending}
            multiline
          />
          <Choices
            label="问题模板"
            value={templateId}
            options={Object.entries({
              '': '自定义问题',
              'primary-risks': '主要风险',
              'recent-changes': '近期变化',
              'counter-evidence': '反面证据',
              'stress-scenario': '压力情景',
            }).map(([value, label]) => ({ value, label }))}
            onChange={setTemplate}
          />
          <Action
            label="准备并提交研究"
            disabled={
              submit.isPending ||
              !restored.isSuccess ||
              restored.isError ||
              !modelReady ||
              !capabilities.data?.canCreate ||
              capabilities.isError ||
              settings.isError ||
              !question.trim()
            }
            onPress={() => execute('submit')}
          />
        </>
      )}
      <Feedback message={message} error={submit.isError} />
    </Page>
  );
}
