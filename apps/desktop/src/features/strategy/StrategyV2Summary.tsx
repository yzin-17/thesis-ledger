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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown, fallback = '未配置') =>
  typeof value === 'string' && value.trim() ? value : fallback;

const enumLabel = (value: unknown, labels: Record<string, string>) => {
  if (typeof value !== 'string' || !value.trim()) return '未配置';
  return labels[value] ?? `未识别（${value}）`;
};

const marketLabel = (value: unknown) => {
  if (value === 'CN') return '中国内地';
  if (value === 'HK') return '香港';
  if (value === 'US') return '美国';
  return enumLabel(value, {});
};

const assetTypeLabel = (value: unknown) =>
  enumLabel(value, { stock: '股票', etf: 'ETF', fund: '基金' });

const timeframeLabel = (value: unknown) =>
  enumLabel(value, {
    '1d': '日线',
    '60m': '60 分钟',
    '30m': '30 分钟',
    '15m': '15 分钟',
    '5m': '5 分钟',
    '1m': '1 分钟',
  });

const sizingLabel = (value: unknown) => {
  return enumLabel(value, {
    fixedAmount: '固定投入金额',
    percentOfEquity: '权益比例',
    fixedQuantity: '固定数量',
    targetWeight: '目标权重',
  });
};

const riskLabel = (value: unknown) => {
  return enumLabel(value, {
    fixedStop: '固定止损',
    fixedTakeProfit: '固定止盈',
    maxHoldingPeriod: '最大持有期',
  });
};

const executionModeLabel = (value: unknown) => enumLabel(value, { exchange: '交易所' });

const orderTypeLabel = (value: unknown) => enumLabel(value, { market: '市价单' });

const timeInForceLabel = (value: unknown) => enumLabel(value, { DAY: '当日有效' });

const executionTimingLabel = (value: unknown) =>
  enumLabel(value, { nextEligibleBarOpen: '下一可执行 K 线开盘' });

export const isV2StrategySchema = (schema: StrategySchema | null | undefined) =>
  schema?.schemaVersion === '2';

export function StrategyV2Summary({
  schema,
  editable = false,
  onChange,
}: {
  schema: StrategySchema;
  editable?: boolean;
  onChange?: (schema: StrategySchema) => void;
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>统一回测 V2 策略</CardTitle>
        <CardDescription>运行时只使用已保存的策略版本与运行配置，不上传行情数据。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">策略版本 2</Badge>
          <Badge variant="outline">{timeframeLabel(schema.primaryTimeframe)}</Badge>
          <span className="text-sm text-muted-foreground">
            {text(instrument.symbol)} · {marketLabel(instrument.market)} ·{' '}
            {assetTypeLabel(instrument.assetType)}
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
                  <SelectValue>{timeframeLabel(schema.primaryTimeframe)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {['1d', '60m', '30m', '15m', '5m', '1m'].map((value) => (
                      <SelectItem key={value} value={value}>
                        {timeframeLabel(value)}
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
                  <SelectValue>{sizingLabel(sizing.type)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="fixedAmount">固定投入金额</SelectItem>
                    <SelectItem value="percentOfEquity">权益比例</SelectItem>
                    <SelectItem value="fixedQuantity">固定数量</SelectItem>
                    <SelectItem value="targetWeight">目标权重</SelectItem>
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
                  return `${text(asset.symbol)} / ${timeframeLabel(record.timeframe)}`;
                })
                .join('、') || '未配置'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">仓位</p>
            <p className="text-sm">
              {sizingLabel(sizing.type)} ·{' '}
              {text(sizing.amount ?? sizing.percent ?? sizing.quantity ?? sizing.weight)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">风险规则</p>
            <p className="text-sm">
              {risks.length
                ? risks.map((risk) => riskLabel(asRecord(risk).type)).join('、')
                : '无风险退出规则'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">执行设置</p>
            <p className="text-sm">
              {executionModeLabel(execution.mode)} · {orderTypeLabel(execution.orderType)} ·{' '}
              {executionTimingLabel(execution.timing)} · {timeInForceLabel(execution.timeInForce)}
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
