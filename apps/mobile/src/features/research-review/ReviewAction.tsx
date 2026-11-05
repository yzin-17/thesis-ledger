import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import {
  researchObservationSubmissionSchema,
  type ResearchReportLocatorInput,
} from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import {
  Action,
  Copy,
  Feedback,
  Field,
  QueryStatus,
  failureMessage,
} from '../../components/MobilePrimitives';
export function ReviewAction({
  id,
  claimId,
  locator,
  canCreate,
}: {
  id: string;
  claimId: string;
  locator: ResearchReportLocatorInput;
  canCreate: boolean;
}) {
  const { api, scope, baseUrl } = useMobileRuntime();
  const client = useQueryClient();
  const key = JSON.stringify(['mobile-research-review-v1', baseUrl, locator, id, claimId]);
  const pending = useQuery({
    queryKey: [...scope, 'review-pending', key],
    retry: false,
    queryFn: async () => {
      const raw = await AsyncStorage.getItem(key);
      return raw ? researchObservationSubmissionSchema.parse(JSON.parse(raw)) : null;
    },
  });
  const [asOf, setAsOf] = useState(() => new Date().toISOString());
  const [message, setMessage] = useState<string | null>(null);
  const command = useMobileCommand(
    async () => {
      if (!canCreate || locator.view === 'legacy') throw new Error('当前复核写入受控。');
      const input =
        pending.data ??
        researchObservationSubmissionSchema.parse({ submissionId: randomUUID(), claimId, asOf });
      await AsyncStorage.setItem(key, JSON.stringify(input));
      client.setQueryData([...scope, 'review-pending', key], input);
      const result = await api.research.review(id, locator, input);
      if (result.attempt.state !== 'pending') {
        await AsyncStorage.removeItem(key);
        client.setQueryData([...scope, 'review-pending', key], null);
      }
      await client.invalidateQueries({ queryKey: [...scope, 'research-observations'] });
      await client.invalidateQueries({ queryKey: [...scope, 'research-observation-history'] });
      setMessage('服务端已记录本次复核。');
    },
    { refresh: false },
  );
  return (
    <>
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      <Field
        label={`复核资料可见时刻 ${claimId}`}
        value={pending.data?.asOf ?? asOf}
        onChange={setAsOf}
        editable={!pending.data && !command.isPending}
      />
      {!canCreate ? <Copy muted>当前未开放复核写入，保留历史读取。</Copy> : null}
      {pending.data ? (
        <Copy>继续原复核标识 {pending.data.submissionId}，保留原资料时刻。</Copy>
      ) : null}
      <Action
        label={pending.data ? '找回原复核' : '提交复核'}
        disabled={
          !canCreate ||
          locator.view === 'legacy' ||
          command.isPending ||
          !pending.isSuccess ||
          pending.isError
        }
        onPress={() =>
          void command.mutateAsync(undefined).catch((e) => setMessage(failureMessage(e)))
        }
      />
      <Feedback message={message} error={command.isError} />
    </>
  );
}
