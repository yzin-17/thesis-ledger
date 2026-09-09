import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatDateTime } from '@/lib/date-display';
import { schemaSymbols, schemaAsOf } from './strategy.schema.js';
import type { BacktestSetupInput, StrategyRecord, StrategyVersion } from './strategy.types.js';
import { StrategyV2Summary, isV2StrategySchema } from './StrategyV2Summary.js';

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const defaultBacktestPeriod = (today = new Date()) => {
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - 1);
  return { start: isoDate(start), end: isoDate(today) };
};

export const backtestPeriodPresets = (today = new Date()) => {
  const end = isoDate(today);
  const year = new Date(today);
  year.setFullYear(year.getFullYear() - 1);
  const quarter = new Date(today);
  quarter.setMonth(quarter.getMonth() - 3);
  const month = new Date(today);
  month.setMonth(month.getMonth() - 1);
  return [
    { label: '近一个月', period: { start: isoDate(month), end } },
    { label: '近三个月', period: { start: isoDate(quarter), end } },
    { label: '近一年', period: { start: isoDate(year), end } },
  ];
};

export function BacktestSetupDialog({
  open,
  strategy,
  version,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  strategy: StrategyRecord | null;
  version: StrategyVersion | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (setup: BacktestSetupInput) => Promise<boolean>;
}) {
  const [period, setPeriod] = useState(defaultBacktestPeriod);
  const [initialCash, setInitialCash] = useState('100000');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setPeriod(defaultBacktestPeriod());
      setInitialCash('100000');
      setError(null);
    }
  }, [open, version?.id]);
  const symbols = version?.schema ? schemaSymbols(version.schema) : [];
  const submit = async () => {
    const cash = Number(initialCash);
    if (!period.start || !period.end || period.start > period.end) {
      setError('请选择有效的回测日期区间。');
      return;
    }
    if (!Number.isFinite(cash) || cash <= 0) {
      setError('初始资金必须大于 0。');
      return;
    }
    setError(null);
    const succeeded = await onSubmit({ period, initialCash: cash });
    if (!succeeded) return;
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-64px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>开始回测</DialogTitle>
          <DialogDescription>
            提交后将在后台准备行情并启动任务，进度可在回测任务中查看。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium">
              {strategy?.name ?? '未知策略'} · v{version?.version ?? '?'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              首个标的：{symbols[0] ?? '未配置'} · 数据时点：
              {version?.schema ? formatDateTime(schemaAsOf(version.schema), '未知') : '未知'}
            </p>
          </div>
          {version?.schema && isV2StrategySchema(version.schema) && (
            <StrategyV2Summary schema={version.schema} />
          )}
          {symbols.length > 1 && (
            <Alert>
              <AlertTitle>多标的策略</AlertTitle>
              <AlertDescription>
                当前回测只会使用首个标的 {symbols[0]}，其余标的不会进入本次任务。
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field invalid={Boolean(error && error.includes('日期'))}>
              <FieldLabel htmlFor="backtest-start">开始日期</FieldLabel>
              <DateInput
                id="backtest-start"
                type="date"
                value={period.start}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, start: event.target.value }))
                }
              />
            </Field>
            <Field invalid={Boolean(error && error.includes('日期'))}>
              <FieldLabel htmlFor="backtest-end">结束日期</FieldLabel>
              <DateInput
                id="backtest-end"
                type="date"
                value={period.end}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, end: event.target.value }))
                }
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="常用回测区间">
            {backtestPeriodPresets().map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPeriod(preset.period)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Field invalid={Boolean(error && error.includes('资金'))}>
            <FieldLabel htmlFor="backtest-cash">初始资金</FieldLabel>
            <Input
              id="backtest-cash"
              type="number"
              min="1"
              step="1000"
              value={initialCash}
              onChange={(event) => setInitialCash(event.target.value)}
            />
            <FieldDescription>单位：人民币；服务端未提供时默认 100,000。</FieldDescription>
          </Field>
          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={busy || !version} onClick={() => void submit()}>
            {busy && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {busy ? '准备中…' : '开始回测'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
