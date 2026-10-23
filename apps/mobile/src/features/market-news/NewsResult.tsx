import { useState } from 'react';
import type { MarketNewsResult, MarketNewsFeedResult } from '@thesis-ledger/schemas';
import { Action, Copy, Feedback, Section } from '../../components/MobilePrimitives';
import { SourceLink } from '../../components/SourceLink';
type Result = MarketNewsResult | MarketNewsFeedResult;
const sources: Record<string, string> = {
  cls: '财联社',
  wallstreetcn: '华尔街见闻',
  yahoo: 'Yahoo',
  eastmoney: '东方财富',
};
const statusLabels = { available: '可用', partial: '部分可用', unavailable: '不可用' };
export function NewsResult({ data }: { data: Result }) {
  return (
    <>
      <Section title={`资讯结果 · ${statusLabels[data.status]}`}>
        <Copy>
          {data.items.length} 条 · {data.coverage.uniqueEvidenceCount} 组独立证据
        </Copy>
        <Copy muted>
          来源{' '}
          {data.source ? (sources[data.source.providerId] ?? data.source.providerId) : '未选定'} ·
          抓取 {data.fetchedAt ?? '未发生'}
        </Copy>
        <Copy muted>
          发布时间 {data.coverage.publishedStart ?? '不限'} ～{' '}
          {data.coverage.publishedEnd ?? '不限'}
        </Copy>
        <Copy muted>
          {data.coverage.complete ? '本次声明覆盖完整' : '当前页覆盖不完整'} · 发布时间未知{' '}
          {data.coverage.unknownPublishedTimeCount} 条
        </Copy>
        {data.errors.map((error, index) => (
          <Feedback key={index} message={error.message} error />
        ))}
        {data.coverage.missingReasons.length ? (
          <Copy muted>覆盖限制：{data.coverage.missingReasons.join('、')}</Copy>
        ) : null}
        {!data.items.length ? <Copy>本窗口没有可展示的条目，不代表该期间没有新闻。</Copy> : null}
      </Section>
      {data.items.map((item) => (
        <NewsItem key={item.id} item={item} />
      ))}
    </>
  );
}
function NewsItem({ item }: { item: Result['items'][number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Section title={item.title}>
      <Copy>
        {item.publisher ?? '发布方未知'} · 发布时间 {item.publishedAt ?? '未知'}
      </Copy>
      <Copy muted>
        首次可用 {item.sourceAvailableAt ?? '未知'} · 抓取 {item.fetchedAt}
      </Copy>
      {item.excerpt ? (
        <>
          <Action
            label={expanded ? '收起来源摘录' : '展开来源摘录'}
            onPress={() => setExpanded((value) => !value)}
          />
          {expanded ? <Copy>{item.excerpt}</Copy> : null}
        </>
      ) : null}
      <SourceLink url={item.originalUrl ?? item.url} />
    </Section>
  );
}
