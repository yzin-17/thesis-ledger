import { useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { MarketStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Action, Copy, Field, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { SourceLink } from '../../components/SourceLink';
const download = { pending: '未下载', downloaded: '已下载', failed: '下载失败' };
const parse = { unparsed: '未解析', parsed: '已解析', failed: '解析失败' };
export function AnnouncementsScreen() {
  const { params } = useRoute<RouteProp<MarketStackParams, 'MarketAnnouncements'>>();
  const { api, scope } = useMobileRuntime();
  const [draft, setDraft] = useState(params?.q ?? '');
  const [q, setQ] = useState(draft);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...scope, 'market-announcements', q, page],
    queryFn: ({ signal }) => api.market.getAnnouncements({ q, page, pageSize: 30 }, signal),
  });
  return (
    <Page title="公告与已收录原文">
      <Field label="搜索公告标题或标的" value={draft} onChange={setDraft} />
      <Action
        label="查询公告"
        disabled={query.isFetching}
        onPress={() => {
          setQ(draft.trim());
          setPage(1);
        }}
      />
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {query.data ? (
        <>
          <Copy>
            匹配 {query.data.total} 份原文 · 第 {query.data.page} 页
          </Copy>
          {query.data.total === 0 ? <Copy>当前没有匹配的已收录公告。</Copy> : null}
          {query.data.items.map((item) => (
            <Section key={item.id} title={item.title}>
              <Copy>
                {item.symbol} · 发布 {item.publishedDate}
              </Copy>
              <Copy>
                {item.uses.map((use) => (use === 'risk' ? '风险警示' : '停复牌')).join('、')} ·{' '}
                {download[item.downloadState]} · {parse[item.parseState]}
              </Copy>
              {item.detail ? <Copy>{item.detail}</Copy> : null}
              <SourceLink url={item.url} />
            </Section>
          ))}
          <Action
            label="上一页公告"
            disabled={page === 1 || query.isFetching}
            onPress={() => setPage((value) => value - 1)}
          />
          <Action
            label="下一页公告"
            disabled={page * 30 >= query.data.total || query.isFetching}
            onPress={() => setPage((value) => value + 1)}
          />
        </>
      ) : null}
    </Page>
  );
}
