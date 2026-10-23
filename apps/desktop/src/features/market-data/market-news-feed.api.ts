import {
  correlateMarketNewsFeedRead,
  marketNewsFeedReadInputSchema,
  type MarketNewsFeedReadInput,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';

export async function fetchMarketNewsFeed(input: MarketNewsFeedReadInput, signal?: AbortSignal) {
  const checked = marketNewsFeedReadInputSchema.parse(input);
  const raw = await getDesktopApiClient().request<unknown>('/api/market-data/news-feed', {
    method: 'POST',
    body: JSON.stringify(checked),
    ...(signal ? { signal } : {}),
  });
  try {
    return correlateMarketNewsFeedRead(checked, raw);
  } catch {
    throw new Error('快讯响应尚无法确认，请重新读取。');
  }
}
