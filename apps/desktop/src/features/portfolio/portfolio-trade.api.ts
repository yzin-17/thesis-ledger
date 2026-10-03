import type {
  CreateTradeOpeningBoundaryAssertionCommand,
  LedgerCommandResponse,
  ThesisLedgerApiClient,
  TradeDetailResponse,
  TradeListQuery,
  TradeListResponse,
} from '@thesis-ledger/api-client';

import { getDesktopApiClient } from '../../shared/api/client.js';

export type PortfolioTradeClient = Pick<
  ThesisLedgerApiClient['portfolio'],
  'getTrades' | 'getTrade' | 'createTradeOpeningBoundary'
>;

const defaultPortfolioClient = () => getDesktopApiClient().portfolio;

export const fetchPortfolioTrades = (
  params: Partial<TradeListQuery>,
  client: Pick<PortfolioTradeClient, 'getTrades'> = defaultPortfolioClient(),
): Promise<TradeListResponse> => client.getTrades(params);

export const fetchPortfolioTrade = (
  accountId: string,
  tradeId: string,
  mode: 'actual' | 'shadow',
  client: Pick<PortfolioTradeClient, 'getTrade'> = defaultPortfolioClient(),
): Promise<TradeDetailResponse> => client.getTrade(accountId, tradeId, mode);

export const createPortfolioTradeOpeningBoundary = (
  tradeId: string,
  command: CreateTradeOpeningBoundaryAssertionCommand,
  client: Pick<PortfolioTradeClient, 'createTradeOpeningBoundary'> = defaultPortfolioClient(),
): Promise<LedgerCommandResponse> => client.createTradeOpeningBoundary(tradeId, command);
