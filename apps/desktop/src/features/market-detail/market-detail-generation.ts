import type { MarketDisplayDetailResponse } from '@thesis-ledger/schemas';

export function clearIndicatorSections(response: MarketDisplayDetailResponse | null) {
  if (!response) return response;
  const sections = { ...response.sections };
  delete sections['indicator:MA'];
  delete sections['indicator:MACD'];
  delete sections['indicator:RSI'];
  return { ...response, sections };
}

/** 晚到工作只能提交给其原请求世代。 */
export async function commitIfCurrentGeneration<T>(
  generation: number,
  currentGeneration: () => number,
  request: () => Promise<T>,
  commit: (value: T) => void,
) {
  const value = await request();
  if (generation !== currentGeneration()) return false;
  commit(value);
  return true;
}
