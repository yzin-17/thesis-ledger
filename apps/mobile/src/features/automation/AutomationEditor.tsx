import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import {
  automationJobTypes,
  automationCreateInputSchema,
  type AutomationRecord,
} from '@thesis-ledger/schemas';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDirtyForm, useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
import type { SettingsStackParams } from '../../app/navigation-types';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import { useConfigCommand } from '../configuration/use-config-command';
import { automationTypeLabel } from './automation-labels';
function draftFrom(row?: AutomationRecord) {
  return {
    name: row?.name ?? '',
    type: row?.type ?? 'provider-health',
    cron: row?.cron ?? '0 9 * * 1-5',
    timezone: row?.timezone ?? 'Asia/Shanghai',
    enabled: row?.enabled ?? false,
  };
}
function Editor({ row }: { row?: AutomationRecord }) {
  const { api, scope } = useMobileRuntime();
  const [id] = useState(() => row?.id ?? randomUUID());
  const [saved, setSaved] = useState(row);
  const [draft, setDraft] = useState(() => draftFrom(row));
  const [baseline, setBaseline] = useState(JSON.stringify(draft));
  const [message, setMessage] = useState('');
  const command = useConfigCommand();
  const current = useQuery({
    queryKey: [...scope, 'configuration', 'automations'],
    queryFn: ({ signal }) => api.automations.list(signal),
  });
  const recovered = current.data?.find((item) => item.id === id);
  useDirtyForm(JSON.stringify(draft) !== baseline, () => setDraft(draftFrom(saved)));
  const save = async () => {
    if (
      !(await confirmAction(
        '保存自动化任务？',
        `${draft.name}；${draft.enabled ? '启用后服务端将按计划运行。' : '保存为停用状态。'}`,
      ))
    )
      return;
    try {
      const result = await command.submit(() =>
        saved
          ? api.automations.update(id, {
              ...(saved.managed ? {} : { name: draft.name }),
              cron: draft.cron,
              timezone: draft.timezone,
              enabled: draft.enabled,
            })
          : api.automations.create(
              automationCreateInputSchema.parse({
                id,
                ...draft,
                retry: { maxAttempts: 3, backoffMs: 500 },
                lockTtlMs: 60000,
              }),
            ),
      );
      setSaved(result);
      setDraft(draftFrom(result));
      setBaseline(JSON.stringify(draftFrom(result)));
      setMessage('任务已保存。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存未完成，输入仍保留。');
    }
  };
  return (
    <>
      <Copy muted>
        任务 ID {id}。任务类型创建后不能修改；系统任务名称和类型固定。运行历史存在时无法删除。
      </Copy>
      <Feedback message={message} />
      <QueryStatus query={current} retry={() => void current.refetch()} />
      <Section title="任务设置">
        <Field
          label="任务名称"
          value={draft.name}
          onChange={(name) => setDraft((value) => ({ ...value, name }))}
          editable={!command.pending && !saved?.managed}
        />
        <Choices
          label="任务类型"
          value={draft.type}
          options={automationJobTypes.map((value) => ({
            value,
            label: automationTypeLabel(value),
          }))}
          onChange={(type) => setDraft((value) => ({ ...value, type }))}
          disabled={command.pending || Boolean(saved)}
        />
        <Field
          label="Cron 表达式"
          value={draft.cron}
          onChange={(cron) => setDraft((value) => ({ ...value, cron }))}
          editable={!command.pending}
        />
        <Field
          label="调度时区"
          value={draft.timezone}
          onChange={(timezone) => setDraft((value) => ({ ...value, timezone }))}
          editable={!command.pending}
        />
        <Choices
          label="定时运行"
          value={String(draft.enabled)}
          options={[
            { value: 'false', label: '停用' },
            { value: 'true', label: '启用' },
          ]}
          onChange={(value) => setDraft((previous) => ({ ...previous, enabled: value === 'true' }))}
          disabled={command.pending}
        />
        <Action
          label="保存自动化任务"
          primary
          disabled={command.pending || current.isError || (!saved && Boolean(recovered))}
          onPress={() => void save()}
        />
        <Action
          label="重新读取任务状态"
          disabled={current.isFetching}
          onPress={() => void current.refetch()}
        />
        {recovered ? (
          <Action
            label="采用服务端任务状态"
            disabled={command.pending}
            onPress={() => {
              void confirmAction('采用服务端任务？', '当前未保存输入将被服务端配置替换。').then(
                (approved) => {
                  if (approved) {
                    setSaved(recovered);
                    setDraft(draftFrom(recovered));
                    setBaseline(JSON.stringify(draftFrom(recovered)));
                  }
                },
              );
            }}
          />
        ) : null}
      </Section>
    </>
  );
}
export function AutomationEditor({
  route,
}: NativeStackScreenProps<SettingsStackParams, 'AutomationEditor'>) {
  const { api, scope } = useMobileRuntime();
  const id = route.params?.id;
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'automations'],
    queryFn: ({ signal }) => api.automations.list(signal),
  });
  const row = query.data?.find((item) => item.id === id);
  return (
    <Page title={id ? '编辑自动化任务' : '新建自动化任务'}>
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {query.isSuccess && (!id || row) ? <Editor {...(row ? { row } : {})} /> : null}
      {query.isSuccess && id && !row ? <Copy>任务已不存在，请返回列表重新读取。</Copy> : null}
    </Page>
  );
}
