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

// 单条响应不带 assetName，直接写缓存会让标的名丢失；统一失效重取列表
const invalidateRulesOnSuccess =
  (client: QueryClient) => async () => {
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
