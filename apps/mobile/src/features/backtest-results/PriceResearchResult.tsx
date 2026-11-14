import type { BacktestResultV3 } from '@thesis-ledger/schemas';
import { Copy, Section } from '../../components/MobilePrimitives';

export function PriceResearchResult({
  result,
  currency,
}: {
  result: BacktestResultV3;
  currency: string;
}) {
  const research = result.priceResearch;
  if (!research) return null;
  return (
    <>
      <Section title="策略收益研究">
        <Copy>
          研究权益：{result.equityCurve.at(-1)?.value.amount ?? '不可用'} {currency}
        </Copy>
        <Copy>
          模拟盈亏：{research.simulatedPnl?.amount ?? '不可用'} {currency}
        </Copy>
        <Copy>
          研究资金余额：{research.fundsBalance.amount} {currency}
        </Copy>
        <Copy>研究单位：{research.positionUnits}</Copy>
        <Copy muted>按冻结的后复权价格序列计算模拟收益。</Copy>
        {research.actualPriceSource && (
          <Copy>
            不复权参考：{research.actualPriceSource.provenance.providerId} /{' '}
            {research.actualPriceSource.provenance.upstreamSource}
          </Copy>
        )}
      </Section>
      {result.simulationFills.length > 0 && (
        <Section title="研究操作">
          {result.simulationFills.map((fill, index) => (
            <Copy key={index}>
              {fill.side === 'buy' ? '买入' : '卖出'} · 研究单位 {fill.quantity} · 后复权价格{' '}
              {fill.price}
              {fill.actualReferencePrice ? ` · 原价参考 ${fill.actualReferencePrice}` : ''}
              {fill.researchSizing
                ? ` · 参考份数 ${fill.researchSizing.referenceQuantity} · 计划投入 ${fill.researchSizing.requestedNotional}`
                : ''}
            </Copy>
          ))}
        </Section>
      )}
    </>
  );
}
