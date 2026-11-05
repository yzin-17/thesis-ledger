import { useRoute, type RouteProp } from '@react-navigation/native';
import type { PortfolioStackParams } from '../../app/navigation-types';
import { useAccounts, useValuation } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import { Copy, Page, QueryStatus } from '../../components/MobilePrimitives';
import { useRiskRules } from './risk-queries';
import { RiskRuleForm } from './RiskRuleForm';
import { riskKinds } from './risk-rule-form';
export function RiskRuleEditor() {
  const { params } = useRoute<RouteProp<PortfolioStackParams, 'RiskRuleEditor'>>();
  const accounts = useAccounts();
  const valuation = useValuation();
  const rules = useRiskRules();
  const rule = rules.data?.find((row) => row.id === params.ruleId);
  const present = !params.ruleId || Boolean(rule);
  const supported = !rule || riskKinds.some((row) => row.value === rule.kind);
  const inScope = !rule?.accountId || accounts.data?.some((row) => row.id === rule.accountId);
  return (
    <Page title="风险规则编辑">
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <QueryStatus query={valuation} retry={() => void valuation.refetch()} />
      <QueryStatus query={rules} retry={() => void rules.refetch()} />
      {!present ? <Copy>规则不可读取，请返回列表。</Copy> : null}
      {!supported ? <Copy>当前规则类型尚无法编辑，请保留原规则并核对版本。</Copy> : null}
      {present && supported && rules.data && accounts.data ? (
        <RiskRuleForm
          {...(rule ? { rule } : {})}
          accounts={accounts.data}
          portfolio={valuation.data}
          readable={
            Boolean(inScope) &&
            canUseReadForWrite(accounts) &&
            canUseReadForWrite(rules) &&
            canUseReadForWrite(valuation)
          }
          reload={async () => {
            const result = await rules.refetch();
            if (result.isError || !result.data) throw result.error ?? new Error('规则读取失败。');
            return result.data;
          }}
        />
      ) : null}
    </Page>
  );
}
