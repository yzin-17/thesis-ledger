import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  strategyAssetTypeLabel,
  strategyMarketLabel,
  strategyRiskTypeLabel,
  strategySizingTypeLabel,
  strategyTimeframeLabel,
} from './strategy-display-labels.js';
import type { StrategySchema } from './strategy.types.js';
import type { InstrumentDirectory } from '@thesis-ledger/schemas';
import { strategyInstrumentLabel } from './strategy-instrument-display.js';
import { strategySchema, priceResearchStrategySummary, type BacktestStrategy } from '@thesis-ledger/schemas';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown, fallback = '未配置') =>
  typeof value === 'string' && value.trim() ? value : fallback;

export function StrategyV2Summary({
  schema,
  instrumentDirectory,
  strategyName,
  version,
}: {
  schema: StrategySchema;
  instrumentDirectory?: InstrumentDirectory | undefined;
  strategyName?: string;
  version?: number;
}) {
  const instrument = asRecord(schema.executionInstrument);
  const sizing = asRecord(schema.sizing);
  const sources = Array.isArray(schema.signalSources) ? schema.signalSources : [];
  const risks = Array.isArray(schema.risk) ? schema.risk : [];
  const parsed = strategySchema.safeParse(schema);
  const research = schema.schemaVersion === '3' && parsed.success
    ? priceResearchStrategySummary(parsed.data as BacktestStrategy) : null;
  return (
    <Card size="sm" className="bg-muted/20">
      <CardHeader className="gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:grid-rows-none">
        <div className="min-w-0">
          <CardTitle className="truncate">
            {strategyName ?? text(schema.name, '未知策略')}
          </CardTitle>
          <CardDescription className="mt-1">
            {strategyInstrumentLabel(instrumentDirectory, text(instrument.symbol))} / {strategyMarketLabel(instrument.market, '未配置')} /{' '}
            {strategyAssetTypeLabel(instrument.assetType, '未配置')}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant="secondary">策略 v{version ?? '?'}</Badge>
          <Badge variant="outline">
            {strategyTimeframeLabel(schema.primaryTimeframe, '未配置')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {research && <div className="mb-3 flex flex-col gap-1 text-sm">
          <p>入场：{research.entry}</p><p>退出：{research.exit}</p><p>投入：{research.sizing}</p>
        </div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">信号来源</p>
            <p className="mt-0.5 text-sm">{sources.length} 个</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">仓位</p>
            <p className="mt-0.5 text-sm">
              {research && sizing.type === 'fixedQuantity' ? '投入参考份数' : strategySizingTypeLabel(sizing.type)}{' '}
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
