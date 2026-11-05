import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AiProviderRecord } from '@thesis-ledger/schemas';
import { randomUUID } from 'expo-crypto';
import type { SettingsStackParams } from '../../app/navigation-types';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import {
  Action,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import { useConfigCommand } from '../configuration/use-config-command';
import { aiProviderDraft, buildAiProviderInput } from './ai-provider-draft';
import { AiProviderFields } from './AiProviderFields';

function EditorForm({
  row,
  readable,
  reload,
}: {
  row?: AiProviderRecord;
  readable: boolean;
  reload: (name: string) => Promise<AiProviderRecord | undefined>;
}) {
  const { api } = useMobileRuntime();
  const [saved, setSaved] = useState(row);
  const [draft, setDraft] = useState(() => aiProviderDraft(row));
  const [baseline, setBaseline] = useState(() => JSON.stringify(aiProviderDraft(row)));
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const command = useConfigCommand();
  const blocked = command.pending || !readable;
  const operation = useRef<{ controller: AbortController; id: string } | null>(null);
  useEffect(
    () => () => {
      operation.current?.controller.abort();
      operation.current = null;
    },
    [],
  );
  const discard = () => {
    setDraft(aiProviderDraft(saved));
    setApiKey('');
    setModels([]);
  };
  const adoptLatest = async () => {
    if (
      !saved ||
      !(await confirmAction('采用服务端 AI 配置？', '未保存输入将被最新配置替换，凭证输入将清空。'))
    )
      return;
    setApiKey('');
    try {
      const latest = await reload(saved.name);
      if (!latest) {
        setMessage('该来源已不存在，请返回列表。');
        return;
      }
      setSaved(latest);
      setDraft(aiProviderDraft(latest));
      setBaseline(JSON.stringify(aiProviderDraft(latest)));
      setMessage('已采用服务端最新配置，可重新编辑。');
    } catch {
      setMessage('最新配置读取失败，当前非敏感输入仍保留。');
    }
  };
  useDirtyForm(Boolean(apiKey) || JSON.stringify(draft) !== baseline, discard);
  const act = async (kind: 'save' | 'test' | 'models') => {
    setMessage('');
    setApiKey('');
    const controller = new AbortController();
    const id = randomUUID();
    operation.current = { controller, id };
    try {
      await command.submit(async () => {
        if (kind === 'models') {
          const result = await api.aiProviders.models(
            {
              name: saved?.name,
              baseUrl: draft.baseUrl,
              authMode: draft.authMode,
              upstreamFormat: draft.upstreamFormat,
              ...(draft.authMode === 'api_key' && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
            },
            controller.signal,
          );
          setModels(result.models);
          setMessage(`已读取 ${result.models.length} 个模型，请选择加入。`);
          return;
        }
        const input = buildAiProviderInput(draft, apiKey, saved);
        if (kind === 'test') {
          const result = await api.aiProviders.testDraft(
            { ...input, testKind: 'connection', requestId: id },
            controller.signal,
          );
          setMessage(`连接检查：${result.status}；${result.message}。业务用途须单独验证。`);
          return;
        }
        const plan = await api.aiProviders.validationPlan(input, controller.signal);
        let result: AiProviderRecord;
        if (plan.pending.length) {
          const costs =
            plan.estimatedCosts.map((cost) => `${cost.currency} ${cost.amount}`).join('、') ||
            '费用未知';
          const approved = await confirmAction(
            '授权测试并保存？',
            `待验证 ${plan.pending.length} 个模型用途，最多 ${plan.maxCalls} 次调用；每次最多 ${plan.maxOutputTokensPerCall} Token，总期限 ${plan.maxDurationSeconds} 秒；估算 ${costs}。失败不会覆盖原配置。`,
          );
          if (!approved || controller.signal.aborted) {
            setMessage('已取消，原配置未修改。');
            return;
          }
          result = await api.aiProviders.testAndSave(
            input,
            {
              operationId: id,
              planFingerprint: plan.planFingerprint,
              authorized: true,
              maxCalls: plan.maxCalls,
              allowTextFallback: false,
            },
            controller.signal,
          );
        } else result = await api.aiProviders.save(input, controller.signal);
        setSaved(result);
        setDraft(aiProviderDraft(result));
        setBaseline(JSON.stringify(aiProviderDraft(result)));
        setMessage('配置已保存。用途就绪与实时验证结果请返回列表查看。');
      });
    } catch (error) {
      if (controller.signal.aborted) setMessage('已取消等待，请重新读取服务端状态。');
      else setMessage(error instanceof Error ? error.message : '操作未完成。');
    } finally {
      setApiKey('');
      operation.current = null;
    }
  };
  const cancel = async () => {
    const current = operation.current;
    current?.controller.abort();
    setApiKey('');
    if (current && draft.name.trim()) {
      await Promise.allSettled([
        api.aiProviders.cancelValidation(draft.name.trim(), current.id),
        api.aiProviders.cancelTest(draft.name.trim(), current.id),
      ]);
    }
    setMessage('已请求取消，请重新读取服务端状态。');
  };
  return (
    <>
      <Feedback message={message} />
      <AiProviderFields
        draft={draft}
        change={(patch) => {
          if (patch.authMode === 'none') setApiKey('');
          setDraft((value) => ({ ...value, ...patch }));
        }}
        editing={Boolean(saved)}
        disabled={blocked}
      />
      <Section title="凭证与验证">
        <Copy muted>
          {saved?.credentialConfigured
            ? '已配置凭证；留空沿用，填写新值则替换。'
            : '凭证尚未配置。'}{' '}
          敏感值仅保留在当前表单，操作结束后清空。
        </Copy>
        <Field
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          secure
          editable={!blocked && draft.authMode === 'api_key'}
        />
        <Action label="读取模型目录" disabled={blocked} onPress={() => void act('models')} />
        {models.map((model) => (
          <Action
            key={model}
            label={`加入模型 ${model}`}
            disabled={blocked || draft.models.split('\n').includes(model)}
            onPress={() =>
              setDraft((value) => ({
                ...value,
                models: [value.models, model].filter(Boolean).join('\n'),
              }))
            }
          />
        ))}
        <Action label="检查连接" disabled={blocked} onPress={() => void act('test')} />
        <Action
          label={command.pending ? '正在处理…' : '验证并保存配置'}
          primary
          disabled={blocked}
          onPress={() => void act('save')}
        />
        {command.pending ? <Action label="取消当前操作" onPress={() => void cancel()} /> : null}
        <Action label="清除未提交的凭证" onPress={() => setApiKey('')} />
        {saved ? (
          <Action
            label="放弃输入并采用服务端 AI 配置"
            disabled={command.pending}
            onPress={() => void adoptLatest()}
          />
        ) : null}
      </Section>
    </>
  );
}
export function AiProviderEditor({
  route,
}: NativeStackScreenProps<SettingsStackParams, 'AiProviderEditor'>) {
  const { api, scope } = useMobileRuntime();
  const name = route.params?.name;
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'ai'],
    queryFn: ({ signal }) => api.aiProviders.list(signal),
    enabled: Boolean(name),
  });
  const row = query.data?.find((item) => item.name === name);
  return (
    <Page title={name ? '编辑 AI 来源' : '新建 AI 来源'}>
      {name ? <QueryStatus query={query} retry={() => void query.refetch()} /> : null}
      {!name || row ? (
        <EditorForm
          {...(row ? { row } : {})}
          readable={!name || query.isSuccess}
          reload={async (target) => {
            const result = await query.refetch({ throwOnError: true });
            return result.data?.find((item) => item.name === target);
          }}
        />
      ) : null}
      {name && query.isSuccess && !row ? <Copy>该来源已不存在，请返回列表重新读取。</Copy> : null}
    </Page>
  );
}
