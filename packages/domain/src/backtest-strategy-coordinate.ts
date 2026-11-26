/** 定义版本号不等于执行模式；历史升级的 run 来源不隐式变为研究价格。 */
export function isPriceResearchStrategyDefinition(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const strategy = value as {
    schemaVersion?: unknown;
    execution?: { mode?: unknown };
    signalSources?: unknown;
  };
  return (
    strategy.schemaVersion === 'strategy-definition-v1' &&
    strategy.execution?.mode === 'exchange' &&
    Array.isArray(strategy.signalSources) &&
    strategy.signalSources.some(
      (source: unknown) =>
        source &&
        typeof source === 'object' &&
        'priceCoordinate' in source &&
        (source.priceCoordinate === 'research' || source.priceCoordinate === 'actual'),
    )
  );
}
