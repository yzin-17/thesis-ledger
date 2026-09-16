import { Button } from '@/components/ui/button';
import { ChevronDownIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ChartPreference } from './market-chart-preferences.js';

const indicatorNames = ['MA', 'MACD', 'RSI'] as const;
const maNames = ['ma5', 'ma10', 'ma20', 'ma60'] as const;
const macdFields = [
  { name: 'fast', label: '快线' },
  { name: 'slow', label: '慢线' },
  { name: 'signal', label: '信号' },
] as const;

export type MarketIndicatorDraft = Record<'fast' | 'slow' | 'signal', string>;

export function changedToggleOption<T extends string>(
  current: readonly T[],
  next: readonly string[],
  names: readonly T[],
) {
  for (const name of names) {
    const checked = next.includes(name);
    if (checked !== current.includes(name)) return { name, checked };
  }
  return null;
}

export function MarketIndicatorSettingsMenu({
  visibleIndicators,
  visibleMA,
  rsiPeriod,
  macdDraft,
  macdDraftError,
  onIndicatorChange,
  onVisibleMAChange,
  onRsiPeriodChange,
  onMacdDraftChange,
  onApplyMacdParams,
  onResetMacdParams,
}: {
  visibleIndicators: ChartPreference['visibleIndicators'];
  visibleMA: ChartPreference['visibleMA'];
  rsiPeriod: ChartPreference['rsiPeriod'];
  macdDraft: MarketIndicatorDraft;
  macdDraftError: string | null;
  onIndicatorChange: (name: ChartPreference['visibleIndicators'][number], checked: boolean) => void;
  onVisibleMAChange: (name: ChartPreference['visibleMA'][number], checked: boolean) => void;
  onRsiPeriodChange: (period: ChartPreference['rsiPeriod']) => void;
  onMacdDraftChange: (name: keyof MarketIndicatorDraft, value: string) => void;
  onApplyMacdParams: () => void;
  onResetMacdParams: () => void;
}) {
  const maEnabled = visibleIndicators.includes('MA');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            指标
            <ChevronDownIcon
              data-icon="inline-end"
              data-indicator-menu-chevron
              aria-hidden="true"
              className="transition-transform group-aria-expanded/button:rotate-180"
            />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        aria-label="指标设置"
        className="max-h-[min(32rem,var(--available-height))] w-[min(22rem,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto p-0"
      >
        <div
          className="flex flex-col"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') event.stopPropagation();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="flex flex-col gap-1 px-3 pt-3 pb-2">
            <h5 className="m-0 text-sm font-medium">指标设置</h5>
            <p className="m-0 text-xs text-muted-foreground">调整显示内容与计算参数。</p>
          </header>
          <Separator />
          <section className="flex flex-col gap-2 px-3 py-3" aria-labelledby="indicator-display-title">
            <h6 id="indicator-display-title" className="m-0 text-xs font-medium text-muted-foreground">
              显示内容
            </h6>
            <ToggleGroup
              multiple
              value={visibleIndicators}
              onValueChange={(values) => {
                const change = changedToggleOption(visibleIndicators, values, indicatorNames);
                if (change) onIndicatorChange(change.name, change.checked);
              }}
              aria-label="显示内容"
            >
              {indicatorNames.map((name) => (
                <ToggleGroupItem key={name} value={name} className="flex-1">
                  {name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>
          <Separator />
          <section className="flex flex-col gap-3 px-3 py-3" aria-labelledby="macd-settings-title">
            <h6 id="macd-settings-title" className="m-0 text-xs font-medium text-muted-foreground">
              MACD 参数
            </h6>
            <FieldGroup className="grid grid-cols-3 gap-2">
              {macdFields.map(({ name, label }) => (
                <Field key={name}>
                  <FieldLabel htmlFor={`market-macd-${name}`} className="text-xs">
                    {label}
                  </FieldLabel>
                  <Input
                    id={`market-macd-${name}`}
                    aria-label={`MACD ${label}`}
                    min={2}
                    max={200}
                    step={1}
                    type="number"
                    value={macdDraft[name]}
                    onChange={(event) => onMacdDraftChange(name, event.target.value)}
                  />
                </Field>
              ))}
            </FieldGroup>
            <p className="m-0 text-xs text-muted-foreground">快线必须小于慢线，且均为 2–200 的整数。</p>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={onApplyMacdParams}>
                应用参数
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onResetMacdParams}>
                恢复 12/26/9
              </Button>
            </div>
            {macdDraftError ? (
              <p className="m-0 text-xs text-destructive" role="alert">
                {macdDraftError}
              </p>
            ) : null}
          </section>
          <Separator />
          <section className="flex flex-col gap-2 px-3 py-3" aria-labelledby="rsi-period-title">
            <h6 id="rsi-period-title" className="m-0 text-xs font-medium text-muted-foreground">
              RSI 周期
            </h6>
            <ToggleGroup
              value={[String(rsiPeriod)]}
              onValueChange={(values) => {
                const value = values[0];
                if (value) onRsiPeriodChange(Number(value) as ChartPreference['rsiPeriod']);
              }}
              aria-label="RSI 周期"
            >
              {([6, 12, 24] as const).map((period) => (
                <ToggleGroupItem key={period} value={String(period)} className="flex-1">
                  RSI {period}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>
          <Separator />
          <section className="flex flex-col gap-2 px-3 py-3" aria-labelledby="ma-period-title">
            <h6 id="ma-period-title" className="m-0 text-xs font-medium text-muted-foreground">
              均线周期
            </h6>
            <ToggleGroup
              multiple
              value={visibleMA}
              onValueChange={(values) => {
                const change = changedToggleOption(visibleMA, values, maNames);
                if (change) onVisibleMAChange(change.name, change.checked);
              }}
              aria-label="均线周期"
            >
              {maNames.map((name) => (
                <ToggleGroupItem key={name} value={name} className="flex-1" disabled={!maEnabled}>
                  {name.toUpperCase()}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
