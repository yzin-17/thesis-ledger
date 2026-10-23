import { useState } from 'react';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import type { AccountResponse, RiskRuleWire } from '@thesis-ledger/schemas';
import type { PortfolioValuationResponse } from '@thesis-ledger/api-client';
import { useDirtyForm, useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import {
  allowedRiskScopes,
  buildRiskInput,
  isRiskPercentage,
  riskForm,
  riskKinds,
  riskScopes,
  riskSeverities,
  type RiskForm,
} from './risk-rule-form';
export function RiskRuleForm({
  rule,
  accounts,
  portfolio,
  readable,
  reload,
}: {
  rule?: RiskRuleWire;
  accounts: AccountResponse[];
  portfolio: PortfolioValuationResponse | undefined;
  readable: boolean;
  reload: () => Promise<RiskRuleWire[]>;
}) {
  const { api } = useMobileRuntime();
  const [current, setCurrent] = useState(rule);
  const [form, setForm] = useState(() => riskForm(rule));
  const [saved, setSaved] = useState(form);
  const [search, setSearch] = useState('');
  const [allKinds, setAllKinds] = useState(false);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useDirtyForm(dirty, () => setForm(saved));
  const mutation = useMobileCommand((value: RiskForm) => {
    const input = buildRiskInput(value, current);
    if (current) return api.risk.patchRule(current.id, input);
    return api.risk.createRule(input);
  });
  const blocked =
    !readable ||
    locked ||
    mutation.isPending ||
    Boolean(current?.archivedAt) ||
    Boolean(rule && current && rule.version !== current.version) ||
    Boolean(current?.sourcePlanId);
  const change = (patch: Partial<RiskForm>) => setForm((value) => ({ ...value, ...patch }));
  const submit = async () => {
    if (blocked || !dirty) return;
    try {
      buildRiskInput(form, current);
      if (
        form.enabled &&
        !current?.enabled &&
        !(await confirmAction('启用这条风险规则？', '启用后会参与后续扫描。规则试算不会外发通知。'))
      )
        return;
      const result = await mutation.mutateAsync(form);
      const persisted = riskForm(result.result);
      setCurrent(result.result);
      setForm(persisted);
      setSaved(persisted);
      setFeedback(
        result.refreshFailed
          ? '规则已保存，列表尚未刷新，请勿重复保存。'
          : `规则已保存至版本 ${result.result.version}。`,
      );
    } catch (error) {
      if (!(
        error instanceof ThesisLedgerApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 409
      ))
        setLocked(true);
      setFeedback(failureMessage(error));
    }
  };
  const reconcile = async () => {
    try {
      const rows = await reload();
      if (!(await confirmAction('重新核对规则？', '当前输入保留，请先核对是否已经创建或更新。')))
        return;
      if (current) {
        const latest = rows.find((row) => row.id === current.id);
        if (!latest) throw new Error('原规则已不可读取。');
        setCurrent(latest);
      } else if (
        rows.some(
          (row) =>
            row.kind === form.kind &&
            row.symbol === (form.symbol || null) &&
            row.threshold === buildRiskInput(form).threshold,
        )
      ) {
        throw new Error('发现相同目标及阈值的规则，请返回列表核对，避免重复创建。');
      }
      setLocked(false);
      setFeedback('已重新核对，请确认输入后保存。');
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  const kinds = riskKinds.filter(
    (row) => row.value === form.kind || row.label.toLowerCase().includes(search.toLowerCase()),
  );
  const symbols = new Map(
    (portfolio?.positions ?? [])
      .filter((row) => !form.accountId || row.accountId === form.accountId)
      .map((row) => [row.symbol, row.asset?.name ?? row.symbol]),
  );
  return (
    <Section title={current ? '编辑风险规则' : '新建风险规则'}>
      <Copy muted>版本 {current?.version ?? '新规则'} · 新规则默认停用，启用需要明确选择。</Copy>
      <Field label="搜索规则类型" value={search} onChange={setSearch} />
      <Choices
        label="风险规则类型"
        value={form.kind}
        options={allKinds || search ? kinds : kinds.slice(0, 6)}
        onChange={(kind) => {
          const scopes = allowedRiskScopes(kind);
          change({
            kind,
            scope: scopes.some((row) => row.value === form.scope) ? form.scope : scopes[0]!.value,
          });
        }}
        disabled={mutation.isPending}
      />
      <Action
        label={allKinds ? '收起规则类型' : '更多规则类型'}
        onPress={() => setAllKinds((value) => !value)}
      />
      <Choices
        label="规则作用范围"
        value={form.scope}
        options={allowedRiskScopes(form.kind)}
        onChange={(scope) => change({ scope, symbol: '', accountId: '' })}
        disabled={mutation.isPending}
      />
      {form.scope !== 'portfolio' ? (
        <Choices
          label="规则绑定账户"
          value={form.accountId}
          options={[
            { value: '', label: '全部账户／未指定' },
            ...accounts
              .filter((row) => row.active)
              .map((row) => ({ value: row.id, label: row.name })),
          ]}
          onChange={(accountId) => change({ accountId, symbol: '' })}
          disabled={mutation.isPending}
        />
      ) : null}
      {form.scope === 'security' ? (
        <Choices
          label="规则持仓标的"
          value={form.symbol}
          options={[...symbols].map(([value, label]) => ({ value, label: `${label} · ${value}` }))}
          onChange={(symbol) => change({ symbol })}
          disabled={mutation.isPending}
        />
      ) : null}
      <Field
        label={isRiskPercentage(form.kind) ? '风险阈值（%）' : '风险阈值（数值）'}
        value={form.threshold}
        onChange={(threshold) => change({ threshold })}
        keyboardType="decimal-pad"
        editable={!mutation.isPending}
      />
      <Choices
        label="规则严重级别"
        value={form.severity}
        options={riskSeverities}
        onChange={(severity) => change({ severity })}
        disabled={mutation.isPending}
      />
      <Choices
        label="规则启用状态"
        value={form.enabled ? 'enabled' : 'disabled'}
        options={[
          { value: 'disabled', label: '停用' },
          { value: 'enabled', label: '启用' },
        ]}
        onChange={(value) => change({ enabled: value === 'enabled' })}
        disabled={mutation.isPending}
      />
      <Copy muted>
        {riskKinds.find((row) => row.value === form.kind)?.label} ·{' '}
        {riskScopes.find((row) => row.value === form.scope)?.label} · {form.threshold || '待填写'}
        {isRiskPercentage(form.kind) ? '%' : ''}
      </Copy>
      {rule && current && rule.version !== current.version ? (
        <Feedback message="规则版本已变化，请重新核对；输入已保留。" error />
      ) : null}
      <Feedback message={feedback} error={mutation.isError || locked} />
      <Action
        label="重新核对风险规则"
        disabled={mutation.isPending}
        onPress={() => void reconcile()}
      />
      <Action
        label="保存风险规则"
        primary
        disabled={blocked || !dirty}
        onPress={() => void submit()}
      />
    </Section>
  );
}
