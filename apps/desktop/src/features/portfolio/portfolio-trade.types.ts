export type PortfolioTradeReviewTarget = {
  accountId: string;
  tradeId: string;
  reviewObjectType: 'TRADE_CYCLE' | 'CLOSE_SLICE';
  closeSliceId?: string;
};
