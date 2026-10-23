import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  createRiskRule,
  deleteRiskRule,
  patchRiskRule,
  restoreRiskRule,
  scanRisk,
  testRiskRule,
} from './risk.api.js';
import { riskKeys } from './risk.queries.js';
import type { CreateRiskRuleInput, RiskContext, RiskRuleRecord } from './risk.types.js';

// 先保留已确认的版本，再重取完整列表；单条响应未带标的名时保留原名称。
const invalidateRulesOnSuccess = (client: QueryClient) => async (saved: RiskRuleRecord) => {
  client.setQueryData<RiskRuleRecord[]>(riskKeys.rules(), (current) => {
    if (!current) return current;
    const previous = current.find((rule) => rule.id === saved.id);
    const merged = { ...previous, ...saved };
    if (saved.assetName === undefined && previous?.assetName !== undefined) {
      merged.assetName = previous.assetName;
    }
    if (!previous) return [merged, ...current];
    return current.map((rule) => (rule.id === saved.id ? merged : rule));
  });
  await client.invalidateQueries({ queryKey: riskKeys.rules() });
};

export const useCreateRiskRuleMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRiskRuleInput) => createRiskRule(input),
    onSuccess: invalidateRulesOnSuccess(client),
  });
};

export const usePatchRiskRuleMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, patch }: { ruleId: string; patch: object }): Promise<RiskRuleRecord> =>
      patchRiskRule(ruleId, patch),
    onSuccess: invalidateRulesOnSuccess(client),
  });
};

export const useDeleteRiskRuleMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId }: { ruleId: string }): Promise<RiskRuleRecord> => deleteRiskRule(ruleId),
    onSuccess: invalidateRulesOnSuccess(client),
  });
};

export const useRestoreRiskRuleMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId }: { ruleId: string }): Promise<RiskRuleRecord> =>
      restoreRiskRule(ruleId),
    onSuccess: invalidateRulesOnSuccess(client),
  });
};

export const useTestRiskRuleMutation = () =>
  useMutation({
    mutationFn: ({ ruleId, contexts }: { ruleId: string; contexts: RiskContext[] }) =>
      testRiskRule(ruleId, contexts),
  });

export const useScanRiskMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ contexts, scanId }: { contexts: RiskContext[]; scanId: string }) =>
      scanRisk(contexts, scanId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: riskKeys.events('actual') }),
        client.invalidateQueries({ queryKey: riskKeys.events('shadow') }),
        client.invalidateQueries({ queryKey: riskKeys.notifications() }),
        client.invalidateQueries({ queryKey: riskKeys.rules() }),
      ]);
    },
  });
};
