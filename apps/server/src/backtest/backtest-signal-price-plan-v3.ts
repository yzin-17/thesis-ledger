import {
  expressionSourceIds,
  requiredLookbackForExpression,
  tradePlanProtectionRules,
  tradePlanIndicatorExpressions,
  dailyOrderPriceExpressions,
  type Expression,
} from '@thesis-ledger/domain';
import {
  priceResearchReferenceArtifactKey,
  type BacktestStrategy,
  type RunConfigV3,
} from '@thesis-ledger/schemas';

const baseTimeframe = (timeframe: string) => (timeframe === '1d' ? '1d' : '1m');
export function signalPriceArtifactKeyV3(
  strategy: BacktestStrategy,
  sourceId: string,
  runConfig: RunConfigV3,
): string {
  const source = strategy.signalSources.find((item) => item.id === sourceId);
  if (!source) throw new Error('缺少已声明信号来源');
  const actual =
    runConfig.priceInputBindings?.signals.find((item) => item.sourceId === sourceId)?.binding ===
    'actual-price-series';
  if (baseTimeframe(source.timeframe) === baseTimeframe(strategy.primaryTimeframe))
    return actual ? priceResearchReferenceArtifactKey : 'execution/bars.parquet';
  const adjustment = actual ? 'none' : runConfig.executionPriceProtocol.priceBasis.adjustment;
  return `signal/${source.asset.market}-${encodeURIComponent(source.asset.symbol)}-${baseTimeframe(source.timeframe)}-${adjustment}.parquet`;
}

/** 来源 ID 是逻辑用途；同标的同物理周期和口径只获取、冻结一次。 */
export function additionalSignalPricePlanV3(strategy: BacktestStrategy, runConfig: RunConfigV3) {
  const plans = new Map<
    string,
    {
      artifactKey: string;
      evidenceKey: string;
      symbol: string;
      minimumWarmupRows: number;
      routeKey: {
        kind: 'bar';
        market: 'CN' | 'HK' | 'US';
        assetType: 'STOCK' | 'ETF';
        capability: 'DAILY_BAR' | 'MINUTE_BAR';
        timeframe: '1d' | '1m';
        adjustment: RunConfigV3['executionPriceProtocol']['priceBasis']['adjustment'];
      };
    }
  >();
  for (const binding of runConfig.priceInputBindings?.signals ?? []) {
    const source = strategy.signalSources.find((item) => item.id === binding.sourceId);
    if (!source) throw new Error('信号绑定引用未声明来源');
    const artifactKey = signalPriceArtifactKeyV3(strategy, source.id, runConfig);
    if (!artifactKey.startsWith('signal/')) continue;
    const instrument = strategy.executionInstrument;
    if (
      source.asset.symbol !== instrument.symbol ||
      source.asset.market !== instrument.market ||
      source.asset.assetType !== instrument.assetType ||
      instrument.assetType === 'fund'
    )
      throw new Error('额外周期只支持同一场内执行标的');
    const daily = source.timeframe === '1d';
    const multiple = daily ? 1 : Number(source.timeframe.replace('m', ''));
    const requirement = Math.max(
      1,
      ...[
        strategy.entry,
        strategy.exit,
        ...tradePlanIndicatorExpressions(strategy.tradePlan),
        ...tradePlanProtectionRules(strategy.tradePlan).map((item) => item.expression),
        ...dailyOrderPriceExpressions(strategy.execution).map((item) => item.expression),
      ].map((expression) => sourceLookback(expression, source.id)),
    );
    const minimumWarmupRows = Math.max(
      plans.get(artifactKey)?.minimumWarmupRows ?? 0,
      requirement * multiple,
    );
    plans.set(artifactKey, {
      artifactKey,
      minimumWarmupRows,
      evidenceKey: 'metadata/' + artifactKey.replace('.parquet', '.evidence.parquet'),
      symbol: source.asset.symbol,
      routeKey: {
        kind: 'bar',
        market: instrument.market,
        assetType: instrument.assetType === 'stock' ? 'STOCK' : 'ETF',
        capability: daily ? 'DAILY_BAR' : 'MINUTE_BAR',
        timeframe: daily ? '1d' : '1m',
        adjustment:
          binding.binding === 'actual-price-series'
            ? 'none'
            : runConfig.executionPriceProtocol.priceBasis.adjustment,
      },
    });
  }
  return [...plans.values()].sort((a, b) => a.artifactKey.localeCompare(b.artifactKey));
}

function sourceLookback(expression: Expression, sourceId: string): number {
  const ids = expressionSourceIds(expression);
  if (!ids.includes(sourceId)) return 0;
  if (ids.length === 1) return requiredLookbackForExpression(expression);
  const children = Object.values(expression)
    .flatMap<unknown>((value: unknown) => (Array.isArray(value) ? (value as unknown[]) : [value]))
    .filter(
      (value): value is Expression => !!value && typeof value === 'object' && 'type' in value,
    );
  return (
    Math.max(0, ...children.map((child) => sourceLookback(child, sourceId))) +
    Number(expression.type === 'cross')
  );
}
