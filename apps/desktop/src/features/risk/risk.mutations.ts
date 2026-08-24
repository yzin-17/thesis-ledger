import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createRiskRule,
  deleteRiskRule,
  patchRiskRule,
  scanRisk,
  testRiskRule,
} from './risk.api.js';
import { riskKeys } from './risk.queries.js';
import type { CreateRiskRuleInput, RiskContext, RiskRuleRecord } from './risk.types.js';

export const useCreateRiskRuleMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRiskRuleInput) => createRiskRule(input),
    onSuccess: () => client.invalidateQueries({ queryKey: riskKeys.rules() }),
  });
};

export const usePatchRiskRuleMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, patch }: { ruleId: string; patch: object }): Promise<RiskRuleRecord> =>
      patchRiskRule(ruleId, patch),
    onSuccess: (updatedRule) => {
      client.setQueryData<RiskRuleRecord[]>(riskKeys.rules(), (rules) =>
        rules?.map((rule) => (rule.id === updatedRule.id ? updatedRule : rule)),
      );
    },
  });
};

export const useDeleteRiskRuleMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId }: { ruleId: string }): Promise<RiskRuleRecord> => deleteRiskRule(ruleId),
    onSuccess: (updatedRule) => {
      client.setQueryData<RiskRuleRecord[]>(riskKeys.rules(), (rules) =>
        rules?.map((rule) => (rule.id === updatedRule.id ? updatedRule : rule)),
      );
    },
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
