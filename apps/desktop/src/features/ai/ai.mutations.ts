import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAiRun } from './ai.api.js';
import { aiKeys } from './ai.queries.js';
import type { CreateAiRunInput } from './ai.types.js';

export const useCreateAiRunMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAiRunInput) => createAiRun(input),
    retry: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.root }),
  });
};
