import { useMutation, useQueryClient } from '@tanstack/react-query';
import { savePerformanceTargets } from './performance.api.js';
import { performanceKeys } from './performance.queries.js';
import type { SavePerformanceTargetsInput } from './performance.types.js';

export const useSavePerformanceTargetsMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SavePerformanceTargetsInput) => savePerformanceTargets(input),
    onSuccess: (_, input) =>
      client.invalidateQueries({ queryKey: performanceKeys.targets(input.accountId ?? '') }),
  });
};
