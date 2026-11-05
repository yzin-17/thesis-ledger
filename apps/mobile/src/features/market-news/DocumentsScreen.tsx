import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Action, Copy, Field, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { SourceLink } from '../../components/SourceLink';
import { localDocumentGroups } from './document-groups';
export function DocumentsScreen() {
  const { api, scope } = useMobileRuntime();
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(30);
  const query = useQuery({
    queryKey: [...scope, 'market-documents'],
    queryFn: ({ signal }) => api.market.getProviderRegistry(signal),
  });
  const { groups, incomplete } = localDocumentGroups(query.data?.providers ?? []);
  const keyword = filter.trim().toLowerCase();
  const visible = groups.filter((group) =>
    `${group.document.title} ${group.references.map((row) => `${row.source} ${row.data.symbols.join(' ')}`).join(' ')}`
      .toLowerCase()
      .includes(keyword),
  );
  return (
    <Page title="已收录规则资料">
      <Copy muted>按原文合并展示已收录文档；适用标的、交易范围及日期以每条资料为准。</Copy>
      <Field
        label="搜索资料标题或标的"
        value={filter}
        onChange={(value) => {
          setFilter(value);
          setLimit(30);
        }}
      />
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {query.isSuccess ? (
        <Copy>
          共 {groups.length} 份原文，筛选后 {visible.length} 份
        </Copy>
      ) : null}
      {incomplete ? <Copy muted>部分来源尚未提供完整文档清单。</Copy> : null}
      {visible.slice(0, limit).map((group) => (
        <Section key={group.document.url} title={group.document.title}>
          <Copy>发布日期 {group.document.publishedDate ?? '未提供'}</Copy>
          {group.references.map((row, index) => (
            <Section key={index} title={row.source}>
              <Copy>
                {row.provider} · 标的 {row.data.symbols.join('、') || '按交易范围'}
              </Copy>
              {row.data.scope ? (
                <Copy>
                  市场 {row.data.scope.market} · 交易所 {row.data.scope.exchange} · 类别{' '}
                  {row.data.scope.assetType} · 方式 {row.data.scope.tradingMethod}
                </Copy>
              ) : null}
              <Copy muted>
                覆盖 {row.data.coverage.start} ～ {row.data.coverage.end}
              </Copy>
            </Section>
          ))}
          <SourceLink url={group.document.url} />
        </Section>
      ))}
      {query.isSuccess && !visible.length ? <Copy>当前没有匹配的已收录资料。</Copy> : null}
      {visible.length > limit ? (
        <Action label="更多已收录资料" onPress={() => setLimit((value) => value + 30)} />
      ) : null}
    </Page>
  );
}
