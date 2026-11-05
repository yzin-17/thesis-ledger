import { marketInformationClient, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import type { MarketNewsFeedReadInput } from '@thesis-ledger/schemas';
import { parsedDesktopRequest } from '../shared/request.js';
export async function fetchMarketNewsFeed(input: MarketNewsFeedReadInput, signal?: AbortSignal) {
  try {
    return await marketInformationClient(parsedDesktopRequest()).getNewsFeed(input, signal);
  } catch (error) {
    if (error instanceof ThesisLedgerContractError)
      throw new Error('快讯响应尚无法确认，请重新读取。');
    throw error;
  }
}
