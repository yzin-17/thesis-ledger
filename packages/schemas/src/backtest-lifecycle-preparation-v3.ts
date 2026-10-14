import { z } from 'zod';
import { marketTradingStatusResponseV3Schema } from './market-trading-status-v3.js';

export const lifecycleWarmupPolicyV3 = 'listed-bars-warmup-v1' as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const backtestLifecyclePreparationV3Schema = z
  .strictObject({
    version: z.literal(lifecycleWarmupPolicyV3),
    response: marketTradingStatusResponseV3Schema,
    inputHash: hash,
    priceResponseHash: hash,
    requiredWarmupBars: z.number().int().min(0).max(504),
    signalStartDate: z.iso.date(),
  })
  .superRefine((value, ctx) => {
    if (
      value.response.routeKey.market !== 'CN' ||
      !value.response.basicLifecycle ||
      value.signalStartDate < value.response.range.start ||
      value.signalStartDate > value.response.range.end
    )
      ctx.addIssue({
        code: 'custom',
        message: '生命周期准备需要境内股票基础日期及查询范围内的实际信号起点',
      });
  });
export type BacktestLifecyclePreparationV3 = z.infer<typeof backtestLifecyclePreparationV3Schema>;

export function lifecycleRunIssuesV3(value: {
  lifecyclePreparation?: BacktestLifecyclePreparationV3 | undefined;
  startDate: string;
  endDate: string;
  executionPriceProtocol: { history: { basis: string } };
  executionModel?:
    { scope: { market: string; symbol: string; instrumentType: string } } | undefined;
  frozenExecutionWindow?: { responseHash: string } | undefined;
}) {
  const life = value.lifecyclePreparation;
  if (!life) return [];
  const model = value.executionModel?.scope;
  if (
    value.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot' ||
    model?.market !== 'CN' ||
    model.instrumentType !== 'STOCK' ||
    model.symbol !== life.response.symbol ||
    life.response.range.start > value.startDate ||
    life.response.range.end !== value.endDate ||
    life.signalStartDate < value.startDate ||
    life.priceResponseHash !== value.frozenExecutionWindow?.responseHash
  )
    return ['生命周期准备必须绑定固定来源同证券、原区间及冻结价格响应'];
  if (
    life.response.basicLifecycle?.ipoDateStatus !== 'known' &&
    life.signalStartDate !== value.startDate
  )
    return ['上市日未知不得按价格首行推迟信号起点'];
  const basic = life.response.basicLifecycle;
  if (
    (basic?.ipoDate && life.signalStartDate < basic.ipoDate) ||
    (basic?.outDate && life.signalStartDate >= basic.outDate)
  )
    return ['生命周期范围外不能作为信号起点'];
  return [];
}
