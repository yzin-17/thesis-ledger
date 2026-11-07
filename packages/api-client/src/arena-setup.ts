import {
  arenaProtocolSchema,
  type ArenaProtocol,
  type AiProviderRecord,
  type InstrumentSearchResult,
  type WatchlistPage,
} from '@thesis-ledger/schemas';
import type { ThesisLedgerApiClient } from './index.js';
export const arenaSetupFields = [
  ['title', '比赛名称', ''],
  ['startsOn', '开始日期（YYYY-MM-DD）', ''],
  ['endsOn', '结束日期（YYYY-MM-DD）', ''],
  ['initialCash', '每个模型的模拟本金', '100000'],
  ['maxPositionBps', '单标的仓位上限（万分比）', '5000'],
  ['buyBps', '买入费率（万分比）', '0'],
  ['sellBps', '卖出费率（万分比）', '0'],
  ['minimum', '单笔最低交易费', '0'],
  ['slippageBps', '开盘滑点（万分比）', '0'],
  ['deadline', '收盘后的决策时限（分钟）', '60'],
  ['maxInput', '每轮输入令牌上限', '16000'],
  ['maxOutput', '每轮输出令牌上限', '1500'],
  ['requests', '每个模型的请求总额', '0'],
  ['tokens', '每个模型的令牌总额', '0'],
  ['cost', '每个模型的费用总额', '0'],
  ['allRequests', '全场请求总额', '0'],
  ['allTokens', '全场令牌总额', '0'],
  ['allCost', '全场费用总额', '0'],
] as const;
type Field = (typeof arenaSetupFields)[number][0];
export type ArenaForm = Record<Field, string>;
export const arenaInitialForm = () =>
  Object.fromEntries(arenaSetupFields.map(([key, , v]) => [key, v])) as ArenaForm;
export type ArenaChoice = ArenaProtocol['instruments'][number];
export type ArenaBinding = Pick<ArenaProtocol['entrants'][number], 'model' | 'providerId'>;
export function arenaModels(providers: AiProviderRecord[]): ArenaBinding[] {
  return providers
    .filter((p) => p.enabled)
    .flatMap((p) =>
      [
        ...new Set(
          (p.executionRoutes ?? [])
            .filter((r) => {
              if (r.contract.id !== 'arena_decision' || r.contract.version !== 'arena-decision-v1')
                return false;
              if (r.readiness.state === 'ready') return true;
              // 建赛只选模型，费用由开轮时全员预留。
              const price = p.modelPricing?.[r.model];
              return (
                r.liveValidation.status === 'passed' &&
                r.readiness.reasons.length === 1 &&
                r.readiness.reasons[0] === 'budget_not_authorized' &&
                price?.costPer1kInput != null &&
                price.costPer1kOutput != null &&
                Boolean(price.costCurrency)
              );
            })
            .map((r) => r.model),
        ),
      ]
        .sort()
        .map((model) => ({ providerId: p.name, model })),
    );
}
export function arenaChoice(
  item: Pick<InstrumentSearchResult, 'id' | 'symbol' | 'instrumentType' | 'active'>,
): ArenaChoice | null {
  if (!item.active || (item.instrumentType !== 'STOCK' && item.instrumentType !== 'ETF'))
    return null;
  return { instrumentId: item.id, symbol: item.symbol, assetType: item.instrumentType };
}
export function arenaChoiceMarket(symbol: string): ArenaProtocol['market'] {
  if (symbol.endsWith('.US')) return 'US';
  if (symbol.endsWith('.HK')) return 'HK';
  return 'CN';
}
export function arenaMerge(pool: ArenaChoice[], items: ArenaChoice[]) {
  const merged = [...new Map([...pool, ...items].map((i) => [i.instrumentId, i])).values()];
  if (merged.length > 50) throw Error('每场最多选 50 个标的');
  if (new Set(merged.map((i) => arenaChoiceMarket(i.symbol))).size > 1)
    throw Error('同场比赛请选择同一市场的标的');
  return merged;
}
export async function copyArenaGroup(api: ThesisLedgerApiClient, group: string) {
  let offset: number | null = 0,
    revision: number | undefined;
  const result: ArenaChoice[] = [];
  do {
    const page: WatchlistPage = await api.watchlist.list({ group, offset });
    if (!page.groups.some((g) => g.id === group)) throw Error('自选分组已变化，请重新选择');
    if (revision !== undefined && revision !== page.revision)
      throw Error('导入期间名单已变化，请重试');
    revision = page.revision;
    for (const i of page.items) {
      const item = arenaChoice({
        ...i.instrument,
        symbol: i.instrument.canonicalCode + '.' + i.instrument.market,
      });
      if (!item) throw Error('分组包含未启用或不支持模拟交易的标的');
      result.push(item);
    }
    if (result.length > 50) throw Error('分组超过单场标的上限');
    offset = page.nextOffset;
  } while (offset !== null);
  return arenaMerge([], result);
}
const integer = (n: string) => (/^\d+$/.test(n) ? Number(n) : NaN);
function micros(value: string) {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) throw Error('模型费用须为非负金额，最多六位小数');
  const [units, decimal = ''] = value.split('.');
  return Number(units) * 1000000 + Number(decimal.padEnd(6, '0'));
}
export async function saveArenaSetup(
  api: ThesisLedgerApiClient,
  f: ArenaForm,
  instruments: ArenaChoice[],
  models: ArenaBinding[],
  budgetCurrency: ArenaProtocol['budgetCurrency'],
) {
  if (!instruments[0] || models.length < 2) throw Error('请选择标的及至少两个参赛模型');
  const market = arenaChoiceMarket(instruments[0].symbol);
  const currency = { CN: 'CNY', HK: 'HKD', US: 'USD' }[market];
  const raw = {
    version: 1,
    title: f.title,
    market,
    currency,
    startsOn: f.startsOn,
    endsOn: f.endsOn,
    initialCash: f.initialCash,
    maxPositionBps: integer(f.maxPositionBps),
    fees: {
      version: 'fixed-v1',
      buyBps: integer(f.buyBps),
      sellBps: integer(f.sellBps),
      slippageBps: integer(f.slippageBps),
      minimum: f.minimum,
    },
    benchmarks: ['cash', 'equal_weight_buy_hold'],
    decisionDeadlineMinutes: integer(f.deadline),
    maxInfrastructureAttempts: 3,
    budgetCurrency,
    budget: {
      requests: integer(f.allRequests),
      tokens: integer(f.allTokens),
      costMicros: micros(f.allCost),
    },
    instruments,
    entrants: models.map((m) => ({
      ...m,
      budget: {
        requests: integer(f.requests),
        tokens: integer(f.tokens),
        costMicros: micros(f.cost),
      },
      maxInputTokens: integer(f.maxInput),
      maxOutputTokens: integer(f.maxOutput),
    })),
  };
  const timeZone = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' }[market];
  const checked = arenaProtocolSchema.safeParse({
    ...raw,
    timeZone,
    calendarId: market,
    calendarVersion: 'preview',
  });
  if (!checked.success) throw Error('请核对赛期、费用、额度、仓位和模型上限');
  const calendar = await api.modelArenas.calendar({
    market,
    startsOn: f.startsOn,
    endsOn: f.endsOn,
  });
  return api.modelArenas.create({ ...checked.data, ...calendar });
}
