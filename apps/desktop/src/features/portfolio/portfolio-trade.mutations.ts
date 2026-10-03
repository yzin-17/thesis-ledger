import { useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioTradeKeys } from './portfolio-trade.queries.js';
import { createPortfolioTradeOpeningBoundary } from './portfolio-trade.api.js';
import type { CreateTradeOpeningBoundaryAssertionCommand } from '@thesis-ledger/api-client';

export const useCreatePortfolioTradeOpeningBoundaryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tradeId,
      command,
    }: {
      tradeId: string;
      command: CreateTradeOpeningBoundaryAssertionCommand;
    }) => createPortfolioTradeOpeningBoundary(tradeId, command),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portfolioTradeKeys.root });
    },
  });
};
