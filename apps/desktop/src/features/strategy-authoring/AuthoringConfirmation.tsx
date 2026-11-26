import { useState } from 'react';
import type { AuthoringContent, AuthoringConfirmationDraft } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InstrumentSymbolField } from '../market-data/InstrumentSymbolField.js';
import {
  strategyTimeframeLabel,
  strategyTimeframeValues,
} from '../strategy/strategy-display-labels.js';
import { AuthoringSelect } from './AuthoringSelect.js';
import { confirmationDraft, parseConfirmationDraft } from './authoring-confirmation.model.js';

export function AuthoringConfirmation(props: {
  content: AuthoringContent;
  onChange: (next: AuthoringContent) => void;
  disabled: boolean;
}) {
  const control = useAuthoringConfirmation(props);
  const { draft, content, onChange, setError, search, disabled, setSearch, edit, error } = control;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const confirmation = parseConfirmationDraft(draft, content);
          onChange({ ...content, confirmation, confirmationDraft: draft });
          setError(null);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : '请补齐全部条件');
        }
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel>目录标的</FieldLabel>
          <InstrumentSymbolField
            aria-label="搜索目录标的"
            value={search ?? draft.instrument?.symbol ?? ''}
            disabled={disabled}
            markets={['SH', 'SZ', 'BJ', 'OF', 'HK', 'US']}
            instrumentTypes={['STOCK', 'ETF', 'MUTUAL_FUND']}
            onChange={setSearch}
            onSelect={(item) => {
              let assetType: 'stock' | 'etf' | 'fund' = 'stock';
              if (item.instrumentType === 'ETF') assetType = 'etf';
              else if (item.instrumentType === 'MUTUAL_FUND') assetType = 'fund';
              const market = ['SH', 'SZ', 'BJ', 'OF'].includes(item.market) ? 'CN' : item.market;
              edit({
                instrumentId: item.id,
                instrument: {
                  symbol: item.symbol,
                  market: market as 'CN' | 'HK' | 'US',
                  assetType,
                },
              });
            }}
          />
          <FieldDescription>
            已选：{draft.instrument?.symbol ?? '尚未选择'}。只支持单标的。
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>信号周期</FieldLabel>
          <AuthoringSelect
            label="信号周期"
            value={draft.timeframe}
            disabled={disabled}
            onChange={(timeframe) => edit({ timeframe })}
            options={strategyTimeframeValues.map((value) => ({
              value,
              label: strategyTimeframeLabel(value),
            }))}
          />
        </Field>
        <Field>
          <FieldLabel>明确的入场规则</FieldLabel>
          <Textarea
            aria-label="明确的入场规则"
            value={draft.entrySummary}
            disabled={disabled}
            onChange={(event) => edit({ entrySummary: event.target.value })}
            maxLength={2000}
          />
        </Field>
        <Field>
          <FieldLabel>明确的退出规则</FieldLabel>
          <Textarea
            aria-label="明确的退出规则"
            value={draft.exitSummary}
            disabled={disabled}
            onChange={(event) => edit({ exitSummary: event.target.value })}
            maxLength={2000}
          />
        </Field>
        <Field>
          <FieldLabel>仓位方式</FieldLabel>
          <AuthoringSelect
            label="仓位方式"
            value={draft.sizingType}
            disabled={disabled}
            onChange={(sizingType) => edit({ sizingType })}
            options={[
              { value: 'fixedAmount', label: '固定金额' },
              { value: 'fixedQuantity', label: '固定数量' },
              { value: 'percentOfEquity', label: '权益比例' },
              { value: 'targetWeight', label: '目标权重' },
            ]}
          />
        </Field>
        <Field>
          <FieldLabel>仓位数值</FieldLabel>
          <Input
            aria-label="仓位数值"
            value={draft.sizingValue}
            disabled={disabled}
            onChange={(event) => edit({ sizingValue: event.target.value })}
          />
          <FieldDescription>
            比例使用小数，例如 50% 填 0.5；固定金额或数量填写正数。
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>风险规则</FieldLabel>
          <AuthoringSelect
            label="风险规则"
            value={draft.riskMode}
            disabled={disabled}
            onChange={(riskMode) => edit({ riskMode })}
            options={[
              { value: 'none', label: '不设置额外风险规则' },
              { value: 'fixedStop', label: '固定止损' },
              { value: 'custom', label: '组合风险规则（高级）' },
            ]}
          />
        </Field>
        {draft.riskMode === 'fixedStop' && (
          <Field>
            <FieldLabel>固定止损比例</FieldLabel>
            <Input
              aria-label="固定止损比例"
              placeholder="5% 填 0.05"
              value={draft.riskPercent}
              disabled={disabled}
              onChange={(event) => edit({ riskPercent: event.target.value })}
            />
          </Field>
        )}
        {draft.riskMode === 'custom' && (
          <Field>
            <FieldLabel>风险规则 JSON</FieldLabel>
            <Textarea
              aria-label="风险规则 JSON"
              value={draft.riskText}
              disabled={disabled}
              onChange={(event) => edit({ riskText: event.target.value })}
            />
            <FieldDescription>支持固定止损、固定止盈及按根数计算的最大持有期。</FieldDescription>
          </Field>
        )}
        {draft.riskMode === 'none' && (
          <Field className="flex-row items-center">
            <Checkbox
              aria-label="确认不设置额外风险规则"
              checked={draft.noExtraRiskConfirmed}
              disabled={disabled}
              onCheckedChange={(checked) => edit({ noExtraRiskConfirmed: Boolean(checked) })}
            />
            <FieldLabel>我确认不设置额外风险规则</FieldLabel>
          </Field>
        )}
        <Field>
          <FieldLabel>成交时机</FieldLabel>
          <AuthoringSelect
            label="成交时机"
            value={draft.executionMode}
            disabled={disabled}
            onChange={(executionMode) => edit({ executionMode })}
            options={[
              { value: 'exchange', label: '信号后下一可交易开盘，市价单' },
              { value: 'dailyBarOrders', label: '按需求生成日线委托计划' },
              { value: 'nav', label: '下一可用净值，申购与赎回' },
            ]}
          />
          <FieldDescription>日线委托由模型生成价格、有效期和父单保护，生成后核对完整配置。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>佣金比例</FieldLabel>
          <Input
            aria-label="佣金比例"
            value={draft.commissionRate}
            disabled={disabled}
            onChange={(event) => edit({ commissionRate: event.target.value })}
            placeholder="0.03% 填 0.0003"
          />
        </Field>
        <Field>
          <FieldLabel>滑点比例</FieldLabel>
          <Input
            aria-label="滑点比例"
            value={draft.slippageRate}
            disabled={disabled}
            onChange={(event) => edit({ slippageRate: event.target.value })}
            placeholder="明确填写，可为 0"
          />
        </Field>
        <Field className="flex-row items-center">
          <Checkbox
            aria-label="确认指标周期按根数计算"
            checked={draft.periodsAreBarsConfirmed}
            disabled={disabled}
            onCheckedChange={(checked) => edit({ periodsAreBarsConfirmed: Boolean(checked) })}
          />
          <FieldLabel>我确认指标周期和持有期按 K 线根数计算</FieldLabel>
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>条件尚未完整</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={disabled}>
          {content.confirmation ? '重新确认全部条件' : '确认全部交易条件'}
        </Button>
      </FieldGroup>
    </form>
  );
}

function useAuthoringConfirmation({
  content,
  onChange,
  disabled,
}: {
  content: AuthoringContent;
  onChange: (next: AuthoringContent) => void;
  disabled: boolean;
}) {
  const draft = confirmationDraft(content);
  const [search, setSearch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const edit = (patch: Partial<AuthoringConfirmationDraft>) =>
    onChange({ ...content, confirmation: null, confirmationDraft: { ...draft, ...patch } });

  return { draft, content, onChange, setError, search, disabled, setSearch, edit, error };
}
