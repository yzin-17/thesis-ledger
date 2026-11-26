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
import { AuthoringRunIntents } from '../strategy-authoring/AuthoringRunIntents.js';
import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import { PriceResearchVersionPreview } from './PriceResearchVersionPreview.js';

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

export function BacktestSetupDialog(props: {
  open: boolean;
  strategy: StrategyRecord | null;
  version: StrategyVersion | null;
  busy: boolean;
  initialSetup?: BacktestSetupInput | null;
  intent?: 'new' | 'rerun';
  onOpenChange: (open: boolean) => void;
  onSubmit: (setup: BacktestSetupInput) => Promise<boolean>;
  onSubmitted?: () => void;
}) {
  const control = useBacktestSetupDialog(props);
  const {
    open,
    requestOpenChange,
    locked,
    intent,
    setPreparationDirty,
    version,
    currentStrategy,
    strategy,
    baseCurrency,
    error,
    setPeriod,
    activePreset,
    presets,
  } = control;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => void requestOpenChange(nextOpen)}>
      <DialogContent
        showCloseButton={!locked}
        className="max-h-[calc(100dvh-32px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="px-6 pt-6 pr-14 pb-4">
          <DialogTitle>{intent === 'rerun' ? '基于本次配置再次运行' : '开始回测'}</DialogTitle>
          <DialogDescription>
            {intent === 'rerun'
              ? '基于原策略与区间准备新的收益研究；请核对策略口径和本次来源版本。'
              : '提交完成后自动前往回测任务列表查看进度。'}
          </DialogDescription>
        </DialogHeader>
        <div
          className="grid min-h-0 auto-rows-max grid-cols-1 content-start gap-5 overflow-y-auto px-6 pt-1 pb-6"
          onChange={() => setPreparationDirty(true)}
        >
          <AuthoringRunIntents version={version} enabled={open} />
          {version?.schema && currentStrategy && (
            <StrategyV2Summary
              schema={version.schema}
              instrumentDirectory={version.instrumentDirectory}
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
          <BacktestSetupFields control={control} />
          <ToggleGroup
            disabled={locked}
            value={activePreset ? [activePreset.label] : []}
            onValueChange={(values) => {
              const preset = presets.find((item) => item.label === values[0]);
              if (preset) setPeriod(preset.period);
              if (preset) setPreparationDirty(true);
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
              <FieldLabel>策略收益研究</FieldLabel>
              <p className="text-sm">后复权计算指标与模拟收益；具体价格条件使用不复权行情。</p>
            </Field>
          )}
          <BacktestResearchVersionChoice control={control} />
          <BacktestResearchPreparation control={control} />
          {error && (
            <Field invalid>
              <FieldError>{error}</FieldError>
            </Field>
          )}
        </div>
        <div>
          <Separator />
          <BacktestSetupActions control={control} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useBacktestSetupDialog({
  open,
  strategy,
  version: initialVersion,
  busy,
  initialSetup,
  intent = 'new',
  onOpenChange,
  onSubmit,
  onSubmitted,
}: {
  open: boolean;
  strategy: StrategyRecord | null;
  version: StrategyVersion | null;
  busy: boolean;
  initialSetup?: BacktestSetupInput | null;
  intent?: 'new' | 'rerun';
  onOpenChange: (open: boolean) => void;
  onSubmit: (setup: BacktestSetupInput) => Promise<boolean>;
  onSubmitted?: () => void;
}) {
  const [period, setPeriod] = useState(defaultBacktestPeriod);
  const [initialCash, setInitialCash] = useState('100000');
  const [baseCurrency, setBaseCurrency] = useState<'CNY' | 'HKD' | 'USD'>('CNY');
  const [error, setError] = useState<string | null>(null);
  const [adjustment, setAdjustment] = useState<'qfq' | 'hfq'>('hfq');
  const [adoptedVersion, setAdoptedVersion] = useState<StrategyVersion | null>(null);
  const [adopting, setAdopting] = useState(false);
  const version = adoptedVersion ?? initialVersion;
  const researchVersion = isPriceResearchStrategyDefinition(version?.schema);
  const [prepared, setPrepared] = useState<PreparedBacktest | null>(null);
  const [preparationDirty, setPreparationDirty] = useState(false);
  const [executionReady, setExecutionReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const locked = busy || submitting || adopting;
  const requestOpenChange = useDraftCloseGuard({
    open,
    busy: locked,
    draft: { strategyVersionId: version?.id, period, initialCash, baseCurrency, adjustment },
    dirty: preparationDirty,
    onOpenChange,
  });
  useEffect(() => {
    if (open) {
      setAdoptedVersion(null);
      setAdopting(false);
      setPeriod(initialSetup?.period ?? defaultBacktestPeriod());
      setInitialCash(String(initialSetup?.initialCash ?? 100000));
      const definition = strategySchema.safeParse(initialVersion?.schema);
      let currency: 'CNY' | 'HKD' | 'USD' = 'CNY';
      if (definition.success && definition.data.executionInstrument.market === 'HK')
        currency = 'HKD';
      else if (definition.success && definition.data.executionInstrument.market === 'US')
        currency = 'USD';
      setBaseCurrency(initialSetup?.baseCurrency ?? currency);
      setError(null);
      setAdjustment('hfq');
      setPrepared(null);
      setExecutionReady(false);
      setSubmitting(false);
      setPreparationDirty(false);
    }
  }, [initialSetup, open, initialVersion?.id]);
  const presets = backtestPeriodPresets();
  const activePreset = presets.find(
    (preset) => preset.period.start === period.start && preset.period.end === period.end,
  );
  const currentStrategy = version?.schema
    ? strategySchema.safeParse(version.schema).success
    : false;
  let submitLabel = '开始回测';
  if (locked) submitLabel = '正在提交…';
  else if (intent === 'rerun') submitLabel = '创建新任务';
  const submit = async () => {
    if (locked) return;
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

  return {
    open,
    requestOpenChange,
    locked,
    intent,
    setPreparationDirty,
    version,
    currentStrategy,
    strategy,
    baseCurrency,
    error,
    period,
    setPeriod,
    initialCash,
    setInitialCash,
    activePreset,
    presets,
    researchVersion,
    setAdoptedVersion,
    setPrepared,
    setAdopting,
    setExecutionReady,
    setSubmitting,
    adjustment,
    initialSetup,
    onOpenChange,
    onSubmitted,
    prepared,
    executionReady,
    submit,
    submitLabel,
  };
}

function BacktestSetupFields({ control }: { control: ReturnType<typeof useBacktestSetupDialog> }) {
  return (
    <>
      <FieldGroup className="grid gap-4 sm:grid-cols-3">
        <Field invalid={Boolean(control.error && control.error.includes('日期'))}>
          <FieldLabel htmlFor="backtest-start">开始日期</FieldLabel>
          <DateInput
            id="backtest-start"
            type="date"
            value={control.period.start}
            disabled={control.locked}
            onChange={(event) =>
              control.setPeriod((current) => ({ ...current, start: event.target.value }))
            }
          />
        </Field>
        <Field invalid={Boolean(control.error && control.error.includes('日期'))}>
          <FieldLabel htmlFor="backtest-end">结束日期</FieldLabel>
          <DateInput
            id="backtest-end"
            type="date"
            value={control.period.end}
            disabled={control.locked}
            onChange={(event) =>
              control.setPeriod((current) => ({ ...current, end: event.target.value }))
            }
          />
        </Field>
        <Field invalid={Boolean(control.error && control.error.includes('资金'))}>
          <FieldLabel htmlFor="backtest-cash">初始资金（{control.baseCurrency}）</FieldLabel>
          <Input
            id="backtest-cash"
            type="number"
            min="1"
            step="1000"
            value={control.initialCash}
            disabled={control.locked}
            onChange={(event) => control.setInitialCash(event.target.value)}
          />
        </Field>
      </FieldGroup>
    </>
  );
}
function BacktestSetupActions({ control }: { control: ReturnType<typeof useBacktestSetupDialog> }) {
  return (
    <>
      <DialogFooter className="px-6 py-4">
        <Button
          type="button"
          variant="outline"
          disabled={control.locked}
          onClick={() => void control.requestOpenChange(false)}
        >
          取消
        </Button>
        <Button
          type={control.prepared && !control.researchVersion ? 'button' : 'submit'}
          form="saved-strategy-backtest"
          aria-busy={control.locked}
          disabled={
            control.locked ||
            !control.version ||
            !control.currentStrategy ||
            !control.researchVersion ||
            (!control.prepared && !control.executionReady)
          }
          onClick={
            control.prepared && !control.researchVersion ? () => void control.submit() : undefined
          }
        >
          {control.locked && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {control.submitLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

function BacktestResearchVersionChoice({
  control,
}: {
  control: ReturnType<typeof useBacktestSetupDialog>;
}) {
  return (
    <>
      {control.open &&
        control.version &&
        control.strategy &&
        control.currentStrategy &&
        !control.researchVersion && (
          <PriceResearchVersionPreview
            key={control.version.id}
            strategyId={control.strategy.id}
            version={control.version}
            disabled={control.locked}
            onAdopt={(saved) => {
              control.setAdoptedVersion(saved);
              control.setPrepared(null);
              control.setPreparationDirty(true);
            }}
            onBusyChange={control.setAdopting}
          />
        )}
    </>
  );
}
function BacktestResearchPreparation({
  control,
}: {
  control: ReturnType<typeof useBacktestSetupDialog>;
}) {
  return (
    <>
      {control.open && control.version && control.currentStrategy && control.researchVersion && (
        <BacktestPricePreparation
          formId="saved-strategy-backtest"
          onReadyChange={control.setExecutionReady}
          onBusyChange={control.setSubmitting}
          key={`${control.version.id}:${control.adjustment}`}
          strategyVersionId={control.version.id}
          priceResearch
          dailyOrders={strategyEditorVariant('execution', control.version.schema?.execution) === 'dailyBarOrders'}
          adjustment={control.adjustment}
          period={control.period}
          initialCash={control.initialCash}
          currency={control.baseCurrency}
          {...(control.initialSetup?.executionModel && control.initialSetup.adjustment !== 'none'
            ? { initialModel: control.initialSetup.executionModel }
            : {})}
          {...(control.initialSetup?.dailyOrderMatching && control.initialSetup.adjustment !== 'none' ? { initialDailyOrderMatching: control.initialSetup.dailyOrderMatching } : {})}
          onPrepared={control.setPrepared}
          onSubmitted={() => {
            control.onOpenChange(false);
            control.onSubmitted?.();
          }}
          onDirtyChange={control.setPreparationDirty}
        />
      )}
    </>
  );
}
import { isPriceResearchStrategyDefinition, strategyEditorVariant } from '@thesis-ledger/domain';
