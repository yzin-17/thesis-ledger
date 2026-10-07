import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { strategySchema } from '@thesis-ledger/schemas';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { BacktestSetupInput, StrategyRecord, StrategyVersion } from './strategy.types.js';
import { StrategyV2Summary } from './StrategyV2Summary.js';
import { BacktestPricePreparation, type PreparedBacktest } from './BacktestPricePreparation.js';

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
  initialSetup,
  intent = 'new',
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  strategy: StrategyRecord | null;
  version: StrategyVersion | null;
  busy: boolean;
  initialSetup?: BacktestSetupInput | null;
  intent?: 'new' | 'rerun';
  onOpenChange: (open: boolean) => void;
  onSubmit: (setup: BacktestSetupInput) => Promise<boolean>;
}) {
  const [period, setPeriod] = useState(defaultBacktestPeriod);
  const [initialCash, setInitialCash] = useState('100000');
  const [baseCurrency, setBaseCurrency] = useState<'CNY' | 'HKD' | 'USD'>('CNY');
  const [error, setError] = useState<string | null>(null);
  const [adjustment, setAdjustment] = useState<'none' | 'qfq' | 'hfq'>('none');
  const [prepared, setPrepared] = useState<PreparedBacktest | null>(null);
  useEffect(() => {
    if (open) {
      setPeriod(initialSetup?.period ?? defaultBacktestPeriod());
      setInitialCash(String(initialSetup?.initialCash ?? 100000));
      setBaseCurrency(initialSetup?.baseCurrency ?? 'CNY');
      setError(null);
      setAdjustment(initialSetup?.adjustment ?? 'none');
      setPrepared(null);
    }
  }, [initialSetup, open, version?.id]);
  const presets = backtestPeriodPresets();
  const activePreset = presets.find(
    (preset) => preset.period.start === period.start && preset.period.end === period.end,
  );
  const currentStrategy = version?.schema
    ? strategySchema.safeParse(version.schema).success
    : false;
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
    if (!currentStrategy) {
      setError('策略定义不可用，请先保存有效的当前策略版本。');
      return;
    }
    if (
      !prepared ||
      prepared.executionPreflight.revisionStamp?.strategyVersionId !== version?.id ||
      prepared.runConfig.startDate !== period.start ||
      prepared.runConfig.endDate !== period.end ||
      prepared.runConfig.baseCurrency !== baseCurrency ||
      Number(prepared.runConfig.initialCash[baseCurrency]) !== cash ||
      prepared.runConfig.executionPriceProtocol.priceBasis.adjustment !== adjustment
    ) {
      setError('当前配置尚未准备或已经改变，请重新准备配置。');
      return;
    }
    const succeeded = await onSubmit({
      period,
      initialCash: cash,
      baseCurrency,
      adjustment,
      prepared,
    });
    if (!succeeded) return;
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-32px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6 pr-14 pb-4">
          <DialogTitle>{intent === 'rerun' ? '基于本次配置再次运行' : '开始回测'}</DialogTitle>
          <DialogDescription>
            {intent === 'rerun'
              ? '保留原版本、区间与已记录执行假设，重新获取当前可用数据并创建新任务；数据修订可能使结果不同。'
              : '提交后将在后台准备行情并启动任务，进度可在回测任务中查看。'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 pt-1 pb-6">
          {version?.schema && currentStrategy && (
            <StrategyV2Summary
              schema={version.schema}
              variant="compact"
              version={version.version}
              {...(strategy?.name ? { strategyName: strategy.name } : {})}
            />
          )}
          {!currentStrategy && (
            <Alert variant="destructive">
              <AlertTitle>策略定义不可用</AlertTitle>
              <AlertDescription>请先保存有效的当前策略版本，再创建回测。</AlertDescription>
            </Alert>
          )}
          <div>
            <p className="text-sm font-medium">回测参数</p>
            <p className="mt-1 text-xs text-muted-foreground">
              设置回测区间与初始资金，金额单位为 {baseCurrency}。
            </p>
          </div>
          <FieldGroup className="grid gap-4 sm:grid-cols-3">
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
            <Field invalid={Boolean(error && error.includes('资金'))}>
              <FieldLabel htmlFor="backtest-cash">初始资金（{baseCurrency}）</FieldLabel>
              <Input
                id="backtest-cash"
                type="number"
                min="1"
                step="1000"
                value={initialCash}
                onChange={(event) => setInitialCash(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <ToggleGroup
            value={activePreset ? [activePreset.label] : []}
            onValueChange={(values) => {
              const preset = presets.find((item) => item.label === values[0]);
              if (preset) setPeriod(preset.period);
            }}
            aria-label="常用回测区间"
            className="w-fit"
          >
            {presets.map((preset) => (
              <ToggleGroupItem key={preset.label} value={preset.label} aria-label={preset.label}>
                {preset.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {version?.schema && currentStrategy && (
            <Field>
              <FieldLabel>价格口径与记账</FieldLabel>
              <ToggleGroup
                value={[adjustment]}
                aria-label="价格口径与记账"
                onValueChange={(values) => {
                  const value = values[0];
                  if (value === 'none' || value === 'qfq' || value === 'hfq') {
                    setAdjustment(value);
                    setPrepared(null);
                  }
                }}
              >
                <ToggleGroupItem value="none">不复权 · 原始份额</ToggleGroupItem>
                <ToggleGroupItem value="qfq">前复权 · 归一化研究</ToggleGroupItem>
                <ToggleGroupItem value="hfq">后复权 · 归一化研究</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
          {open && version && currentStrategy && (
            <BacktestPricePreparation
              key={`${version.id}:${adjustment}`}
              strategyVersionId={version.id}
              adjustment={adjustment}
              period={period}
              initialCash={initialCash}
              currency={baseCurrency}
              {...(initialSetup?.executionModel
                ? { initialModel: initialSetup.executionModel }
                : {})}
              onPrepared={setPrepared}
            />
          )}
          {error && <FieldError>{error}</FieldError>}
        </div>
        <div>
          <Separator />
          <DialogFooter className="px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={busy || !version || !currentStrategy || !prepared}
              onClick={() => void submit()}
            >
              {busy && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {busy ? '准备中…' : intent === 'rerun' ? '创建新任务' : '开始回测'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
