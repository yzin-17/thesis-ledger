import { percentTextToRatio, ratioToPercentText } from '@thesis-ledger/domain';
import type {
  CreateRiskRuleInput,
  RiskRuleRecord,
  RiskRuleScope,
  RiskRuleSeverity,
} from './risk.types.js';
import {
  isPercentageRule,
  isRiskRuleScopeAllowed,
  riskRuleKindLabel,
  riskRuleNeedsAccount,
  riskRuleScopeOptionsForKind,
} from './risk.format.js';
import {
  riskRuleNotificationForm,
  parseRuleNotificationForm,
  riskRuleNotificationErrors,
  type RuleNotificationForm,
} from './risk-rule-notification-form.js';
export type RuleDraft = {
  notification?: RuleNotificationForm;
  kind: string;
  scope: RiskRuleScope;
  severity: RiskRuleSeverity;
  threshold: string;
  symbol: string;
  accountId: string;
  enabled: boolean;
};

export type RuleErrors = Partial<
  Record<
    'kind' | 'scope' | 'severity' | 'threshold' | 'symbol' | 'accountId' | 'notification',
    string
  >
>;

export const emptyDraft: RuleDraft = {
  notification: riskRuleNotificationForm(null),
  kind: 'price-below',
  scope: 'security',
  severity: 'warning',
  threshold: '',
  symbol: '',
  accountId: '',
  enabled: true,
};

export const draftFromRule = (rule: RiskRuleRecord | null): RuleDraft => {
  if (!rule) return emptyDraft;
  const threshold = isPercentageRule(rule.kind)
    ? ratioToPercentText(rule.threshold)
    : String(rule.threshold);
  return {
    notification: riskRuleNotificationForm(rule),
    kind: rule.kind,
    scope: rule.scope,
    severity: rule.severity,
    threshold,
    symbol: rule.symbol ?? '',
    accountId: rule.accountId ?? '',
    enabled: rule.enabled,
  };
};

export const thresholdUnit = (kind: string) => (isPercentageRule(kind) ? '%' : '数值');

export const saveRuleLabel = (pending: boolean, editing: boolean) => {
  if (pending) return '保存中…';
  if (editing) return '保存修改';
  return '创建规则';
};

export const parseThreshold = (kind: string, value: string) => {
  if (!value.trim()) return null;
  if (isPercentageRule(kind)) return percentTextToRatio(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const blockedPortfolioScopeChange = (
  existingScope: RiskRuleScope | null,
  nextScope: RiskRuleScope,
) => {
  if (!existingScope || existingScope === nextScope || nextScope !== 'portfolio') return null;
  if (existingScope === 'security') {
    return '已有证券规则不能切换为组合范围，请新建组合规则。';
  }
  return '已有账户规则不能切换为组合范围，请新建组合规则。';
};

export const validateDraft = (
  draft: RuleDraft,
  existingScope: RiskRuleScope | null = null,
): RuleErrors => {
  const errors: RuleErrors = riskRuleNotificationErrors(draft.notification);
  const thresholdInput = parseThreshold(draft.kind, draft.threshold);
  if (!draft.kind) errors.kind = '请选择规则类型。';
  validateRuleDraftScope(draft, existingScope, errors);
  if (!draft.severity) errors.severity = '请选择严重级别。';
  if (thresholdInput === null) {
    errors.threshold = '请输入有效阈值。';
  } else if (isPercentageRule(draft.kind) && (thresholdInput <= 0 || thresholdInput > 1)) {
    errors.threshold = '百分比阈值需大于 0 且不超过 100%。';
  } else if (!isPercentageRule(draft.kind) && thresholdInput < 0) {
    errors.threshold = '数值阈值不能小于 0。';
  }
  if (draft.scope === 'security' && !draft.symbol.trim())
    errors.symbol = '证券范围必须填写证券代码。';
  if (draft.scope === 'security' && riskRuleNeedsAccount(draft.kind) && !draft.accountId)
    errors.accountId = '该规则需要绑定账户。';
  if (draft.scope === 'account' && !draft.accountId) errors.accountId = '账户范围必须选择账户。';
  return errors;
};

export const toInput = (draft: RuleDraft): CreateRiskRuleInput => {
  const threshold = parseThreshold(draft.kind, draft.threshold);
  if (threshold === null) throw new Error('请输入有效阈值。');
  return {
    ...(draft.notification ? { notification: parseRuleNotificationForm(draft.notification) } : {}),
    kind: draft.kind,
    scope: draft.scope,
    severity: draft.severity,
    threshold,
    enabled: draft.enabled,
    ...(draft.scope === 'security' ? { symbol: draft.symbol.trim() } : {}),
    ...(draft.scope !== 'portfolio' && draft.accountId ? { accountId: draft.accountId } : {}),
  };
};

export function validateRuleDraftScope(
  draft: RuleDraft,
  existingScope: RiskRuleScope | null,
  errors: RuleErrors,
) {
  if (!draft.scope) errors.scope = '请选择规则范围。';
  if (draft.kind && draft.scope && !isRiskRuleScopeAllowed(draft.kind, draft.scope)) {
    const allowedScopes = riskRuleScopeOptionsForKind(draft.kind)
      .map((option) => option.label)
      .join('、');
    errors.scope = `${riskRuleKindLabel(draft.kind)}仅支持${allowedScopes}范围。`;
  }
  const scopeChangeError = blockedPortfolioScopeChange(existingScope, draft.scope);
  if (scopeChangeError) errors.scope = scopeChangeError;
}
