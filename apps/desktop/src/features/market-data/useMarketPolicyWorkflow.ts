import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  useRetryMarketPolicyMutation,
  useSaveMarketPolicyMutation,
} from './market-data.mutations.js';
import { routeAvailabilityLabelV3 } from './market-data-routes-v3.js';
import type { MarketPolicyDraftV3, MarketPolicyResponse } from './market-data.types.js';

const toPolicyDraftV3 = (policy: MarketPolicyResponse): MarketPolicyDraftV3 => {
  return {
    contractVersion: 3,
    revision: policy.revision,
    enabled: policy.enabled,
    routes: policy.routes,
  };
};

const retryMessage = (policy: MarketPolicyResponse) => {
  if (policy.syncState === 'applied') return '路由策略已重新应用。';
  const reason = routeAvailabilityLabelV3(policy.lastError?.code ?? 'policy_not_applied');
  return `重试后仍未应用：${reason}`;
};

export function useMarketPolicyWorkflow({
  policy,
  catalogComplete,
  setBusyAction,
  setMessage,
}: {
  policy: MarketPolicyResponse | undefined;
  catalogComplete: boolean;
  setBusyAction: Dispatch<SetStateAction<string | null>>;
  setMessage: (next: { type: 'success' | 'error'; text: string } | null) => void;
}) {
  const [draft, setDraft] = useState<MarketPolicyDraftV3 | null>(null);
  const [dirty, setDirty] = useState(false);
  const saveMutation = useSaveMarketPolicyMutation();
  const retryMutation = useRetryMarketPolicyMutation();

  useEffect(() => {
    if (!policy) return;
    setDraft(toPolicyDraftV3(policy));
    setDirty(false);
  }, [policy]);

  const changeDraft = useCallback((next: MarketPolicyDraftV3) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const acceptPolicy = useCallback((next: MarketPolicyResponse) => {
    setDraft(toPolicyDraftV3(next));
    setDirty(false);
  }, []);

  const save = async () => {
    if (!draft || !catalogComplete) return;
    setBusyAction('policy-save');
    setMessage(null);
    try {
      const savedPolicy = await saveMutation.mutateAsync(draft);
      acceptPolicy(savedPolicy);
      setMessage({
        type: savedPolicy.syncState === 'applied' ? 'success' : 'error',
        text:
          savedPolicy.syncState === 'applied'
            ? '路由策略已保存并应用。'
            : `路由策略已保存，${retryMessage(savedPolicy)}`,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '路由策略提交失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const retry = async () => {
    setBusyAction('policy-retry');
    setMessage(null);
    try {
      const retriedPolicy = await retryMutation.mutateAsync();
      acceptPolicy(retriedPolicy);
      setMessage({
        type: retriedPolicy.syncState === 'applied' ? 'success' : 'error',
        text: retryMessage(retriedPolicy),
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '路由策略重试失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return {
    draft,
    dirty,
    changeDraft,
    acceptPolicy,
    save,
    retry,
    saving: saveMutation.isPending,
    retrying: retryMutation.isPending,
  };
}
