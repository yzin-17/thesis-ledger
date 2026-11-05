import { useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { MarketNewsResult, MarketNewsFeedResult } from '@thesis-ledger/schemas';
import type { MarketStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  failureMessage,
} from '../../components/MobilePrimitives';
import { newsSubmission, type NewsSubmission } from './news-input';
import { NewsResult } from './NewsResult';
export function MarketNewsScreen() {
  const { params } = useRoute<RouteProp<MarketStackParams, 'MarketNews'>>();
  const instrument = params?.instrument;
  const { api, scope } = useMobileRuntime();
  const [form, setForm] = useState(() => {
    const end = new Date();
    return {
      start: new Date(end.getTime() - 3 * 86400000).toISOString(),
      end: end.toISOString(),
      provider: 'cls',
    };
  });
  const [submitted, setSubmitted] = useState<NewsSubmission | null>(null);
  const [cursors, setCursors] = useState<Array<string | null>>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const query = useQuery<MarketNewsResult | MarketNewsFeedResult>({
    queryKey: [...scope, 'market-news', submitted],
    enabled: Boolean(submitted),
    queryFn: ({ signal }) => {
      if (!submitted) throw new Error('请先选择资讯读取条件。');
      if (submitted.kind === 'feed') return api.market.getNewsFeed(submitted.input, signal);
      return api.market.getNews(submitted.input, signal);
    },
    retry: false,
    staleTime: 60_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const change = (patch: Partial<typeof form>) => setForm((value) => ({ ...value, ...patch }));
  const read = () => {
    try {
      setSubmitted(newsSubmission(form, instrument));
      setCursors([]);
      setFeedback(null);
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  const move = (cursor: string | null) => {
    if (!submitted) return;
    if (submitted.kind === 'feed')
      setSubmitted({ kind: 'feed', input: { ...submitted.input, cursor } });
    else setSubmitted({ kind: 'security', input: { ...submitted.input, cursor } });
  };
  return (
    <Page title={instrument ? '标的新闻' : '市场快讯'}>
      <Copy>
        {instrument
          ? `${instrument.name} · ${instrument.symbol}`
          : '财联社全市场电报／华尔街见闻 A 股频道，不自动关联个股。'}
      </Copy>
      {!instrument ? (
        <Choices
          label="快讯来源"
          value={form.provider}
          options={[
            { value: 'cls', label: '财联社' },
            { value: 'wallstreetcn', label: '华尔街见闻' },
          ]}
          onChange={(provider) => change({ provider })}
        />
      ) : null}
      <Field label="新闻起始 ISO 时间" value={form.start} onChange={(start) => change({ start })} />
      <Field label="新闻截止 ISO 时间" value={form.end} onChange={(end) => change({ end })} />
      <Copy muted>
        默认最近三天，每页最多五条；更改条件后点击读取，来源准入与覆盖限制以结果为准。
      </Copy>
      <Feedback message={feedback} error />
      <Action label="读取资讯" primary disabled={query.isFetching} onPress={read} />
      {submitted ? <QueryStatus query={query} retry={() => void query.refetch()} /> : null}
      {query.data ? <NewsResult data={query.data} /> : null}
      {cursors.length ? (
        <Action
          label="上一页资讯"
          disabled={query.isFetching}
          onPress={() => {
            const previous = cursors.at(-1) ?? null;
            setCursors((value) => value.slice(0, -1));
            move(previous);
          }}
        />
      ) : null}
      {query.data?.nextCursor ? (
        <Action
          label="下一页资讯"
          disabled={query.isFetching}
          onPress={() => {
            setCursors((value) => [...value, submitted?.input.cursor ?? null]);
            move(query.data.nextCursor);
          }}
        />
      ) : null}
    </Page>
  );
}
