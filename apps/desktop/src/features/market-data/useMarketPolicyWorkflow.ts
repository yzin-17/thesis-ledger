import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import {
  useRetryMarketPolicyMutation,
  useSaveMarketPolicyMutation,
} from './market-data.mutations.js';
import { routeAvailabilityLabelV3 } from './market-data-routes-v3.js';
import { configuredPolicyDraftV3, changedPolicyRouteIdsV3 } from './market-policy-draft-v3.js';
import type {
  MarketPolicyDraftV3,
  MarketPolicyResponse,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from './market-data.types.js';

const toPolicyDraftV3 = (policy: MarketPolicyResponse): MarketPolicyDraftV3 => {
  return configuredPolicyDraftV3(policy);
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
  catalog?: MarketRouteCatalogReadV3 | undefined;
  providers?: readonly ProviderManifest[] | undefined;
  setBusyAction: Dispatch<SetStateAction<string | null>>;
  setMessage: (next: { type: 'success' | 'error'; text: string } | null) => void;
}) {
  const [draft, setDraft] = useState<MarketPolicyDraftV3 | null>(null);
  const [dirty, setDirty] = useState(false);
  const hydratedPolicy = useRef<MarketPolicyResponse | undefined>(undefined);
  const saveMutation = useSaveMarketPolicyMutation();
  const retryMutation = useRetryMarketPolicyMutation();

  useEffect(() => {
    if (!policy || hydratedPolicy.current === policy) return;
    hydratedPolicy.current = policy;
    if (dirty) return;
    setDraft(toPolicyDraftV3(policy));
  }, [policy, dirty]);

  const changeDraft = useCallback((next: MarketPolicyDraftV3) => {
    setDraft(next);
    setDirty(changedPolicyRouteIdsV3(next, policy ?? null).size > 0);
  }, [policy]);

  const acceptPolicy = useCallback((next: MarketPolicyResponse) => {
    setDraft(toPolicyDraftV3(next));
    setDirty(false);
  }, []);

  useNavigationGuard({
    draft,
    dirty,
    busy: saveMutation.isPending || retryMutation.isPending,
    discard: () => {
      setDraft(policy ? toPolicyDraftV3(policy) : null);
      setDirty(false);
    },
  });

  const save = async () => {
    if (!draft || !catalogComplete) return;
    setBusyAction('policy-save');
    setMessage(null);
    try {
      const savedPolicy = await saveMutation.mutateAsync(configuredPolicyDraftV3(draft));
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
        text: requestFailureMessage(error, '路由策略提交失败，请稍后重试。'),
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
        text: requestFailureMessage(error, '路由策略重试失败，请稍后重试。'),
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
