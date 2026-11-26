/** 与正式策略 JSON 同形的运行时合同，领域不依赖 Zod。 */
import type { BooleanExpression } from './backtest-strategy.js';
export type TradePlanProtectionActivation =
  { kind: 'immediate' } | { kind: 'condition'; condition: BooleanExpression };
export interface TradePlanProtectionActivationFields {
  activation?: TradePlanProtectionActivation | undefined;
}
export interface BacktestTradePlan {
  version: 1;
  evaluation: 'barClose';
  initialStop?:
    | (TradePlanProtectionActivationFields &
        (
          | { kind: 'percent'; percent: string }
          | { kind: 'entryAtr'; sourceId: string; period: number; multiple: string }
        ))
    | undefined;
  trailing?:
    | (TradePlanProtectionActivationFields & {
        activationGainPercent?: string | undefined;
        breakEvenGainPercent?: string | undefined;
      } & (
          | { drawdownPercent: string; kind?: undefined }
          | { kind: 'currentAtr'; sourceId: string; period: number; multiple: string }
        ))
    | undefined;
  cooldown?: { bars: number; stopBars: number } | undefined;
  lossPause?:
    { completedTrades: number; tradingDays: number; pnlBasis: 'fillsNetOfFees' } | undefined;
  riskBudget?: { equityFraction: string; maxEquityFraction: string } | undefined;
  monthlyRebalance?:
    | {
        targetEquityFraction: string;
        deviationThreshold: string;
        evaluation: 'lastTradingDayClose';
      }
    | undefined;
  volatilityTarget?:
    | {
        returnPeriods: number;
        targetAnnualVolatility: string;
        maxEquityFraction: string;
        annualizationPeriods: 252;
        returnKind: 'simple';
        variance: 'sample';
        update: 'dailyClose';
      }
    | undefined;
  stages: BacktestTradeStage[];
}
export interface BacktestTradeStage {
  id: string;
  trigger: { kind: 'gainPercent' | 'entryAtrMultiple'; value: string };
  action:
    | { kind: 'reduce'; basis: 'initialQuantity' | 'remainingQuantity'; fraction: string }
    | { kind: 'add'; initialFraction: string; maxEquityFraction: string };
}
export interface TradePlanAction {
  kind: 'entry' | 'stop' | 'exit' | 'reduce' | 'add' | 'rebalance';
  side?: 'buy' | 'sell';
  targetWeight?: string;
  sizingFacts?: readonly string[];
  stageId?: string;
  quantity?: string;
  distance?: string;
  atr?: string;
  maxEquityFraction?: string;
}

/** 空壳配置只保留原始定义，不启用计划执行；显式功能配置保持其现有语义。 */
export function activeBacktestTradePlan(
  plan: BacktestTradePlan | undefined,
): BacktestTradePlan | undefined {
  if (!plan) return undefined;
  if (plan.stages.length > 0) return plan;
  const metadata = ['version', 'evaluation', 'stages'];
  return Object.entries(plan).some(([key, value]) => !metadata.includes(key) && value !== undefined)
    ? plan
    : undefined;
}
