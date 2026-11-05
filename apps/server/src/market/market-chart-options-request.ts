import { BadRequestException } from '@nestjs/common';
import { marketChartOptionsWindowV3Schema, marketChartPlanV3Schema } from '@thesis-ledger/schemas';
import { marketChartRequest } from './market-chart-request.js';
import { parseMarketTimeframe } from './market-period-request.js';
import { planMarketChartWindow } from './market-chart-window.js';
import { indicatorReadInput, MAX_CHART_V3_INDICATOR_INPUT_POINTS } from './market-indicator-window.js';
import { selectIndicatorParameters } from './market-indicator-request.js';

type Query = Record<'start' | 'end' | 'barsLimit' | 'indicatorParams' | 'planEnd' | 'timeframe', string | undefined>
  & { assetType?: string | undefined };

export function parseChartOptionsQuery(query: Query) {
  const timeframe = parseMarketTimeframe(query.timeframe);
  if (timeframe !== '1d' && timeframe !== '1m') throw new BadRequestException('图表原生选项只支持日线或1分钟');
  const explicitTimeframe = query.timeframe !== undefined;
  if (query.assetType !== undefined && query.assetType !== 'STOCK' && query.assetType !== 'ETF')
    throw new BadRequestException('显式图表类型必须为 STOCK 或 ETF');
  const assetType = query.assetType;
  if (query.barsLimit !== undefined || query.indicatorParams !== undefined || query.planEnd !== undefined) {
    if (query.start !== undefined || query.end !== undefined) throw new BadRequestException('图表规划与显式窗口不能同时传入');
    try {
      const plan = marketChartPlanV3Schema.parse({ barsLimit: Number(query.barsLimit ?? 90),
        indicatorParams: query.indicatorParams === undefined ? {} : JSON.parse(query.indicatorParams) as unknown,
        ...(query.planEnd !== undefined ? { end: query.planEnd } : {}),
        ...(explicitTimeframe ? { timeframe } : {}), ...(assetType ? { assetType } : {}) });
      return { timeframe, explicitTimeframe, assetType, plan };
    } catch { throw new BadRequestException('图表窗口规划参数无效'); }
  }
  const parsed = query.start !== undefined || query.end !== undefined
    ? marketChartOptionsWindowV3Schema.safeParse({ start: query.start, end: query.end }) : undefined;
  if (parsed && !parsed.success) throw new BadRequestException('图表能力窗口必须提供有效且有序的 start/end');
  return { timeframe, explicitTimeframe, assetType, window: parsed?.data };
}

export function planChartOptionsRequest(identity: { symbol: string; assetType: string },
  query: ReturnType<typeof parseChartOptionsQuery>) {
  const { timeframe } = query;
  if (query.assetType && (!/\.(HK|US)$/.test(identity.symbol) ||
      (identity.assetType !== 'UNKNOWN' && identity.assetType !== query.assetType)))
    throw new BadRequestException('显式图表类型与当前市场或已知身份不一致');
  const selectedIdentity = { ...identity, assetType: query.assetType ?? identity.assetType };
  const selected = { ...selectedIdentity, ...(query.explicitTimeframe ? { timeframe } : {}) };
  if (!query.plan) return { identity: selected, window: query.window };
  const plan = query.plan;
  const input = marketChartRequest(identity.symbol, { assetType: selectedIdentity.assetType, timeframe,
    adjustment: timeframe === '1m' ? 'none' : 'qfq', limit: String(plan.barsLimit), acceptance: 'interactive',
    ...(plan.end ? { end: planMarketChartWindow({ end: plan.end }, { ...selectedIdentity, timeframe }).end } : {}) });
  const requests = (['MA', 'MACD', 'RSI'] as const).map((name) => ({ name,
    parameters: selectIndicatorParameters(name, JSON.stringify(plan.indicatorParams)) }));
  const window = planMarketChartWindow(indicatorReadInput(input, requests, MAX_CHART_V3_INDICATOR_INPUT_POINTS).window,
    { ...selectedIdentity, timeframe });
  return { identity: selected, window, plan };
}
