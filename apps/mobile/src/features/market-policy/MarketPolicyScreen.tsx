import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { randomUUID } from 'expo-crypto';
import { marketPolicySaveInputSchema } from '@thesis-ledger/schemas';
import { useDirtyForm, useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
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
type Draft = { revision: number; enabled: boolean; routes: string };
type Policy = Awaited<ReturnType<ThesisLedgerApiClient['market']['getPolicy']>>;
function PolicyStatus({
  data,
  pending,
  refresh,
}: {
  data: Policy | undefined;
  pending: boolean;
  refresh: () => void;
}) {
  return (
    <Section title="当前期望与生效">
      <Copy>
        期望修订 {data?.revision ?? '未读取'}；同步 {data?.syncState ?? '未读取'}；
        {data?.effectiveStale ? '生效投影已陈旧' : '生效投影与期望一致'}
      </Copy>
      <Copy>最近错误：{data?.lastError?.message ?? data?.lastError?.code ?? '无'}</Copy>
      <Copy>{JSON.stringify(data?.effectiveProjection ?? null, null, 2)}</Copy>
      <Action label="放弃草稿并重读路由" disabled={pending} onPress={refresh} />
    </Section>
  );
}
export function MarketPolicyScreen() {
  const { api, scope } = useMobileRuntime();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const command = useConfigCommand();
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'policy'],
    queryFn: ({ signal }) => api.market.getPolicy(signal),
  });
  const catalog = useQuery({
    queryKey: [...scope, 'configuration', 'route-capabilities'],
    queryFn: ({ signal }) => api.market.routeCapabilities(signal),
  });
  useDirtyForm(dirty, () => {
    setDraft(null);
    setDirty(false);
  });
  const source =
    draft ??
    (query.data
      ? {
          revision: query.data.revision,
          enabled: query.data.enabled,
          routes: JSON.stringify(query.data.routes, null, 2),
        }
      : null);
  const change = (patch: Partial<Draft>) => {
    if (source) {
      setDraft({ ...source, ...patch });
      setDirty(true);
    }
  };
  const save = async (retry: boolean) => {
    if (
      !source ||
      !(await confirmAction(
        retry ? '重试同步路由？' : '保存并验证行情路由？',
        '将修改整个服务的行情路由；期望配置与实际生效状态分别记录，能力未准入时不会自动开放。',
      ))
    )
      return;
    try {
      await command.submit(async () => {
        if (retry) return api.market.retryPolicy();
        const input = marketPolicySaveInputSchema.parse({
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId: randomUUID(),
          revision: source.revision + 1,
          expectedRevision: source.revision,
          enabled: source.enabled,
          routes: JSON.parse(source.routes) as unknown,
        });
        return api.market.savePolicy(input);
      });
      setDirty(false);
      setDraft(null);
      setMessage('请求已接收，请核对期望与生效投影。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作未完成。');
    }
  };
  const adopt = async () => {
    if (dirty && !(await confirmAction('放弃路由输入并重读？', '未保存的路由输入将被清除。')))
      return;
    setDraft(null);
    setDirty(false);
    await query.refetch();
    await catalog.refetch();
  };
  return (
    <Page title="行情路由配置">
      <Feedback message={message} />
      <QueryStatus query={query} retry={() => void adopt()} />
      <PolicyStatus
        data={query.data}
        pending={command.pending || query.isFetching}
        refresh={() => void adopt()}
      />
      {source ? (
        <Section title={`编辑期望修订 ${source.revision}`}>
          <Choices
            label="行情控制开关"
            value={String(source.enabled)}
            options={[
              { value: 'false', label: '关闭控制' },
              { value: 'true', label: '开启控制' },
            ]}
            onChange={(value) => change({ enabled: value === 'true' })}
            disabled={command.pending}
          />
          <Copy muted>
            每项包含 key 和按优先顺序排列的
            targets，保留精确市场、资产、周期、复权和启停字段。保存只提交当前期望修订。
          </Copy>
          <Field
            label="路由列表（JSON）"
            value={source.routes}
            onChange={(routes) => change({ routes })}
            multiline
            editable={!command.pending}
          />
          <Action
            label="保存并验证行情路由"
            primary
            disabled={command.pending || query.isError || !query.data}
            onPress={() => void save(false)}
          />
          <Action
            label="重试同步当前路由"
            disabled={command.pending || dirty || query.isError || !query.data}
            onPress={() => void save(true)}
          />
        </Section>
      ) : null}
      <Section title="可选择的精确能力">
        <QueryStatus query={catalog} retry={() => void catalog.refetch()} />
        <Copy>
          目录状态 {catalog.data?.status ?? '未读取'}；原因 {catalog.data?.reason ?? '无'}
        </Copy>
        {catalog.data?.entries.map((entry, index) => (
          <Copy key={index}>{JSON.stringify(entry)}</Copy>
        ))}
      </Section>
    </Page>
  );
}
