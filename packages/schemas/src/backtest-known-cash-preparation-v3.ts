import { z } from 'zod';
import { backtestKnownCashResearchInputV3Schema } from './backtest-known-cash-research-v3.js';
import { marketKnownCashExchangeV3Schema } from './market-known-cash-wire-v3.js';
import {
  compareMarketPitEvidenceInstantStringsV1,
  compareMarketPitEvidenceInstantsV1,
  parseMarketPitEvidenceInstantV1,
} from './market-pit-evidence-instant-v1.js';

const timestamp = z.iso.datetime({ offset: true });
const clockFields = {
  requestedDataAsOf: timestamp,
  startedAt: timestamp,
  completedAt: timestamp,
};
const clockSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('requested-time'), ...clockFields }),
  z.strictObject({
    mode: z.literal('after-acquisition'),
    ...clockFields,
    readDeadlineAt: timestamp,
  }),
]);
type Clock = z.infer<typeof clockSchema>;

function requireBefore(left: string, right: string, path: string[], ctx: z.RefinementCtx) {
  const order = compareMarketPitEvidenceInstantStringsV1(left, right);
  if (order === undefined || order > 0)
    ctx.addIssue({ code: 'custom', path, message: '取得时钟倒退、越界或无效' });
}

function validateClock(clock: Clock, ctx: z.RefinementCtx) {
  requireBefore(clock.startedAt, clock.completedAt, ['clock', 'completedAt'], ctx);
  if (clock.mode !== 'after-acquisition') return;
  requireBefore(clock.startedAt, clock.readDeadlineAt, ['clock', 'readDeadlineAt'], ctx);
  requireBefore(clock.completedAt, clock.readDeadlineAt, ['clock', 'completedAt'], ctx);
  try {
    const start = parseMarketPitEvidenceInstantV1(clock.startedAt);
    const deadline = parseMarketPitEvidenceInstantV1(clock.readDeadlineAt);
    if (
      compareMarketPitEvidenceInstantsV1(deadline, { ...start, seconds: start.seconds + 60n }) > 0
    )
      ctx.addIssue({
        code: 'custom',
        path: ['clock', 'readDeadlineAt'],
        message: '取得上限超过60秒',
      });
  } catch {
    ctx.addIssue({ code: 'custom', path: ['clock'], message: '取得时钟无效' });
  }
}

export const backtestKnownCashAcquisitionClockV3Schema = clockSchema.superRefine(validateClock);

/** 上限只约束取得，实际完成时刻才可能成为显式研究截止。 */
export const backtestKnownCashAcquisitionV3Schema = z
  .strictObject({
    version: z.literal('known-cash-acquisition-v1'),
    clock: backtestKnownCashAcquisitionClockV3Schema,
    exchange: marketKnownCashExchangeV3Schema,
  })
  .superRefine(({ clock, exchange }, ctx) => {
    const cutoff =
      clock.mode === 'after-acquisition' ? clock.readDeadlineAt : clock.requestedDataAsOf;
    if (exchange.request.dataAsOf !== cutoff)
      ctx.addIssue({
        code: 'custom',
        path: ['exchange', 'request', 'dataAsOf'],
        message: '读取截止与时钟选择不一致',
      });
    requireBefore(
      exchange.response.fetchedAt,
      clock.completedAt,
      ['exchange', 'response', 'fetchedAt'],
      ctx,
    );
    requireBefore(
      exchange.response.source.observedAt,
      clock.completedAt,
      ['exchange', 'response', 'source'],
      ctx,
    );
  });

/** 生产绑定单独严格校验；不改变D2本地兼容输入或旧RunConfig。 */
export const backtestKnownCashPreparationV3Schema = z
  .strictObject({
    version: z.literal('known-cash-preparation-v1'),
    acquisition: backtestKnownCashAcquisitionV3Schema,
    input: backtestKnownCashResearchInputV3Schema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine(({ acquisition, input }, ctx) => {
    const { request, response } = acquisition.exchange;
    const dataAsOf =
      acquisition.clock.mode === 'after-acquisition'
        ? acquisition.clock.completedAt
        : acquisition.clock.requestedDataAsOf;
    const pairs: [string, unknown, unknown][] = [
      ['policy', input.policy, request.researchPolicy],
      [
        'scope',
        input.scope,
        {
          symbol: request.symbol,
          market: 'CN',
          instrumentType: 'ETF',
          currency: request.currency,
          startDate: request.start,
          endDate: request.end,
          dataAsOf,
        },
      ],
      ['source', input.source, response.source],
      [
        'revisions',
        input.revisions,
        {
          desiredRevision: request.desiredRevision,
          effectivePolicyRevision: request.effectivePolicyRevision,
          catalogRevision: request.catalogRevision,
        },
      ],
      ['coverage', input.coverage, response.coverage],
      ['ignoredEmptyRows', input.ignoredEmptyRows, response.ignoredEmptyRows],
      ['assessment', input.assessment, response.assessment],
      [
        'records',
        input.records,
        [...response.records].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)),
      ],
    ];
    for (const [key, actual, expected] of pairs) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        ctx.addIssue({
          code: 'custom',
          path: ['input', key],
          message: '冻结输入与实际取得不一致，需重新准备',
        });
    }
  });

export type BacktestKnownCashAcquisitionV3 = z.infer<typeof backtestKnownCashAcquisitionV3Schema>;
export type BacktestKnownCashPreparationV3 = z.infer<typeof backtestKnownCashPreparationV3Schema>;
