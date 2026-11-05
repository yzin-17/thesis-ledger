import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AiProviderRecord } from '@thesis-ledger/schemas';
import { confirmAction, useMobileRuntime } from '../../app/MobileRuntime';
import type { SettingsStackParams } from '../../app/navigation-types';
import {
  Action,
  Copy,
  Feedback,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import { useConfigCommand } from '../configuration/use-config-command';
import { researchCandidateReason } from './ai-provider-draft';
export function AiProvidersScreen({
  navigation,
}: NativeStackScreenProps<SettingsStackParams, 'AiProviders'>) {
  const { api, scope } = useMobileRuntime();
  const [message, setMessage] = useState('');
  const command = useConfigCommand();
  const rows = useQuery({
    queryKey: [...scope, 'configuration', 'ai'],
    queryFn: ({ signal }) => api.aiProviders.list(signal),
  });
  const settings = useQuery({
    queryKey: [...scope, 'configuration', 'ai-settings'],
    queryFn: ({ signal }) => api.aiProviders.settings(signal),
  });
  const run = async (execute: () => Promise<unknown>) => {
    try {
      await command.submit(execute);
      setMessage('操作已完成，已重新读取配置。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作未完成。');
    }
  };
  const lifecycle = async (row: AiProviderRecord, remove: boolean) => {
    const referenced = settings.data?.researchDefault?.providerId === row.name;
    if (
      !(await confirmAction(
        remove ? '删除 AI 来源？' : '停用 AI 来源？',
        `${row.name}${referenced ? ' 当前是研究默认来源，将同时清除默认引用。' : '。'}历史生成记录继续保留。`,
        remove,
      ))
    )
      return;
    const options = {
      ...(row.updatedAt ? { expectedRevision: row.updatedAt } : {}),
      ...(referenced
        ? { clearResearchDefault: true, expectedSettingsRevision: settings.data?.revision }
        : {}),
    };
    await run(() =>
      remove
        ? api.aiProviders.remove(row.name, options)
        : api.aiProviders.setEnabled(row.name, false, options),
    );
  };
  const blocked = command.pending || rows.isError || settings.isError || !settings.data;
  return (
    <Page
      title="AI 模型与来源"
      action={
        <Action label="新建 AI 来源" onPress={() => navigation.navigate('AiProviderEditor')} />
      }
    >
      <Copy muted>
        配置对当前服务的全部账户生效；模拟账户范围不会隔离全局配置。连接检查、用途就绪、最近验证和默认模型分别记录。
      </Copy>
      <Feedback message={message} />
      <QueryStatus query={rows} empty={rows.data?.length === 0} retry={() => void rows.refetch()} />
      <Action
        label="重新读取 AI 配置"
        disabled={rows.isFetching || settings.isFetching}
        onPress={() => {
          void rows.refetch();
          void settings.refetch();
        }}
      />
      {rows.data?.map((row) => (
        <Section key={row.name} title={row.name}>
          <Copy>
            {row.enabled ? '已启用' : '已停用'} ·{' '}
            {row.credentialConfigured ? '凭证已配置' : '凭证未配置'} · 健康：{row.health}
          </Copy>
          <Copy>
            模型：{row.models?.join('、') || '尚未选择'}；修订：{row.updatedAt ?? '未记录'}
          </Copy>
          {row.configError ? <Copy>{row.configError}</Copy> : null}
          {row.executionRoutes?.map((route) => (
            <Copy key={`${route.model}:${route.contract.id}`}>
              {route.model} · {route.contract.id} · 就绪 {route.readiness.state}；最近验证{' '}
              {route.liveValidation.status}；阻断原因 {route.readiness.reasons.join('、') || '无'}
              ；配置指纹 {route.readiness.configurationFingerprint}；检查时间{' '}
              {route.liveValidation.checkedAt ?? '未执行'}
            </Copy>
          ))}
          <Action
            label={`编辑 ${row.name}`}
            onPress={() => navigation.navigate('AiProviderEditor', { name: row.name })}
          />
          {row.enabled ? (
            <Action
              label={`停用 ${row.name}`}
              disabled={blocked}
              onPress={() => void lifecycle(row, false)}
            />
          ) : (
            <Copy muted>需要启用时，进入编辑并执行验证保存。</Copy>
          )}
          <Action
            label={`删除 ${row.name}`}
            destructive
            disabled={blocked}
            onPress={() => void lifecycle(row, true)}
          />
        </Section>
      ))}
      <Section title="研究默认模型">
        <QueryStatus query={settings} retry={() => void settings.refetch()} />
        <Copy>
          当前：
          {settings.data?.researchDefault
            ? `${settings.data.researchDefault.providerId} / ${settings.data.researchDefault.model}`
            : '未设置'}
        </Copy>
        {settings.data?.candidates.map((item) => {
          const reason = researchCandidateReason(
            rows.data?.find((row) => row.name === item.providerId),
            item.model,
            item.priceConfigured,
          );
          return (
            <Section key={`${item.providerId}:${item.model}`}>
              <Copy>
                {item.providerName} / {item.model} · {reason ?? '可选择'}
              </Copy>
              <Action
                label={`设为默认 ${item.model}`}
                disabled={blocked || Boolean(reason)}
                onPress={() =>
                  void run(() =>
                    api.aiProviders.updateSettings({
                      researchDefault: { providerId: item.providerId, model: item.model },
                      expectedRevision: settings.data?.revision ?? '',
                    }),
                  )
                }
              />
            </Section>
          );
        })}
        <Action
          label="清除研究默认模型"
          disabled={blocked || !settings.data?.researchDefault}
          onPress={() =>
            void run(() =>
              api.aiProviders.updateSettings({
                researchDefault: null,
                expectedRevision: settings.data?.revision ?? '',
              }),
            )
          }
        />
      </Section>
    </Page>
  );
}
