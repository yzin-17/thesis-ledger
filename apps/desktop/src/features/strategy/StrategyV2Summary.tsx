import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StrategySchema } from './strategy.types.js';
import {
  strategyAssetTypeLabel,
  strategyExecutionModeLabel,
  strategyExecutionTimingLabel,
  strategyMarketLabel,
  strategyOrderTypeLabel,
  strategyRiskTypeLabel,
  strategySizingTypeLabel,
  strategySizingTypeOptions,
  strategyTimeframeLabel,
  strategyTimeframeValues,
  strategyTimeInForceLabel,
} from './strategy-display-labels.js';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown, fallback = '未配置') =>
  typeof value === 'string' && value.trim() ? value : fallback;

export const isV2StrategySchema = (schema: StrategySchema | null | undefined) =>
  schema?.schemaVersion === '2';

export function StrategyV2Summary({
  schema,
  editable = false,
  onChange,
  variant = 'default',
  strategyName,
  version,
}: {
  schema: StrategySchema;
  editable?: boolean;
  onChange?: (schema: StrategySchema) => void;
  variant?: 'default' | 'compact';
  strategyName?: string;
  version?: number;
}) {
  const instrument = asRecord(schema.executionInstrument);
  const sizing = asRecord(schema.sizing);
  const execution = asRecord(schema.execution);
  const cost = asRecord(schema.cost);
  const sources = Array.isArray(schema.signalSources) ? schema.signalSources : [];
  const risks = Array.isArray(schema.risk) ? schema.risk : [];
  const update = (key: string, value: unknown) => onChange?.({ ...schema, [key]: value });
  const updateNested = (key: string, nestedKey: string, value: unknown) =>
    onChange?.({ ...schema, [key]: { ...asRecord(schema[key]), [nestedKey]: value } });
  const sizingValueKey = () => {
    if (sizing.type === 'fixedAmount') return 'amount';
    if (sizing.type === 'percentOfEquity') return 'percent';
    if (sizing.type === 'fixedQuantity') return 'quantity';
    return 'weight';
  };
  const sizingKey = sizingValueKey();
  if (variant === 'compact') {
    return (
      <Card size="sm" className="bg-muted/20">
        <CardHeader className="gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:grid-rows-none">
          <div className="min-w-0">
            <CardTitle className="truncate">
              {strategyName ?? text(schema.name, '未知策略')}
            </CardTitle>
            <CardDescription className="mt-1">
              {text(instrument.symbol)} / {strategyMarketLabel(instrument.market, '未配置')} /{' '}
              {strategyAssetTypeLabel(instrument.assetType, '未配置')}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant="secondary">V2 · v{version ?? '?'}</Badge>
            <Badge variant="outline">
              {strategyTimeframeLabel(schema.primaryTimeframe, '未配置')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">信号来源</p>
              <p className="mt-0.5 text-sm">{sources.length} 个</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">仓位</p>
              <p className="mt-0.5 text-sm">
                {strategySizingTypeLabel(sizing.type)}{' '}
                {text(sizing.amount ?? sizing.percent ?? sizing.quantity ?? sizing.weight)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">风险规则</p>
              <p className="mt-0.5 text-sm">
                {risks.length
                  ? risks.map((risk) => strategyRiskTypeLabel(asRecord(risk).type)).join('、')
                  : '无风险退出规则'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>统一回测 V2 策略</CardTitle>
        <CardDescription>运行时只使用已保存的策略版本与运行配置，不上传行情数据。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">策略版本 2</Badge>
          <Badge variant="outline">
            {strategyTimeframeLabel(schema.primaryTimeframe, '未配置')}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {text(instrument.symbol)} · {strategyMarketLabel(instrument.market, '未配置')} ·{' '}
            {strategyAssetTypeLabel(instrument.assetType, '未配置')}
          </span>
        </div>
        {editable && (
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="strategy-v2-timeframe">主周期</FieldLabel>
              <Select
                value={text(schema.primaryTimeframe, '1d')}
                onValueChange={(value) => value && update('primaryTimeframe', value)}
              >
                <SelectTrigger id="strategy-v2-timeframe">
                  <SelectValue>
                    {strategyTimeframeLabel(schema.primaryTimeframe, '未配置')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {strategyTimeframeValues.map((value) => (
                      <SelectItem key={value} value={value}>
                        {strategyTimeframeLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="strategy-v2-symbol">执行标的</FieldLabel>
              <Input
                id="strategy-v2-symbol"
                value={text(instrument.symbol, '')}
                onChange={(event) =>
                  updateNested('executionInstrument', 'symbol', event.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="strategy-v2-sizing">仓位数值</FieldLabel>
              <Input
                id="strategy-v2-sizing"
                value={text(sizing[sizingKey], '')}
                onChange={(event) => updateNested('sizing', sizingKey, event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="strategy-v2-sizing-type">仓位规则</FieldLabel>
              <Select
                value={text(sizing.type, 'fixedAmount')}
                onValueChange={(value) => {
                  if (!value) return;
                  const defaults: Record<string, unknown> = {
                    fixedAmount: { type: 'fixedAmount', amount: '10000' },
                    percentOfEquity: { type: 'percentOfEquity', percent: '0.1' },
                    fixedQuantity: { type: 'fixedQuantity', quantity: '100' },
                    targetWeight: { type: 'targetWeight', weight: '0.1' },
                  };
                  update('sizing', defaults[value]);
                }}
              >
                <SelectTrigger id="strategy-v2-sizing-type">
                  <SelectValue>{strategySizingTypeLabel(sizing.type)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {strategySizingTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="strategy-v2-commission">佣金率</FieldLabel>
              <Input
                id="strategy-v2-commission"
                value={text(cost.commissionRate, '0')}
                onChange={(event) => updateNested('cost', 'commissionRate', event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="strategy-v2-slippage">滑点率</FieldLabel>
              <Input
                id="strategy-v2-slippage"
                value={text(cost.slippageRate, '0')}
                onChange={(event) => updateNested('cost', 'slippageRate', event.target.value)}
              />
            </Field>
          </FieldGroup>
        )}
        <Separator />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">信号来源</p>
            <p className="text-sm">
              {sources.length} 个 ·{' '}
              {sources
                .map((source) => {
                  const record = asRecord(source);
                  const asset = asRecord(record.asset);
                  return `${text(asset.symbol)} / ${strategyTimeframeLabel(record.timeframe, '未配置')}`;
                })
                .join('、') || '未配置'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">仓位</p>
            <p className="text-sm">
              {strategySizingTypeLabel(sizing.type)} ·{' '}
              {text(sizing.amount ?? sizing.percent ?? sizing.quantity ?? sizing.weight)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">风险规则</p>
            <p className="text-sm">
              {risks.length
                ? risks.map((risk) => strategyRiskTypeLabel(asRecord(risk).type)).join('、')
                : '无风险退出规则'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">执行设置</p>
            <p className="text-sm">
              {strategyExecutionModeLabel(execution.mode)} ·{' '}
              {strategyOrderTypeLabel(execution.orderType)} ·{' '}
              {strategyExecutionTimingLabel(execution.timing)} ·{' '}
              {strategyTimeInForceLabel(execution.timeInForce)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">成本参数</p>
            <p className="text-sm">
              佣金 {text(cost.commissionRate, '0')} · 滑点 {text(cost.slippageRate, '0')}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">能力边界</p>
            <p className="text-sm">
              非目标市场、NAV/交易所不匹配和未支持风险规则由策略校验与服务端拒绝。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
