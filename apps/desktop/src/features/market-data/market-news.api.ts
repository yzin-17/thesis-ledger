import {
  correlateMarketNewsRead,
  marketNewsReadInputSchema,
  type MarketNewsReadInput,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';

export async function fetchMarketNews(input: MarketNewsReadInput, signal?: AbortSignal) {
  const checked = marketNewsReadInputSchema.parse(input);
  const raw = await getDesktopApiClient().request<unknown>('/api/market-data/news', {
    method: 'POST',
    body: JSON.stringify(checked),
    ...(signal ? { signal } : {}),
  });
  try {
    return correlateMarketNewsRead(checked, raw);
  } catch {
    throw new Error('新闻响应尚无法确认，请重新读取。');
  }
}
