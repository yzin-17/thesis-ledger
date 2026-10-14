import {
  backtestKnownCashAcquisitionClockV3Schema,
  backtestKnownCashAcquisitionV3Schema,
  backtestKnownCashPreparationV3Schema,
  executionPriceProtocolSchema,
  marketKnownCashRequestV3Schema,
  type BacktestKnownCashPreparationV3,
  type BacktestKnownCashAcquisitionV3,
  type ExecutionPriceProtocol,
  type MarketKnownCashRequestV3,
  type MarketKnownCashResponseV3,
} from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import {
  freezeKnownCashResearchInputV3,
  verifyKnownCashResearchInputV3,
} from './backtest-known-cash-research-v3.js';

type ReadScope = Omit<MarketKnownCashRequestV3, 'routeTarget'>;
type ClockIntent =
  | { mode: 'requested-time'; requestedDataAsOf: string }
  | { mode: 'after-acquisition'; requestedDataAsOf: string; readDeadlineAt: string };
export type BacktestKnownCashReadPortV3 = (
  scope: ReadScope,
) => Promise<{ request: MarketKnownCashRequestV3; response: MarketKnownCashResponseV3 }>;

function validatePrice(protocol: ExecutionPriceProtocol): void {
  if (
    protocol.cashEventResearch !== 'ex-date-entitlement-payment-date-cash-v1' ||
    protocol.history.basis !== 'fixed-provider-snapshot' ||
    protocol.accountingBasis !== 'raw-events' ||
    protocol.priceBasis.adjustment !== 'none' ||
    protocol.priceBasis.quantityBasis !== 'actual-units' ||
    protocol.marketRuleResearch
  )
    throw new Error('已知方案准备需要显式原价、实际份额与固定快照现金模型');
}

function readScope(input: Omit<ReadScope, 'dataAsOf'>, dataAsOf: string): ReadScope {
  const parsed = marketKnownCashRequestV3Schema.parse({
    ...input,
    dataAsOf,
    // 仅校验不带选择目标的范围；实际目标由读取端口按保存策略绑定。
    routeTarget: { providerId: 'scope', upstreamSource: 'scope', routeIndex: 0 },
  });
  Reflect.deleteProperty(parsed, 'routeTarget');
  return parsed;
}

/** 价格已取得后调用；不读取供应商DTO，也不替代价格/预热/日历检查。 */
export async function prepareKnownCashResearchV3(options: {
  scope: Omit<ReadScope, 'dataAsOf'>;
  clock: ClockIntent;
  executionPriceProtocol: ExecutionPriceProtocol;
  read: BacktestKnownCashReadPortV3;
  now?: () => string;
}): Promise<BacktestKnownCashPreparationV3> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const clock = backtestKnownCashAcquisitionClockV3Schema.parse({
    ...options.clock,
    startedAt,
    completedAt: startedAt,
  });
  const cutoff =
    clock.mode === 'after-acquisition' ? clock.readDeadlineAt : clock.requestedDataAsOf;
  const scope = readScope(options.scope, cutoff);
  const protocol = executionPriceProtocolSchema.parse(options.executionPriceProtocol);
  validatePrice(protocol);
  const exchange = await options.read(structuredClone(scope));
  const completedAt = now();
  for (const key of Object.keys(scope) as (keyof ReadScope)[]) {
    if (JSON.stringify(exchange.request[key]) !== JSON.stringify(scope[key]))
      throw new Error('现金读取范围与准备请求不一致，需重新准备');
  }
  const acquisition = backtestKnownCashAcquisitionV3Schema.parse({
    version: 'known-cash-acquisition-v1',
    clock: { ...clock, completedAt },
    exchange,
  });
  return freezeAcquisition(acquisition, protocol);
}

function freezeAcquisition(
  acquisition: BacktestKnownCashAcquisitionV3,
  executionPriceProtocol: ExecutionPriceProtocol,
): BacktestKnownCashPreparationV3 {
  const { request, response } = acquisition.exchange;
  const input = freezeKnownCashResearchInputV3({
    policy: request.researchPolicy,
    scope: {
      symbol: request.symbol,
      market: 'CN',
      instrumentType: 'ETF',
      currency: request.currency,
      startDate: request.start,
      endDate: request.end,
      dataAsOf:
        acquisition.clock.mode === 'after-acquisition'
          ? acquisition.clock.completedAt
          : acquisition.clock.requestedDataAsOf,
    },
    executionPriceProtocol,
    source: response.source,
    revisions: {
      desiredRevision: request.desiredRevision,
      effectivePolicyRevision: request.effectivePolicyRevision,
      catalogRevision: request.catalogRevision,
    },
    coverage: response.coverage,
    ignoredEmptyRows: response.ignoredEmptyRows,
    records: response.records,
    ...(response.assessment ? { assessment: response.assessment } : {}),
  });
  const prepared = backtestKnownCashPreparationV3Schema.parse({
    version: 'known-cash-preparation-v1',
    acquisition,
    input,
    contentHash: '0'.repeat(64),
  });
  prepared.contentHash = hashCanonicalManifest(prepared);
  return prepared;
}

/** 离线验证准备收据及内层冻结数据，同时匹配创建阶段的预期摘要。 */
export function verifyKnownCashPreparationV3(
  value: unknown,
  expectedContentHash: string,
): BacktestKnownCashPreparationV3 {
  const prepared = backtestKnownCashPreparationV3Schema.parse(value);
  verifyKnownCashResearchInputV3(prepared.input, prepared.input.contentHash);
  if (
    hashCanonicalManifest(prepared) !== prepared.contentHash ||
    prepared.contentHash !== expectedContentHash
  )
    throw new Error('现金准备绑定摘要不一致，需重新准备');
  return prepared;
}
