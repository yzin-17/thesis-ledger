import { createHash, randomUUID } from 'node:crypto';
import {
  marketFrozenWindowRefV3Schema,
  marketRouteKeyIdV3,
  sliceTradabilityWindowsV3,
  type MarketFrozenWindowRefV3,
} from '@thesis-ledger/schemas';
import type { MarketBarWindowReadInputV3 } from './market-bar-reader-v3.js';
import type { MarketWindowEvidenceV3Repository } from './market-window-evidence-v3.repository.js';
import { dateInMarket } from './market-window-selector-v3.js';
import { marketWindowSeriesVersionV3 } from './market-frozen-window-v3.js';
import { parseMarketWindowEvidenceResponseV3 } from './market-window-response-v3.js';

export type FrozenMarketWindowV3 = NonNullable<
  Awaited<ReturnType<MarketWindowEvidenceV3Repository['findFrozen']>>
>;

export function deriveFrozenMarketWindowViewV3(
  frozen: FrozenMarketWindowV3,
  reference: MarketFrozenWindowRefV3,
  input: MarketBarWindowReadInputV3,
) {
  const ref = marketFrozenWindowRefV3Schema.parse(reference);
  if (
    ref.identityFingerprint !== frozen.evidence.identityFingerprint ||
    ref.responseHash !== frozen.completeResponseHash
  )
    throw new Error('冻结窗口引用与完整响应不一致');
  const original = frozen.response;
  if (input.tradabilityMode && frozen.request.tradabilityMode !== input.tradabilityMode)
    throw new Error('冻结窗口不具备请求的日级证据');
  const window = input.window;
  if (
    input.market !== original.routeKey.market ||
    input.symbol !== original.symbol ||
    marketRouteKeyIdV3(input.routeKey) !== marketRouteKeyIdV3(original.routeKey)
  )
    throw new Error('冻结窗口的标的或价格路由不匹配');
  if (
    window.start > window.end ||
    window.start < frozen.request.start ||
    window.end > frozen.request.end
  )
    throw new Error('冻结窗口未覆盖请求及预热范围');
  const exactWindow = window.start === frozen.request.start && window.end === frozen.request.end;
  if (!exactWindow && original.sourcePriceBasis.basisScope === 'request-window')
    throw new Error('请求窗口价格基准不能作为其他窗口的原生基准');
  const request = {
    ...frozen.request,
    requestId: randomUUID(),
    start: window.start,
    end: window.end,
  };
  const bars = original.bars.filter((bar) => {
    const date = dateInMarket(bar.timestamp, input.market);
    return date !== null && date >= window.start && date <= window.end;
  });
  if (input.warmup) {
    const { analysisStart, minimumSessions } = input.warmup;
    if (
      bars.filter((bar) => {
        const date = dateInMarket(bar.timestamp, input.market);
        return date !== null && date < analysisStart;
      }).length < minimumSessions
    )
      throw new Error('冻结窗口预热交易日不足');
  }
  const latestComplete = original.coverage.latestCompleteTradingDate;
  const response = exactWindow
    ? { ...original, requestId: request.requestId }
    : {
        ...original,
        requestId: request.requestId,
        bars,
        ...(original.historicalTradabilityWindows ? {
          historicalTradabilityWindows: sliceTradabilityWindowsV3(original.historicalTradabilityWindows, window),
        } : {}),
        coverage: {
          ...original.coverage,
          requestedStart: window.start,
          requestedEnd: window.end,
          actualStart: bars[0]?.timestamp ?? null,
          actualEnd: bars.at(-1)?.timestamp ?? null,
          hasMoreBefore:
            original.coverage.hasMoreBefore ||
            original.bars.some((bar) => {
              const date = dateInMarket(bar.timestamp, input.market);
              return date !== null && date < window.start;
            }),
          latestCompleteTradingDate:
            latestComplete && latestComplete > window.end ? window.end : latestComplete,
        },
        coverageProof: {
          ...original.coverageProof,
          calendar: {
            ...original.coverageProof.calendar,
            supportedRange: { start: window.start, end: window.end },
            expectedSessionDates: original.coverageProof.calendar.expectedSessionDates.filter(
              (date) => date >= window.start && date <= window.end,
            ),
          },
          window: {
            status: 'complete' as const,
            requestedStart: window.start,
            requestedEnd: window.end,
          },
        },
        inputFingerprint: `frozen-window-view-v1:${createHash('sha256')
          .update(JSON.stringify([ref, window.start, window.end]))
          .digest('hex')}`,
      };
  const correlatedResponse = parseMarketWindowEvidenceResponseV3(response, request);
  return {
    request,
    response: correlatedResponse,
    seriesVersion: marketWindowSeriesVersionV3(request, correlatedResponse),
    exactWindow,
  };
}
