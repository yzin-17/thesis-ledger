import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LoaderCircle } from 'lucide-react';

import type { Account } from '../portfolio/portfolio.types.js';
import type {
  CreateRiskRuleInput,
  RiskRuleRecord,
  RiskRuleScope,
  RiskRuleSeverity,
} from './risk.types.js';
import {
  formatThreshold,
  isPercentageRule,
  riskRuleKindLabel,
  riskRuleKindOptions,
  riskScopeOptions,
  riskSeverityOptions,
  rulePreview,
} from './risk.format.js';

type RuleDraft = {
  kind: string;
  scope: RiskRuleScope;
  severity: RiskRuleSeverity;
  threshold: string;
  symbol: string;
  accountId: string;
  enabled: boolean;
};

type RuleErrors = Partial<
  Record<'kind' | 'scope' | 'severity' | 'threshold' | 'symbol' | 'accountId', string>
>;

const emptyDraft: RuleDraft = {
  kind: 'price-below',
  scope: 'security',
  severity: 'warning',
  threshold: '',
  symbol: '',
  accountId: '',
  enabled: true,
};

const draftFromRule = (rule: RiskRuleRecord | null): RuleDraft => {
  if (!rule) return emptyDraft;
  const threshold = isPercentageRule(rule.kind) ? rule.threshold * 100 : rule.threshold;
  return {
    kind: rule.kind,
    scope: rule.scope,
    severity: rule.severity,
    threshold: String(threshold),
    symbol: rule.symbol ?? '',
    accountId: rule.accountId ?? '',
    enabled: rule.enabled,
  };
};

const thresholdUnit = (kind: string) => (isPercentageRule(kind) ? '%' : '数值');

const saveRuleLabel = (pending: boolean, editing: boolean) => {
  if (pending) return '保存中…';
  if (editing) return '保存修改';
  return '创建规则';
};

const parseThreshold = (kind: string, value: string) => {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) return null;
  return isPercentageRule(kind) ? parsed / 100 : parsed;
};

const blockedPortfolioScopeChange = (
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
  const errors: RuleErrors = {};
  const thresholdInput = Number(draft.threshold);
  if (!draft.kind) errors.kind = '请选择规则类型。';
  if (!draft.scope) errors.scope = '请选择规则范围。';
  const scopeChangeError = blockedPortfolioScopeChange(existingScope, draft.scope);
  if (scopeChangeError) errors.scope = scopeChangeError;
  if (!draft.severity) errors.severity = '请选择严重级别。';
  if (!draft.threshold.trim() || !Number.isFinite(thresholdInput)) {
    errors.threshold = '请输入有效阈值。';
  } else if (isPercentageRule(draft.kind) && (thresholdInput <= 0 || thresholdInput > 100)) {
    errors.threshold = '百分比阈值需大于 0 且不超过 100%。';
  } else if (!isPercentageRule(draft.kind) && thresholdInput < 0) {
    errors.threshold = '数值阈值不能小于 0。';
  }
  if (draft.scope === 'security' && !draft.symbol.trim())
    errors.symbol = '证券范围必须填写证券代码。';
  if (draft.scope === 'account' && !draft.accountId) errors.accountId = '账户范围必须选择账户。';
  return errors;
};

export const toInput = (draft: RuleDraft): CreateRiskRuleInput => {
  const threshold = parseThreshold(draft.kind, draft.threshold) ?? 0;
  return {
    kind: draft.kind,
    scope: draft.scope,
    severity: draft.severity,
    threshold,
    enabled: draft.enabled,
    ...(draft.scope === 'security' ? { symbol: draft.symbol.trim() } : {}),
    ...(draft.scope === 'account' ? { accountId: draft.accountId } : {}),
  };
};

export function RiskRuleEditorSheet({
  open,
  rule,
  accounts,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  rule: RiskRuleRecord | null;
  accounts: Account[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateRiskRuleInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [errors, setErrors] = useState<RuleErrors>({});
  const editing = Boolean(rule);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFromRule(rule));
    setErrors({});
  }, [open, rule]);

  const thresholdPlaceholder = isPercentageRule(draft.kind) ? '例如 10' : '例如 120';
  const previewThreshold = parseThreshold(draft.kind, draft.threshold);
  const preview = useMemo(
    () =>
      rulePreview({
        kind: draft.kind,
        scope: draft.scope,
        threshold: previewThreshold,
        symbol: draft.symbol,
        accountId: draft.accountId,
      }),
    [draft.accountId, draft.kind, draft.scope, draft.symbol, previewThreshold],
  );

  const updateDraft = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateDraft(draft, rule?.scope ?? null);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const saved = await onSubmit(toInput(draft));
    if (saved) onOpenChange(false);
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    void handleSubmit(event);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-describedby="risk-rule-editor-description"
        className="h-[100dvh] w-[620px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
      >
        <SheetHeader className="p-0">
          <SheetTitle>{editing ? '编辑风险规则' : '新建风险规则'}</SheetTitle>
          <SheetDescription id="risk-rule-editor-description">
            规则只负责确定性判断；保存后会记录版本和审计信息。
          </SheetDescription>
        </SheetHeader>
        <form
          className="form-card min-h-0 w-full max-w-none content-start"
          onSubmit={handleFormSubmit}
        >
          <FieldGroup>
            <Field invalid={Boolean(errors.kind)}>
              <FieldLabel htmlFor="risk-rule-kind">类型</FieldLabel>
              <Select
                value={draft.kind}
                onValueChange={(value) => value && updateDraft('kind', value)}
              >
                <SelectTrigger
                  id="risk-rule-kind"
                  className="w-full"
                  aria-invalid={Boolean(errors.kind)}
                >
                  <SelectValue>
                    {(value: string | null) => riskRuleKindLabel(value ?? '')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {riskRuleKindOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {errors.kind && <FieldError>{errors.kind}</FieldError>}
            </Field>

            <Field invalid={Boolean(errors.scope)}>
              <FieldLabel htmlFor="risk-rule-scope">范围</FieldLabel>
              <FieldDescription>规则配置对实际和模拟模式共用。</FieldDescription>
              <ToggleGroup
                id="risk-rule-scope"
                value={[draft.scope]}
                aria-label="规则范围"
                aria-invalid={Boolean(errors.scope)}
                onValueChange={(value) => {
                  const nextScope = value[0] as RiskRuleScope | undefined;
                  if (!nextScope) return;
                  const scopeChangeError = blockedPortfolioScopeChange(
                    rule?.scope ?? null,
                    nextScope,
                  );
                  if (scopeChangeError) {
                    setErrors((current) => ({ ...current, scope: scopeChangeError }));
                    return;
                  }
                  updateDraft('scope', nextScope);
                }}
              >
                {riskScopeOptions.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    aria-label={option.label}
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {errors.scope && <FieldError>{errors.scope}</FieldError>}
            </Field>

            {draft.scope === 'security' && (
              <Field invalid={Boolean(errors.symbol)}>
                <FieldLabel htmlFor="risk-rule-symbol">证券代码</FieldLabel>
                <Input
                  id="risk-rule-symbol"
                  value={draft.symbol}
                  placeholder="例如 159516.SZ"
                  aria-invalid={Boolean(errors.symbol)}
                  onChange={(event) => updateDraft('symbol', event.target.value)}
                />
                {errors.symbol && <FieldError>{errors.symbol}</FieldError>}
              </Field>
            )}

            {draft.scope === 'account' && (
              <Field invalid={Boolean(errors.accountId)}>
                <FieldLabel htmlFor="risk-rule-account">账户</FieldLabel>
                <Select
                  value={draft.accountId}
                  onValueChange={(value) => value && updateDraft('accountId', value)}
                >
                  <SelectTrigger
                    id="risk-rule-account"
                    className="w-full"
                    aria-invalid={Boolean(errors.accountId)}
                  >
                    <SelectValue placeholder="选择账户">
                      {(value: string | null) =>
                        accounts.find((account) => account.id === value)?.name ?? '选择账户'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {errors.accountId && <FieldError>{errors.accountId}</FieldError>}
              </Field>
            )}

            <Field invalid={Boolean(errors.threshold)}>
              <FieldLabel htmlFor="risk-rule-threshold">
                阈值（{thresholdUnit(draft.kind)}）
              </FieldLabel>
              <FieldDescription>
                {isPercentageRule(draft.kind)
                  ? `提交时将 ${draft.threshold || '输入值'}% 转换为 decimal。`
                  : '按规则原始数值提交。'}
              </FieldDescription>
              <Input
                id="risk-rule-threshold"
                value={draft.threshold}
                type="number"
                min={isPercentageRule(draft.kind) ? 0 : undefined}
                max={isPercentageRule(draft.kind) ? 100 : undefined}
                step="any"
                placeholder={thresholdPlaceholder}
                aria-invalid={Boolean(errors.threshold)}
                onChange={(event) => updateDraft('threshold', event.target.value)}
              />
              {errors.threshold && <FieldError>{errors.threshold}</FieldError>}
            </Field>

            <Field invalid={Boolean(errors.severity)}>
              <FieldLabel htmlFor="risk-rule-severity">严重级别</FieldLabel>
              <ToggleGroup
                id="risk-rule-severity"
                value={[draft.severity]}
                aria-label="规则严重级别"
                aria-invalid={Boolean(errors.severity)}
                onValueChange={(value) => {
                  const nextSeverity = value[0] as RiskRuleSeverity | undefined;
                  if (nextSeverity) updateDraft('severity', nextSeverity);
                }}
              >
                {riskSeverityOptions.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    aria-label={option.label}
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {errors.severity && <FieldError>{errors.severity}</FieldError>}
            </Field>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="m-0 text-sm font-medium">创建后立即启用</p>
                <p className="field-hint">启用后会参与下一次当前模式风险扫描。</p>
              </div>
              <Switch
                variant="risk"
                checked={draft.enabled}
                aria-label="创建后立即启用"
                onCheckedChange={(checked) => updateDraft('enabled', checked)}
              >
                <SwitchThumb variant="risk" />
              </Switch>
            </div>

            <div className="rounded-md bg-muted/50 p-3" aria-live="polite">
              <p className="m-0 text-xs font-medium text-muted-foreground">规则预览</p>
              <p className="mt-1 mb-0 text-sm font-medium">{preview}</p>
              {previewThreshold !== null && (
                <p className="field-hint mt-1">
                  提交阈值：{formatThreshold(draft.kind, previewThreshold)}
                </p>
              )}
            </div>

            <SheetFooter className="flex-row justify-end p-0">
              <Button
                type="button"
                variant="outline"
                className="secondary"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {saveRuleLabel(pending, editing)}
              </Button>
            </SheetFooter>
          </FieldGroup>
        </form>
      </SheetContent>
    </Sheet>
  );
}
