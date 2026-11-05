import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  researchPrivateMaterialV2Schema,
  type ResearchReportLocatorInput,
} from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { researchKeys, useResearchIdentity } from './research.queries.js';
import { formatFullDateTime } from './ai.display.js';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function MaterialData({ kind, data }: { kind: string; data: unknown }) {
  const value = record(data);
  if (kind === 'quote')
    return (
      <dl className="grid gap-2 text-sm">
        <div>
          <dt>原币价格 / 净值</dt>
          <dd>
            {typeof value.price === 'number' || typeof value.price === 'string'
              ? value.price
              : '未记录'}{' '}
            {typeof value.currency === 'string' ? value.currency : '币种未记录'}
          </dd>
        </div>
        {typeof value.valuationDate === 'string' && (
          <div>
            <dt>净值日期</dt>
            <dd>{formatFullDateTime(value.valuationDate)}</dd>
          </div>
        )}
      </dl>
    );
  if (kind === 'news' && Array.isArray(value.items))
    return (
      <div className="flex flex-col gap-3">
        {value.items.map((item, index) => {
          const news = record(item);
          return (
            <div key={index} className="text-sm">
              <p className="font-medium">
                {typeof news.title === 'string' ? news.title : '标题未记录'}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {typeof news.excerpt === 'string' ? news.excerpt : '摘要未记录'}
              </p>
            </div>
          );
        })}
      </div>
    );
  const parsed = researchPrivateMaterialV2Schema.safeParse(data);
  if (parsed.success && parsed.data.version === 'research-portfolio-material-v2')
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>{parsed.data.accounts.map((account) => account.name).join('、')}</p>
        {parsed.data.positions.map((position) => (
          <p key={position.accountId + position.symbol}>
            {position.symbol} · 数量 {position.quantity} · 成本单价 {position.costPrice}{' '}
            {position.currency ?? '币种未记录'}
          </p>
        ))}
        {parsed.data.cashBalances.map((balance) => (
          <p key={balance.accountId + balance.currency}>
            现金 {balance.currency ?? '币种未记录'}：{balance.settledAmount} ·{' '}
            {balance.projectionStatus === 'current' ? '已核对账本状态' : '账本状态尚待核对'}
          </p>
        ))}
      </div>
    );
  if (parsed.success)
    return <p className="text-sm">策略使用已冻结的定义与版本，读取不会重新执行回测。</p>;
  return <p className="text-sm text-muted-foreground">当前材料没有可展示的结构化摘要。</p>;
}

export function ResearchEvidenceRead({
  runId,
  referenceId,
  locator,
  label,
}: {
  runId: string;
  referenceId: string;
  locator: ResearchReportLocatorInput;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const owner = useResearchIdentity();
  const query = useQuery({
    placeholderData: () => undefined,
    queryKey: researchKeys.evidence(owner, runId, referenceId, locator),
    queryFn: ({ signal }) =>
      getDesktopApiClient().research.evidence(runId, referenceId, locator, signal),
    enabled: expanded,
    retry: false,
    staleTime: 30_000,
  });
  const evidence = query.data;
  const material: unknown = evidence?.version === 2 ? evidence.evidence.data : null;
  return (
    <section className="flex flex-col gap-3 rounded-md border p-3">
      <Button
        type="button"
        variant="link"
        className="justify-start"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {label}
      </Button>
      {expanded && query.isPending && (
        <p className="text-sm" role="status">
          正在读取保存的材料…
        </p>
      )}
      {expanded && query.isError && (
        <Alert variant="destructive">
          <AlertTitle>引用暂不可用</AlertTitle>
          <AlertDescription>材料不存在、已失去访问权限或保存的关联无法核验。</AlertDescription>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            重新读取引用
          </Button>
        </Alert>
      )}
      {expanded && !query.isError && evidence?.version === 2 && (
        <div className="flex flex-col gap-3">
          <dl className="grid gap-2 text-xs text-muted-foreground">
            <div>
              <dt>来源</dt>
              <dd>{evidence.evidence.audit.providerId ?? '未记录'}</dd>
            </div>
            <div>
              <dt>发布时间</dt>
              <dd>{formatFullDateTime(evidence.evidence.audit.publishedAt)}</dd>
            </div>
            <div>
              <dt>来源可用时间</dt>
              <dd>{formatFullDateTime(evidence.evidence.audit.availableAt)}</dd>
            </div>
            <div>
              <dt>抓取时间</dt>
              <dd>{formatFullDateTime(evidence.evidence.audit.fetchedAt)}</dd>
            </div>
          </dl>
          <MaterialData kind={evidence.evidence.audit.kind} data={material} />
          {evidence.evidence.audit.sourceUrls.map((url, index) => (
            <a
              key={url}
              className="text-sm text-primary underline underline-offset-4"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              原始来源 {index + 1}
            </a>
          ))}
        </div>
      )}
      {expanded && !query.isError && evidence?.version === 1 && (
        <dl className="grid gap-2 text-sm">
          <div>
            <dt>历史来源</dt>
            <dd>{evidence.toolCall.provider ?? '未记录'}</dd>
          </div>
          <div>
            <dt>抓取时间</dt>
            <dd>{formatFullDateTime(evidence.toolCall.fetchedAt)}</dd>
          </div>
          <div>
            <dt>关联状态</dt>
            <dd>已核对属于该研究的读取记录</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
