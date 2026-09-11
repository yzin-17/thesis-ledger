import { useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioKeys } from './portfolio.queries.js';
import { portfolioTradeKeys } from './portfolio-trade.queries.js';
import { createPortfolioTradeOpeningBoundary } from './portfolio-trade.api.js';
import type { CreateTradeOpeningBoundaryAssertionCommandV2 } from '@thesis-ledger/api-client';

export const useCreatePortfolioTradeOpeningBoundaryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tradeId,
      command,
    }: {
      tradeId: string;
      command: CreateTradeOpeningBoundaryAssertionCommandV2;
    }) => createPortfolioTradeOpeningBoundary(tradeId, command),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: portfolioTradeKeys.root }),
        queryClient.invalidateQueries({ queryKey: portfolioKeys.root }),
      ]);
    },
  });
};
