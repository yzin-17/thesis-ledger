import { z } from 'zod';
import { marketTradingStatusResponseV3Schema } from './market-trading-status-v3.js';
import { marketBasicLifecycleV3Schema } from './market-basic-lifecycle-v3.js';
import { dailyTradingStatusResultV1Schema, securityBasicDatesResultV1Schema } from './market-status-capabilities-v1.js';
import { marketStatusCompositionV1Schema } from './market-status-composition-v1.js';

export const lifecycleWarmupPolicyV3 = 'listed-bars-warmup-v1' as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const marketLifecycleStatusEvidenceV1Schema = z.strictObject({
  contract: z.literal('market-lifecycle-status-evidence-v1'),
  symbol: dailyTradingStatusResultV1Schema.shape.symbol,
  range: dailyTradingStatusResultV1Schema.shape.range,
  basicLifecycle: marketBasicLifecycleV3Schema,
  days: dailyTradingStatusResultV1Schema.shape.days,
  composition: marketStatusCompositionV1Schema,
}).superRefine((value, ctx) => {
  const included = value.composition.entries.flatMap((entry) => entry.status === 'included' ? [entry.result] : []);
  const status = dailyTradingStatusResultV1Schema.safeParse(included.find(
    (result) => result.routeKey.capability === 'DAILY_TRADING_STATUS',
  ));
  const dates = securityBasicDatesResultV1Schema.safeParse(included.find(
    (result) => result.routeKey.capability === 'SECURITY_BASIC_DATES',
  ));
  if (!status.success || !dates.success || included.length !== 2 ||
      status.data.routeKey.market !== 'CN' || dates.data.routeKey.market !== 'CN' ||
      status.data.symbol !== value.symbol || dates.data.symbol !== value.symbol ||
      status.data.range.start !== value.range.start || status.data.range.end !== value.range.end ||
      JSON.stringify(status.data.days) !== JSON.stringify(value.days) ||
      JSON.stringify(dates.data.dates) !== JSON.stringify(value.basicLifecycle))
    ctx.addIssue({ code: 'custom', message: '生命周期证据必须绑定同一证券的日级状态及独立基础日期' });
});

export type MarketLifecycleStatusEvidenceV1 = z.infer<typeof marketLifecycleStatusEvidenceV1Schema>;

// 已冻结的原始来源响应仍可供历史重读。当前准备由独立能力组合提供证据。
const lifecycleEvidence = z.union([marketLifecycleStatusEvidenceV1Schema, marketTradingStatusResponseV3Schema]);
export type BacktestLifecycleEvidence = z.infer<typeof lifecycleEvidence>;
export const backtestLifecyclePreparationV3Schema = z
  .strictObject({
    version: z.literal(lifecycleWarmupPolicyV3),
    response: lifecycleEvidence,
    inputHash: hash,
    priceResponseHash: hash,
    requiredWarmupBars: z.number().int().min(0).max(504),
    signalStartDate: z.iso.date(),
  })
  .superRefine((value, ctx) => {
    if (
      ('routeKey' in value.response && value.response.routeKey.market !== 'CN') ||
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

type LifecycleRunInput = {
  lifecyclePreparation?: BacktestLifecyclePreparationV3 | undefined;
  startDate: string;
  endDate: string;
  executionPriceProtocol: { history: { basis: string } };
  executionModel?:
    { scope: { market: string; symbol: string; instrumentType: string } } | undefined;
  frozenExecutionWindow?: { responseHash: string } | undefined;
};

function lifecycleBindingMatches(value: LifecycleRunInput, life: BacktestLifecyclePreparationV3): boolean {
  const model = value.executionModel?.scope;
  return !(
    value.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot' ||
    model?.market !== 'CN' ||
    model.instrumentType !== 'STOCK' ||
    model.symbol !== life.response.symbol ||
    life.response.range.start > value.startDate ||
    life.response.range.end !== value.endDate ||
    life.signalStartDate < value.startDate ||
    life.priceResponseHash !== value.frozenExecutionWindow?.responseHash
  );
}

export function lifecycleRunIssuesV3(value: LifecycleRunInput) {
  const life = value.lifecyclePreparation;
  if (!life) return [];
  if (!lifecycleBindingMatches(value, life))
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
