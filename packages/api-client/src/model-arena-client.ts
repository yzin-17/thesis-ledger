import {
  arenaRoundReportSchema,
  arenaComparisonSchema,
  arenaWeekSummarySchema,
  arenaWeekDetailSchema,
  type ArenaPeriod,
  arenaPointSchema,
  type ArenaPointQuery,
  arenaCalendarPreviewSchema,
  type ArenaCalendarQuery,
  arenaDetailSchema,
  arenaSummarySchema,
  arenaReceiptSchema,
  arenaProtocolSchema,
  type ArenaProtocol,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
export function modelArenaClient(request: ParsedRequest) {
  return {
    points: (id: string, q: ArenaPointQuery, signal?: AbortSignal) =>
      request(
        '/model-arenas/' +
          encodeURIComponent(id) +
          '/points?' +
          new URLSearchParams({
            symbol: q.symbol,
            start: q.start,
            end: q.end,
            ...(q.entrantId && { entrantId: q.entrantId }),
          }).toString(),
        arenaPointSchema.array(),
        { signal: signal ?? null },
      ),
    weeklies: (arenaId?: string, signal?: AbortSignal) =>
      request(
        '/model-weeklies' + (arenaId ? '?arenaId=' + encodeURIComponent(arenaId) : ''),
        arenaWeekSummarySchema.array(),
        { signal: signal ?? null },
      ),
    weekly: (arenaId: string, id: string, signal?: AbortSignal) =>
      request(
        '/model-weeklies/' + encodeURIComponent(arenaId) + '/' + encodeURIComponent(id),
        arenaWeekDetailSchema,
        { signal: signal ?? null },
      ),
    compare: (id: string, period: ArenaPeriod = {}, signal?: AbortSignal) =>
      request(
        '/model-arenas/' +
          encodeURIComponent(id) +
          '/comparison?' +
          new URLSearchParams({
            ...(period.start && { start: period.start }),
            ...(period.end && { end: period.end }),
          }).toString(),
        arenaComparisonSchema,
        { signal: signal ?? null },
      ),
    round: (id: string, roundId: string, signal?: AbortSignal) =>
      request(
        '/model-arenas/' + encodeURIComponent(id) + '/rounds/' + encodeURIComponent(roundId),
        arenaRoundReportSchema,
        { signal: signal ?? null },
      ),
    calendar: (input: ArenaCalendarQuery, signal?: AbortSignal) =>
      request(
        '/model-arenas/calendar?' + new URLSearchParams(input).toString(),
        arenaCalendarPreviewSchema,
        {
          signal: signal ?? null,
        },
      ),
    list: (signal?: AbortSignal) =>
      request('/model-arenas', arenaSummarySchema.array(), { signal: signal ?? null }),
    get: (id: string, signal?: AbortSignal) =>
      request('/model-arenas/' + encodeURIComponent(id), arenaDetailSchema, {
        signal: signal ?? null,
      }),
    transition: (id: string, action: 'start' | 'pause' | 'end') =>
      request('/model-arenas/' + encodeURIComponent(id) + '/' + action, arenaReceiptSchema, {
        method: 'POST',
      }),
    create: (protocol: ArenaProtocol) =>
      request('/model-arenas', arenaReceiptSchema, {
        method: 'POST',
        body: JSON.stringify(arenaProtocolSchema.parse(protocol)),
      }),
  };
}
