import type {
  BacktestRunPreparationResultV3,
  OptimizationRunPreparationResult,
} from '@thesis-ledger/schemas';

type Prepared = Extract<
  BacktestRunPreparationResultV3 | OptimizationRunPreparationResult,
  { status: 'prepared' }
>;
export function PreparedPriceSources({ value }: { value: Prepared }) {
  const sources = [
    {
      label: value.runConfig.priceResearch ? '后复权来源' : '实际来源',
      source: value.actualSource,
    },
  ];
  if (value.actualPriceSource)
    sources.push({ label: '不复权来源', source: value.actualPriceSource });
  return (
    <>
      {sources.map(({ label, source }) => (
        <p key={label} className="break-words">
          {label}：{source.provenance.providerId} / {source.provenance.upstreamSource} ·{' '}
          {source.provenance.routeIndex === 0 ? '主源' : '备用源'}
        </p>
      ))}
      {value.runConfig.priceResearch?.actualPriceWindow && !value.actualPriceSource && (
        <p>不复权来源未返回，请重新准备。</p>
      )}
    </>
  );
}
