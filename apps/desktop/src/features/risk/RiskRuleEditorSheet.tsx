import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CheckIcon, ChevronDownIcon, LoaderCircle } from 'lucide-react';

import type { Account, Position } from '../portfolio/portfolio.types.js';
import type {
  CreateRiskRuleInput,
  RiskRuleRecord,
  RiskRuleScope,
  RiskRuleSeverity,
} from './risk.types.js';
import {
  formatThreshold,
  isRiskRuleScopeAllowed,
  isPercentageRule,
  riskRuleKindLabel,
  riskRuleKindOptions,
  riskRuleNeedsAccount,
  riskRuleScopeOptionsForKind,
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

const ALL_ACCOUNTS_VALUE = '__all__';

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

type RiskRuleKindOption = (typeof riskRuleKindOptions)[number];

type RiskSecurityOption = {
  symbol: string;
  name: string;
};

const filterRiskRuleKinds = (option: RiskRuleKindOption, query: string) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return `${option.label} ${option.value}`.toLocaleLowerCase().includes(normalizedQuery);
};

const securityOptionLabel = (option: RiskSecurityOption) => `${option.symbol} · ${option.name}`;

const filterRiskSecurityOptions = (option: RiskSecurityOption, query: string) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return `${option.symbol} ${option.name}`.toLocaleLowerCase().includes(normalizedQuery);
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
  if (draft.kind && draft.scope && !isRiskRuleScopeAllowed(draft.kind, draft.scope)) {
    const allowedScopes = riskRuleScopeOptionsForKind(draft.kind)
      .map((option) => option.label)
      .join('、');
    errors.scope = `${riskRuleKindLabel(draft.kind)}仅支持${allowedScopes}范围。`;
  }
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
  if (draft.scope === 'security' && riskRuleNeedsAccount(draft.kind) && !draft.accountId)
    errors.accountId = '该规则需要绑定账户。';
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
    ...(draft.scope !== 'portfolio' && draft.accountId ? { accountId: draft.accountId } : {}),
  };
};

export function RiskRuleEditorSheet({
  open,
  rule,
  accounts,
  positions,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  rule: RiskRuleRecord | null;
  accounts: Account[];
  positions: Position[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateRiskRuleInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [errors, setErrors] = useState<RuleErrors>({});
  const [kindOpen, setKindOpen] = useState(false);
  const [kindQuery, setKindQuery] = useState(riskRuleKindLabel(emptyDraft.kind));
  const [securityOpen, setSecurityOpen] = useState(false);
  const [securityQuery, setSecurityQuery] = useState('');
  const editing = Boolean(rule);
  const securityNeedsAccount = riskRuleNeedsAccount(draft.kind);
  const selectableAccounts = useMemo(
    () => accounts.filter((account) => account.active !== false),
    [accounts],
  );

  const securityOptions = useMemo(() => {
    if (securityNeedsAccount && !draft.accountId) return [];
    const options = new Map<string, RiskSecurityOption>();
    positions.forEach((position) => {
      const account = accounts.find((candidate) => candidate.id === position.accountId);
      if (account?.active === false) return;
      if (draft.accountId && position.accountId !== draft.accountId) return;
      const symbol = position.symbol.trim();
      if (!symbol || options.has(symbol)) return;
      options.set(symbol, { symbol, name: position.asset.name || symbol });
    });
    return Array.from(options.values()).sort((left, right) =>
      left.symbol.localeCompare(right.symbol, 'zh-CN'),
    );
  }, [accounts, draft.accountId, positions, securityNeedsAccount]);

  useEffect(() => {
    if (!open) return;
    const nextDraft = draftFromRule(rule);
    setDraft(nextDraft);
    setKindQuery(riskRuleKindLabel(rule?.kind ?? emptyDraft.kind));
    setSecurityQuery(nextDraft.symbol);
    setKindOpen(false);
    setSecurityOpen(false);
    setErrors({});
  }, [open, rule]);

  useEffect(() => {
    if (!kindOpen) setKindQuery(riskRuleKindLabel(draft.kind));
  }, [draft.kind, kindOpen]);

  const selectedSecurityOption = useMemo(
    () => securityOptions.find((option) => option.symbol === draft.symbol) ?? null,
    [draft.symbol, securityOptions],
  );

  useEffect(() => {
    if (!securityOpen) {
      setSecurityQuery(
        selectedSecurityOption ? securityOptionLabel(selectedSecurityOption) : draft.symbol,
      );
    }
  }, [draft.symbol, securityOpen, selectedSecurityOption]);

  const thresholdPlaceholder = isPercentageRule(draft.kind) ? '例如 10' : '例如 120';
  const scopeOptions = useMemo(() => riskRuleScopeOptionsForKind(draft.kind), [draft.kind]);
  const selectedKindOption = useMemo(
    () => riskRuleKindOptions.find((option) => option.value === draft.kind) ?? null,
    [draft.kind],
  );
  const previewThreshold = parseThreshold(draft.kind, draft.threshold);
  const selectedAccountLabel = accounts.find((account) => account.id === draft.accountId)?.name;
  const preview = useMemo(
    () =>
      rulePreview({
        kind: draft.kind,
        scope: draft.scope,
        threshold: previewThreshold,
        symbol: draft.symbol,
        accountId: draft.accountId,
        ...(selectedAccountLabel ? { accountLabel: selectedAccountLabel } : {}),
      }),
    [
      draft.accountId,
      draft.kind,
      draft.scope,
      draft.symbol,
      previewThreshold,
      selectedAccountLabel,
    ],
  );
  const securityAccountValue = securityNeedsAccount
    ? draft.accountId || null
    : draft.accountId || ALL_ACCOUNTS_VALUE;
  const securityAccountPlaceholder = securityNeedsAccount ? '选择账户' : '全部账户';
  let securityDescription = '当前组合暂无已导入标的，请先录入持仓。';
  if (securityNeedsAccount && !draft.accountId) {
    securityDescription = '请先选择账户，再选择该账户已导入的标的。';
  } else if (securityOptions.length > 0) {
    securityDescription = draft.accountId
      ? '从所选账户已导入的标的中选择。'
      : '从当前组合已导入的标的中选择。';
  } else if (draft.accountId) {
    securityDescription = '所选账户暂无已导入标的。';
  }
  let securityPlaceholder = '暂无已导入标的';
  if (securityNeedsAccount && !draft.accountId) securityPlaceholder = '先选择账户';
  else if (securityOptions.length > 0) securityPlaceholder = '搜索代码或名称';

  const updateDraft = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleKindChange = (kind: string) => {
    const nextScopeOptions = riskRuleScopeOptionsForKind(kind);
    const nextScope = nextScopeOptions.some((option) => option.value === draft.scope)
      ? draft.scope
      : (nextScopeOptions[0]?.value ?? draft.scope);
    setDraft((current) => ({
      ...current,
      kind,
      scope: nextScope,
      symbol: nextScope === 'security' ? current.symbol : '',
      accountId: nextScope === 'portfolio' ? '' : current.accountId,
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next.kind;
      delete next.scope;
      delete next.symbol;
      delete next.accountId;
      return next;
    });
    setKindQuery(riskRuleKindLabel(kind));
  };

  const handleSecurityChange = (option: RiskSecurityOption) => {
    updateDraft('symbol', option.symbol);
    setSecurityQuery(securityOptionLabel(option));
  };

  const handleSecurityAccountChange = (accountId: string) => {
    setDraft((current) => {
      const symbolStillAvailable =
        !current.symbol ||
        positions.some(
          (position) =>
            position.symbol === current.symbol && (!accountId || position.accountId === accountId),
        );
      return {
        ...current,
        accountId,
        symbol: symbolStillAvailable ? current.symbol : '',
      };
    });
    setSecurityQuery('');
    setErrors((current) => {
      const next = { ...current };
      delete next.accountId;
      delete next.symbol;
      return next;
    });
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
        className="h-[100dvh] min-h-0 w-[680px] max-w-[calc(100%-16px)] overflow-hidden p-6 sm:max-w-[calc(100%-16px)]"
      >
        <div className="shrink-0">
          <SheetTitle>{editing ? '编辑风险规则' : '新建风险规则'}</SheetTitle>
          <SheetDescription id="risk-rule-editor-description">
            规则只负责确定性判断；保存后会记录版本和审计信息。
          </SheetDescription>
        </div>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col gap-4" onSubmit={handleFormSubmit}>
          <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
            <FieldGroup>
              <Field invalid={Boolean(errors.kind)}>
                <FieldLabel htmlFor="risk-rule-kind">类型</FieldLabel>
                <Combobox.Root
                  items={riskRuleKindOptions}
                  value={selectedKindOption}
                  inputValue={kindQuery}
                  autoHighlight
                  filter={filterRiskRuleKinds}
                  itemToStringLabel={(option) => option.label}
                  itemToStringValue={(option) => option.value}
                  onOpenChange={(nextOpen) => {
                    setKindOpen(nextOpen);
                    if (nextOpen) setKindQuery('');
                  }}
                  onInputValueChange={(value) => setKindQuery(value)}
                  onValueChange={(option) => {
                    if (option) handleKindChange(option.value);
                  }}
                >
                  <InputGroup className="h-9" aria-invalid={Boolean(errors.kind)}>
                    <Combobox.Input
                      id="risk-rule-kind"
                      data-slot="input-group-control"
                      className="h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2.5 py-2 pr-1 text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0"
                      placeholder="搜索规则类型"
                      aria-label="搜索规则类型"
                      aria-invalid={Boolean(errors.kind)}
                    />
                    <InputGroupAddon align="inline-end">
                      <ChevronDownIcon aria-hidden="true" />
                    </InputGroupAddon>
                  </InputGroup>
                  <Combobox.Portal>
                    <Combobox.Positioner
                      className="layer-popover"
                      side="bottom"
                      align="start"
                      sideOffset={4}
                    >
                      <Combobox.Popup
                        aria-label="规则类型选项"
                        className="w-(--anchor-width) overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
                      >
                        <Combobox.List className="max-h-72 overflow-auto p-1">
                          <Combobox.Group>
                            {riskRuleKindOptions.map((option, index) => (
                              <Combobox.Item
                                key={option.value}
                                value={option}
                                index={index}
                                className="relative flex w-full cursor-default items-center rounded-sm px-3 py-2 pr-9 text-left text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                              >
                                <span className="truncate">{option.label}</span>
                                <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                                  <CheckIcon aria-hidden="true" />
                                </Combobox.ItemIndicator>
                              </Combobox.Item>
                            ))}
                          </Combobox.Group>
                          <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground">
                            没有匹配的规则类型
                          </Combobox.Empty>
                        </Combobox.List>
                      </Combobox.Popup>
                    </Combobox.Positioner>
                  </Combobox.Portal>
                </Combobox.Root>
                {errors.kind && <FieldError>{errors.kind}</FieldError>}
              </Field>

              <Field invalid={Boolean(errors.scope)}>
                <FieldLabel htmlFor="risk-rule-scope">范围</FieldLabel>
                <FieldDescription>
                  规则配置对实际和模拟模式共用。当前类型支持：
                  {scopeOptions.map((option) => option.label).join('、')}。
                </FieldDescription>
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
                  {riskScopeOptions.map((option) => {
                    const isAllowed = scopeOptions.some((scope) => scope.value === option.value);
                    return (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        aria-label={option.label}
                        disabled={!isAllowed}
                      >
                        {option.label}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
                {errors.scope && <FieldError>{errors.scope}</FieldError>}
              </Field>

              {draft.scope === 'security' && (
                <>
                  <Field invalid={Boolean(errors.accountId)}>
                    <FieldLabel htmlFor="risk-rule-security-account">
                      {securityNeedsAccount ? '账户' : '账户范围'}
                    </FieldLabel>
                    <FieldDescription>
                      {securityNeedsAccount
                        ? '成本、收益和峰值类规则按账户持仓分别计算。'
                        : '不指定时，规则应用于持有该标的的所有账户。'}
                    </FieldDescription>
                    <Select
                      value={securityAccountValue}
                      onValueChange={(value) => {
                        handleSecurityAccountChange(
                          value === ALL_ACCOUNTS_VALUE ? '' : (value ?? ''),
                        );
                      }}
                    >
                      <SelectTrigger
                        id="risk-rule-security-account"
                        className="w-full"
                        aria-invalid={Boolean(errors.accountId)}
                      >
                        <SelectValue placeholder={securityAccountPlaceholder}>
                          {(value: string | null) =>
                            accounts.find((account) => account.id === value)?.name ??
                            securityAccountPlaceholder
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {!securityNeedsAccount && (
                            <SelectItem value={ALL_ACCOUNTS_VALUE}>全部账户</SelectItem>
                          )}
                          {selectableAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {errors.accountId && <FieldError>{errors.accountId}</FieldError>}
                  </Field>

                  <Field invalid={Boolean(errors.symbol)}>
                    <FieldLabel htmlFor="risk-rule-symbol">证券标的</FieldLabel>
                    <FieldDescription>{securityDescription}</FieldDescription>
                    <Combobox.Root
                      items={securityOptions}
                      value={selectedSecurityOption}
                      inputValue={securityQuery}
                      autoHighlight
                      filter={filterRiskSecurityOptions}
                      itemToStringLabel={securityOptionLabel}
                      itemToStringValue={(option) => option.symbol}
                      onOpenChange={(nextOpen) => {
                        setSecurityOpen(nextOpen);
                        if (nextOpen) setSecurityQuery('');
                      }}
                      onInputValueChange={(value) => setSecurityQuery(value)}
                      onValueChange={(option) => {
                        if (option) handleSecurityChange(option);
                      }}
                    >
                      <InputGroup className="h-9" aria-invalid={Boolean(errors.symbol)}>
                        <Combobox.Input
                          id="risk-rule-symbol"
                          data-slot="input-group-control"
                          className="h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2.5 py-2 pr-1 text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0"
                          placeholder={securityPlaceholder}
                          aria-label="搜索证券标的"
                          aria-invalid={Boolean(errors.symbol)}
                          disabled={securityOptions.length === 0}
                        />
                        <InputGroupAddon align="inline-end">
                          <ChevronDownIcon aria-hidden="true" />
                        </InputGroupAddon>
                      </InputGroup>
                      <Combobox.Portal>
                        <Combobox.Positioner
                          className="layer-popover"
                          side="bottom"
                          align="start"
                          sideOffset={4}
                        >
                          <Combobox.Popup
                            aria-label="已导入证券标的选项"
                            className="w-(--anchor-width) overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
                          >
                            <Combobox.List className="max-h-72 overflow-auto p-1">
                              <Combobox.Group>
                                {securityOptions.map((option, index) => (
                                  <Combobox.Item
                                    key={option.symbol}
                                    value={option}
                                    index={index}
                                    className="relative flex w-full cursor-default items-start rounded-sm px-3 py-2 pr-9 text-left outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                                  >
                                    <span className="min-w-0">
                                      <code className="block font-mono text-xs text-muted-foreground">
                                        {option.symbol}
                                      </code>
                                      <strong className="mt-0.5 block truncate text-sm font-medium">
                                        {option.name}
                                      </strong>
                                    </span>
                                    <Combobox.ItemIndicator className="pointer-events-none absolute right-2 top-2 flex size-4 items-center justify-center">
                                      <CheckIcon aria-hidden="true" />
                                    </Combobox.ItemIndicator>
                                  </Combobox.Item>
                                ))}
                              </Combobox.Group>
                              <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground">
                                {securityOptions.length > 0
                                  ? '没有匹配的已导入标的'
                                  : '暂无已导入标的'}
                              </Combobox.Empty>
                            </Combobox.List>
                          </Combobox.Popup>
                        </Combobox.Positioner>
                      </Combobox.Portal>
                    </Combobox.Root>
                    {errors.symbol && <FieldError>{errors.symbol}</FieldError>}
                  </Field>
                </>
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
                        {selectableAccounts.map((account) => (
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
            </FieldGroup>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
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
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
