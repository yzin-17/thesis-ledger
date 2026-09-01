import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReviewTrade } from './journal.types.js';

type ManualDraft = {
  symbol: string;
  entryAt: string;
  exitAt: string;
  pnl: string;
  quantity: string;
  entryPrice: string;
  exitPrice: string;
  turnover: string;
  peakWeight: string;
  plannedEntry: string;
  plannedExit: string;
  plannedStop: string;
  targetWeight: string;
  plannedHoldingDays: string;
};

const emptyDraft: ManualDraft = {
  symbol: '',
  entryAt: '',
  exitAt: '',
  pnl: '',
  quantity: '',
  entryPrice: '',
  exitPrice: '',
  turnover: '',
  peakWeight: '',
  plannedEntry: '',
  plannedExit: '',
  plannedStop: '',
  targetWeight: '',
  plannedHoldingDays: '',
};

const numericFields: Array<{ key: keyof ManualDraft; label: string; description?: string }> = [
  { key: 'pnl', label: '已实现盈亏' },
  { key: 'quantity', label: '成交数量' },
  { key: 'entryPrice', label: '实际入场价' },
  { key: 'exitPrice', label: '实际退出价' },
  { key: 'turnover', label: '换手金额' },
  { key: 'peakWeight', label: '最高仓位', description: '比例填写，例如 0.18。' },
  { key: 'plannedEntry', label: '计划入场价' },
  { key: 'plannedExit', label: '计划退出价' },
  { key: 'plannedStop', label: '计划止损价' },
  { key: 'targetWeight', label: '目标仓位', description: '比例填写，例如 0.1。' },
  { key: 'plannedHoldingDays', label: '计划持有天数' },
];

const parseNumber = (value: string, label: string, errors: Record<string, string>) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) errors[label] = '请输入有效数字。';
  return parsed;
};

const parseDate = (value: string, label: string, errors: Record<string, string>) => {
  if (!value) {
    errors[label] = '请选择时间。';
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors[label] = '请输入有效时间。';
    return undefined;
  }
  return date.toISOString();
};

export function ManualReviewForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (trade: ReviewTrade) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<ManualDraft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (key: keyof ManualDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    const symbol = draft.symbol.trim();
    if (!symbol) nextErrors.symbol = '请输入标的代码。';
    const entryAt = parseDate(draft.entryAt, 'entryAt', nextErrors);
    const exitAt = parseDate(draft.exitAt, 'exitAt', nextErrors);
    const pnl = parseNumber(draft.pnl, 'pnl', nextErrors);
    if (pnl === undefined) nextErrors.pnl = '请输入已实现盈亏。';
    if (entryAt && exitAt && entryAt >= exitAt) nextErrors.exitAt = '退出时间必须晚于入场时间。';
    if (Object.keys(nextErrors).length > 0 || !entryAt || !exitAt || pnl === undefined) {
      setErrors(nextErrors);
      return;
    }

    const trade: ReviewTrade = { symbol, entryAt, exitAt, pnl };
    for (const { key } of numericFields) {
      if (key === 'pnl') continue;
      const parsed = parseNumber(draft[key], String(key), nextErrors);
      if (parsed !== undefined) Object.assign(trade, { [key]: parsed });
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSubmit(trade);
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>手动复盘</CardTitle>
        <CardDescription>
          适用于账户没有可用候选，或需要复盘外部交易。可选计划字段缺失时会保留“证据不足”。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field invalid={Boolean(errors.symbol)}>
              <FieldLabel htmlFor="manual-review-symbol">标的代码</FieldLabel>
              <Input
                id="manual-review-symbol"
                value={draft.symbol}
                onChange={(event) => update('symbol', event.target.value)}
                placeholder="例如 600519.SH"
                aria-invalid={Boolean(errors.symbol)}
              />
              {errors.symbol && <FieldError>{errors.symbol}</FieldError>}
            </Field>
            <Field invalid={Boolean(errors.entryAt)}>
              <FieldLabel htmlFor="manual-review-entry-at">入场时间</FieldLabel>
              <DateInput
                id="manual-review-entry-at"
                type="datetime-local"
                value={draft.entryAt}
                onChange={(event) => update('entryAt', event.target.value)}
                aria-invalid={Boolean(errors.entryAt)}
              />
              {errors.entryAt && <FieldError>{errors.entryAt}</FieldError>}
            </Field>
            <Field invalid={Boolean(errors.exitAt)}>
              <FieldLabel htmlFor="manual-review-exit-at">退出时间</FieldLabel>
              <DateInput
                id="manual-review-exit-at"
                type="datetime-local"
                value={draft.exitAt}
                onChange={(event) => update('exitAt', event.target.value)}
                aria-invalid={Boolean(errors.exitAt)}
              />
              {errors.exitAt && <FieldError>{errors.exitAt}</FieldError>}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {numericFields.map(({ key, label, description }) => (
              <Field key={key} invalid={Boolean(errors[String(key)])}>
                <FieldLabel htmlFor={`manual-review-${String(key)}`}>{label}</FieldLabel>
                <Input
                  id={`manual-review-${String(key)}`}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={draft[key]}
                  onChange={(event) => update(key, event.target.value)}
                  aria-invalid={Boolean(errors[String(key)])}
                />
                {description && <FieldDescription>{description}</FieldDescription>}
                {errors[String(key)] && <FieldError>{errors[String(key)]}</FieldError>}
              </Field>
            ))}
          </div>
        </FieldGroup>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              取消
            </Button>
          )}
          <Button type="button" onClick={submit}>
            开始复盘
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
