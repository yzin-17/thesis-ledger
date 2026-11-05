import { useMutation, useQueryClient } from '@tanstack/react-query';
import { savePerformanceTargets } from './performance.api.js';
import { performanceKeys } from './performance.queries.js';
import type { SavePerformanceTargetsInput } from './performance.types.js';

export const useSavePerformanceTargetsMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePerformanceTargetsInput) => {
      await savePerformanceTargets(input);
      const reads = await Promise.allSettled([
        client.invalidateQueries({ queryKey: performanceKeys.targetsRoot }, { throwOnError: true }),
        client.invalidateQueries(
          { queryKey: performanceKeys.allocationRoot },
          { throwOnError: true },
        ),
      ]);
      return { refreshed: reads.every((read) => read.status === 'fulfilled') };
    },
  });
};
