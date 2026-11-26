import type {
  BacktestRunPreparationResultV3,
  OptimizationRunPreparationResult,
} from '@thesis-ledger/schemas';

type Prepared = Extract<
  BacktestRunPreparationResultV3 | OptimizationRunPreparationResult,
  { status: 'prepared' }
>;
export function PreparedPriceSources({ value }: { value: Prepared }) {
  const scope = backtestResearchScopeDisplay(value.runConfig.priceResearch?.dataScope);
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
      {scope && <section className="flex flex-col gap-1" aria-label="本次研究范围">
        <p>可用投入方式：{scope.sizing}</p>
        {scope.inputs.map((input) => <p key={input}>{input}</p>)}
        {scope.limits.map((limit) => <p key={limit}>{limit}</p>)}
      </section>}
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
import { backtestResearchScopeDisplay } from '@thesis-ledger/domain';
