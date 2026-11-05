import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  researchReportLocatorSchema,
  type ResearchObservationSubmissionInput,
  type ResearchReportLocatorInput,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { researchKeys, useResearchIdentity } from './research.queries.js';

interface ObservationCommand {
  input: ResearchObservationSubmissionInput;
  state: 'pending' | 'unknown' | 'succeeded' | 'failed';
}
/** 提交身份按当前读取范围保存；网络响应丢失时重试同一有界尝试。 */
export function useResearchObservation(
  runId: string,
  claimId: string,
  input: ResearchReportLocatorInput,
) {
  const owner = useResearchIdentity(),
    queryClient = useQueryClient();
  const locator = researchReportLocatorSchema.parse(input);
  const key = researchKeys.observationSubmission(owner, runId, claimId, locator);
  const [command, setCommand] = useState<ObservationCommand | null>(
    () => queryClient.getQueryData<ObservationCommand>(key) ?? null,
  );
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const save = (next: ObservationCommand) => {
    queryClient.setQueryData(key, next);
    setCommand(next);
  };
  const mutation = useMutation({
    mutationKey: key,
    retry: false,
    mutationFn: async (body: ResearchObservationSubmissionInput) => {
      const active = new AbortController();
      controller.current = active;
      try {
        return await getDesktopApiClient().research.review(runId, locator, body, active.signal);
      } finally {
        if (controller.current === active) controller.current = null;
      }
    },
    onSuccess: async (value, body) => {
      save({ input: body, state: value.attempt.state });
      await queryClient.invalidateQueries({
        queryKey: researchKeys.observations(owner, runId, locator),
        exact: true,
      });
    },
    onError: (_error, body) => {
      save({ input: body, state: 'unknown' });
    },
  });
  const submit = () => {
    if (controller.current || mutation.isPending) return;
    let body = command?.input;
    if (!command || command.state === 'succeeded' || command.state === 'failed')
      body = { submissionId: crypto.randomUUID(), claimId, asOf: new Date().toISOString() };
    if (!body) return;
    save({ input: body, state: 'pending' });
    mutation.mutate(body);
  };
  let label = '按需复核';
  if (mutation.isPending) label = '正在复核…';
  else if (command?.state === 'pending' || command?.state === 'unknown') label = '找回本次提交';
  else if (command) label = '再次按需复核';
  return { submit, label, command, mutation };
}
