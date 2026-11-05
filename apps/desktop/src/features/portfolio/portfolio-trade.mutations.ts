import { useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioTradeKeys } from './portfolio-trade.queries.js';
import { createPortfolioTradeOpeningBoundary } from './portfolio-trade.api.js';
import type { CreateTradeOpeningBoundaryAssertionCommand } from '@thesis-ledger/api-client';

export const useCreatePortfolioTradeOpeningBoundaryMutation = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({
      tradeId,
      command,
    }: {
      tradeId: string;
      command: CreateTradeOpeningBoundaryAssertionCommand;
    }) => createPortfolioTradeOpeningBoundary(tradeId, command),
  });
  return {
    ...mutation,
    refreshTrades: () =>
      queryClient.invalidateQueries({ queryKey: portfolioTradeKeys.root }, { throwOnError: true }),
  };
};
