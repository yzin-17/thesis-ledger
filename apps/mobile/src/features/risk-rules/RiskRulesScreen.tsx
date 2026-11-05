import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RiskRuleWire } from '@thesis-ledger/schemas';
import type { PortfolioStackParams } from '../../app/navigation-types';
import { confirmAction, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useMobileCommand } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { useRiskRules } from './risk-queries';
import { riskKinds, riskSeverities, riskScopes, isRiskPercentage } from './risk-rule-form';
export function RiskRulesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortfolioStackParams>>();
  const { api } = useMobileRuntime();
  const accounts = useAccounts();
  const rules = useRiskRules();
  const [archived, setArchived] = useState('active');
  const [feedback, setFeedback] = useState<string | null>(null);
  const mutation = useMobileCommand(
    (input: { rule: RiskRuleWire; action: 'archive' | 'restore' | 'enable' | 'disable' }) => {
      if (input.action === 'archive') return api.risk.archiveRule(input.rule.id);
      if (input.action === 'restore') return api.risk.restoreRule(input.rule.id);
      return api.risk.patchRule(input.rule.id, { enabled: input.action === 'enable' });
    },
  );
  const writable = canUseReadForWrite(accounts) && canUseReadForWrite(rules) && !mutation.isPending;
  const changeState = async (
    rule: RiskRuleWire,
    action: 'archive' | 'restore' | 'enable' | 'disable',
  ) => {
    if (
      !writable ||
      !(await confirmAction(
        '确认规则操作？',
        `${riskKinds.find((row) => row.value === rule.kind)?.label ?? rule.kind}，当前版本 ${rule.version}。归档保留历史；恢复后仍需手动启用。`,
        action === 'archive',
      ))
    )
      return;
    try {
      const result = await mutation.mutateAsync({ rule, action });
      setFeedback(
        result.refreshFailed
          ? '规则已更新，列表尚未刷新，请勿重复操作。'
          : `规则已更新至版本 ${result.result.version}。`,
      );
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page title="风险规则">
      <Copy muted>规则定义可跨实际与模拟范围使用；试算和事件按当前范围读取。</Copy>
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <QueryStatus
        query={rules}
        empty={rules.data?.length === 0}
        retry={() => void rules.refetch()}
      />
      <Action
        label="新建风险规则"
        primary
        disabled={!writable}
        onPress={() => navigation.navigate('RiskRuleEditor', {})}
      />
      <Action
        label="扫描当前范围"
        disabled={!writable}
        onPress={() => navigation.navigate('RiskEvaluate', {})}
      />
      <Choices
        label="归档筛选"
        value={archived}
        options={[
          { value: 'active', label: '当前规则' },
          { value: 'all', label: '包含已归档' },
        ]}
        onChange={setArchived}
      />
      <Feedback message={feedback} error={mutation.isError} />
      {rules.data
        ?.filter((rule) => archived === 'all' || !rule.archivedAt)
        .map((rule) => {
          const inScope =
            !rule.accountId || accounts.data?.some((row) => row.id === rule.accountId);
          const editable = writable && Boolean(inScope);
          return (
            <Section
              key={rule.id}
              testID={`risk-rule-${rule.id}`}
              title={riskKinds.find((row) => row.value === rule.kind)?.label ?? rule.kind}
            >
              <Copy>
                {riskScopes.find((row) => row.value === rule.scope)?.label} ·{' '}
                {rule.symbol ?? '无标的'} ·{' '}
                {accounts.data?.find((row) => row.id === rule.accountId)?.name ??
                  rule.accountId ??
                  '全组合'}{' '}
                · 阈值 {isRiskPercentage(rule.kind) ? `${rule.threshold * 100}%` : rule.threshold}
              </Copy>
              <Copy>
                {riskSeverities.find((row) => row.value === rule.severity)?.label} ·{' '}
                {rule.enabled ? '启用' : '停用'} · 版本 {rule.version}
                {rule.archivedAt ? ' · 已归档' : ''}
              </Copy>
              {rule.needsRepair ? (
                <Feedback message={`规则待修复：${rule.repairReason ?? '请核对账户绑定'}`} error />
              ) : null}
              <Action
                label="规则审计"
                onPress={() => navigation.navigate('RiskAudit', { ruleId: rule.id })}
              />
              {rule.archivedAt ? (
                <Action
                  label="恢复风险规则"
                  disabled={!editable}
                  onPress={() => void changeState(rule, 'restore')}
                />
              ) : (
                <>
                  <Action
                    label="编辑风险规则"
                    disabled={!editable}
                    onPress={() => navigation.navigate('RiskRuleEditor', { ruleId: rule.id })}
                  />
                  <Action
                    label="规则试算"
                    disabled={!editable || rule.needsRepair}
                    onPress={() => navigation.navigate('RiskEvaluate', { ruleId: rule.id })}
                  />
                  <Action
                    label={rule.enabled ? '停用风险规则' : '启用风险规则'}
                    disabled={!editable || rule.needsRepair}
                    onPress={() => void changeState(rule, rule.enabled ? 'disable' : 'enable')}
                  />
                  <Action
                    label="归档风险规则"
                    disabled={!editable}
                    destructive
                    onPress={() => void changeState(rule, 'archive')}
                  />
                </>
              )}
            </Section>
          );
        })}
    </Page>
  );
}
