import { marketInformationClient, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import type { MarketNewsReadInput } from '@thesis-ledger/schemas';
import { parsedDesktopRequest } from '../shared/request.js';
export async function fetchMarketNews(input: MarketNewsReadInput, signal?: AbortSignal) {
  try {
    return await marketInformationClient(parsedDesktopRequest()).getNews(input, signal);
  } catch (error) {
    if (error instanceof ThesisLedgerContractError)
      throw new Error('新闻响应尚无法确认，请重新读取。');
    throw error;
  }
}
