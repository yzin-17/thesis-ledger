import type {
  ThesisLedgerApiClient,
  TradeDetailResponseV2,
  TradeListQueryV2,
  TradeListResponseV2,
} from '@thesis-ledger/api-client';

import { getDesktopApiClient } from '../../shared/api/client.js';

export type PortfolioTradeClient = Pick<
  ThesisLedgerApiClient['portfolio'],
  'getTrades' | 'getTrade'
>;

const defaultPortfolioClient = () => getDesktopApiClient().portfolio;

export const fetchPortfolioTrades = (
  params: Partial<TradeListQueryV2>,
  client: Pick<PortfolioTradeClient, 'getTrades'> = defaultPortfolioClient(),
): Promise<TradeListResponseV2> => client.getTrades(params);

export const fetchPortfolioTrade = (
  accountId: string,
  tradeId: string,
  mode: 'actual' | 'shadow',
  client: Pick<PortfolioTradeClient, 'getTrade'> = defaultPortfolioClient(),
): Promise<TradeDetailResponseV2> => client.getTrade(accountId, tradeId, mode);
