import { randomUUID } from 'node:crypto';
import { statusCompositionDemandV1Schema, type ArenaLiveProtocol } from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import { DsaV3ProtocolError } from '../integration/dsa/dsa-v3-protocol.js';
import type { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import { replayExecutionInstrument, replayTradingLimits } from './market-arena-replay-rules.js';

/** ETF 只消费其精确执行快照；股票可回退到既有身份与状态组合。 */
export async function readReplayExecutionEvidence(
  dsa: Pick<DsaClient, 'backtestInstrumentFacts'> & Partial<Pick<DsaClient, 'historicalExecution'>>,
  statusReader: Pick<MarketLifecycleReaderV3, 'readComposition'>,
  p: ArenaLiveProtocol,
  instrument: { symbol: string; assetType: 'STOCK' | 'ETF' },
  at: string,
  executionAt: string,
  day: string,
) {
  const symbol = instrument.symbol;
  const snapshot =
    p.market === 'CN' && dsa.historicalExecution
      ? await dsa
          .historicalExecution({ symbol, assetType: instrument.assetType, asOf: executionAt,
            purpose: p.simulationPolicy ? 'sampled' : 'full' })
          .catch((error) => {
            if (instrument.assetType === 'ETF')
              throw new Error('replay_rules_unavailable', { cause: error });
            if (p.simulationPolicy) return null;
            if (error instanceof DsaV3ProtocolError && error.code === 'insufficient-coverage')
              throw new Error('replay_rules_unavailable', { cause: error });
            throw error;
          })
      : null;
  // 状态组合合同仅支持股票；ETF 缺少快照时保持其准入边界。
  if (!snapshot && instrument.assetType === 'ETF') throw new Error('replay_rules_unavailable');
  const scope = snapshot
    ? { facts: [snapshot.fact] }
    : await dsa.backtestInstrumentFacts({
        market: p.market,
        symbol,
        instrumentType: instrument.assetType,
        start: day,
        end: day,
        executionStart: day,
        executionEnd: day,
        dataAsOf: at,
        ...(p.simulationPolicy ? { identityOnly: true } : {}),
      });
  const { fact, rule, lot, tick } = replayExecutionInstrument(
    scope,
    p,
    symbol,
    instrument,
    at,
    day,
  );
  const status =
    snapshot ??
    (await statusReader.readComposition(
      (p.simulationPolicy
        ? (['DAILY_TRADING_STATUS'] as const)
        : (['DAILY_TRADING_STATUS', 'DAILY_PRICE_RULE'] as const)
      ).map((capability) =>
        statusCompositionDemandV1Schema.parse({
          requirement: 'completeWindow',
          query: {
            contractVersion: 1,
            capabilityVersion: 1,
            consumer: 'thesis-ledger',
            requestId: randomUUID(),
            symbol,
            range: { start: day, end: day },
            routeKey: {
              kind: 'data',
              market: p.market,
              assetType: instrument.assetType,
              capability,
            },
            ...(capability === 'DAILY_PRICE_RULE' ? { representation: 'exactPrices' } : {}),
          },
        }),
      ),
    ));
  let limits;
  if ('fact' in status) {
    if (p.simulationPolicy) {
      limits = { tradingDay: status.trading, priceRule: { kind: 'unlimited' as const } };
    } else {
      if (!('priceRule' in status)) throw new Error('replay_rules_unavailable');
      limits = { tradingDay: status.trading, priceRule: status.priceRule };
    }
  } else {
    limits = replayTradingLimits(status, symbol, day, at, !!p.simulationPolicy);
  }
  const { tradingDay, priceRule } = limits;
  return { fact, rule, lot, tick, status, tradingDay, priceRule };
}

const researchExecutionReasons = new Set([
  'replay_rules_unavailable',
  'replay_calendar_unavailable',
  'replay_prices_unavailable',
  'replay_tools_unavailable',
  'symbol_outside_universe',
  'corporate_action_unprocessed',
]);

/** 模型只消费业务原因码，原始异常不进入研究上下文。 */
export function replayResearchExecutionReason(error: unknown): string {
  if (error instanceof Error && researchExecutionReasons.has(error.message)) return error.message;
  return 'replay_rules_unavailable';
}
