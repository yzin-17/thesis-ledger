import { useMutation, useQueryClient } from '@tanstack/react-query';
import { savePerformanceTargets } from './performance.api.js';
import { performanceKeys } from './performance.queries.js';
import type { SavePerformanceTargetsInput } from './performance.types.js';

export const useSavePerformanceTargetsMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SavePerformanceTargetsInput) => savePerformanceTargets(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: performanceKeys.targetsRoot });
      void client.invalidateQueries({ queryKey: performanceKeys.allocationRoot });
    },
  });
};
