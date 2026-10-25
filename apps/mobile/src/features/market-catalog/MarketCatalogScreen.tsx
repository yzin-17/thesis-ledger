import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
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
const terminal = (status: string) => ['succeeded', 'failed', 'timeout'].includes(status);
type CatalogStatus = Awaited<ReturnType<ThesisLedgerApiClient['market']['getCatalogStatus']>>;
function StatusPanel({
  query,
  pending,
  start,
}: {
  query: UseQueryResult<CatalogStatus>;
  pending: boolean;
  start: () => void;
}) {
  return (
    <Section title="目录状态">
      <Copy>
        状态 {query.data?.readinessState ?? '未读取'}；代次 {query.data?.generation ?? '—'}；标的{' '}
        {query.data?.instrumentCount ?? '—'}
      </Copy>
      <Copy>
        最近错误：{query.data?.lastError ?? '无'}；可重试时间 {query.data?.retryAt ?? '未提供'}
      </Copy>
      <Action
        label="重新读取目录状态"
        disabled={query.isFetching}
        onPress={() => void query.refetch()}
      />
      <Action
        label="同步标的目录"
        primary
        disabled={pending || query.isError || !query.data || query.data.refreshInProgress}
        onPress={start}
      />
    </Section>
  );
}
export function MarketCatalogScreen() {
  const { api, scope } = useMobileRuntime();
  const client = useQueryClient();
  const [queryText, setQueryText] = useState('');
  const [search, setSearch] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const command = useConfigCommand();
  const status = useQuery({
    queryKey: [...scope, 'configuration', 'catalog-status'],
    queryFn: ({ signal }) => api.market.getCatalogStatus(signal),
  });
  const currentId = jobId ?? status.data?.activeJobId ?? null;
  const job = useQuery({
    queryKey: [...scope, 'configuration', 'catalog-job', currentId],
    enabled: Boolean(currentId),
    queryFn: ({ signal }) => api.market.catalogJob(currentId!, signal),
    refetchInterval: (state) =>
      state.state.status === 'error' || (state.state.data && terminal(state.state.data.status))
        ? false
        : 1500,
  });
  const instruments = useQuery({
    queryKey: [...scope, 'configuration', 'catalog-search', search],
    enabled: Boolean(search),
    queryFn: ({ signal }) => api.market.searchInstruments({ q: search, limit: 50 }, signal),
  });
  const completedId = job.isSuccess && terminal(job.data.status) ? job.data.id : null;
  useEffect(() => {
    if (completedId)
      void client.invalidateQueries({ queryKey: [...scope, 'configuration', 'catalog-status'] });
  }, [client, scope, completedId]);
  const start = async () => {
    if (
      !(await confirmAction(
        '同步标的目录？',
        '服务端将执行目录同步；应用只跟踪任务与确认状态，不会因查询失败再次提交。',
      ))
    )
      return;
    try {
      const result = await command.submit(() => api.market.startCatalogSync());
      setJobId(result.id);
      setMessage('已取得同步任务，请查看终态与确认结果。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作未完成。');
    }
  };
  const confirm = async (id: string, label: string) => {
    if (!(await confirmAction('确认标的？', label))) return;
    try {
      await command.submit(() => api.market.confirmInstrument(id));
      setMessage('标的已确认，已重新读取搜索结果。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作未完成。');
    }
  };
  return (
    <Page title="标的目录与同步">
      <Feedback message={message} />
      <QueryStatus query={status} retry={() => void status.refetch()} />
      <StatusPanel
        query={status}
        pending={command.pending || Boolean(job.data && !terminal(job.data.status))}
        start={() => void start()}
      />
      {currentId ? (
        <Section title="同步任务">
          <QueryStatus query={job} retry={() => void job.refetch()} />
          <Copy>
            任务 {currentId}；{job.data?.status ?? '未读取'}；
            {job.data?.acknowledged ? '服务端已确认目录更新' : '尚未确认目录更新'}
          </Copy>
          <Copy>{JSON.stringify(job.data ?? null, null, 2)}</Copy>
          <Action
            label="重新读取同步任务"
            disabled={job.isFetching}
            onPress={() => {
              void job.refetch();
              void status.refetch();
            }}
          />
        </Section>
      ) : null}
      <Section title="搜索与确认标的">
        <Field label="标的名称或代码" value={queryText} onChange={setQueryText} />
        <Action
          label="搜索标的"
          disabled={!queryText.trim()}
          onPress={() => setSearch(queryText.trim())}
        />
        {search ? (
          <QueryStatus
            query={instruments}
            empty={instruments.data?.length === 0}
            retry={() => void instruments.refetch()}
          />
        ) : null}
        {instruments.data?.map((item) => (
          <Section key={item.id} title={item.displayName}>
            <Copy>
              {item.symbol} · {item.market} · {item.confirmable ? '可确认' : '不可确认'}
            </Copy>
            <Copy>{item.disabledReason ?? '目录身份有效，可提交确认。'}</Copy>
            <Action
              label={`确认标的 ${item.symbol}`}
              disabled={command.pending || instruments.isError || !item.confirmable}
              onPress={() => void confirm(item.id, `${item.displayName} / ${item.symbol}`)}
            />
          </Section>
        ))}
      </Section>
    </Page>
  );
}
