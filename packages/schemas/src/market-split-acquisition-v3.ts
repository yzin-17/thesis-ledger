import { z } from 'zod';
import {
  marketEventExchangeV3Schema,
  marketEventRequestV3Schema,
} from './market-event-wire-v3.js';
import {
  compareMarketPitEvidenceInstantStringsV1,
  parseMarketPitEvidenceInstantV1,
} from './market-pit-evidence-instant-v1.js';
import { marketEventAdmissionV3Schema } from './market-event-admission-v3.js';

const timestamp = z.iso.datetime({ offset: true }).max(1_050);

function hasOriginalSplitProof(response: z.infer<typeof marketEventExchangeV3Schema>['response']) {
  return response.admission?.adapterRevision === 'dsa-eastmoney-fund-split-mapped-v1'
    && !!response.dateMappingEvidence && !response.identityEvidence && !response.tushareIdentityEvidence
    && !response.hithinkIdentityEvidence && !response.noticeDividendEvidence;
}

function requireOrder(
  left: string,
  right: string,
  path: (string | number)[],
  ctx: z.RefinementCtx,
  strict = false,
) {
  const order = compareMarketPitEvidenceInstantStringsV1(left, right);
  if (order === undefined || order > 0 || (strict && order === 0))
    ctx.addIssue({ code: 'custom', path, message: '拆分采集时钟无效、倒退或越界' });
}

/** 获取期限仅授权本次取得，最终截止使用实际完成时刻。 */
export const marketSplitAcquisitionClockV3Schema = z
  .strictObject({
    mode: z.literal('after-acquisition'),
    readTimeoutMs: z.number().int().min(1).max(2_147_483_647),
    startedAt: timestamp,
    readDeadlineAt: timestamp,
    completedAt: timestamp,
    finalDataAsOf: timestamp,
  })
  .superRefine((clock, ctx) => {
    requireOrder(clock.startedAt, clock.completedAt, ['completedAt'], ctx);
    requireOrder(clock.completedAt, clock.readDeadlineAt, ['completedAt'], ctx, true);
    if (clock.finalDataAsOf !== clock.completedAt)
      ctx.addIssue({ code: 'custom', path: ['finalDataAsOf'], message: '最终截止必须为实际完成时刻' });
    try {
      const start = parseMarketPitEvidenceInstantV1(clock.startedAt);
      const deadline = parseMarketPitEvidenceInstantV1(clock.readDeadlineAt);
      const width = Math.max(3, start.fraction.length, deadline.fraction.length);
      const scale = 10n ** BigInt(width);
      const elapsed = (deadline.seconds - start.seconds) * scale
        + BigInt(deadline.fraction.padEnd(width, '0'))
        - BigInt(start.fraction.padEnd(width, '0'));
      const budget = BigInt(clock.readTimeoutMs) * (scale / 1_000n);
      if (elapsed <= 0n || elapsed > budget)
        ctx.addIssue({ code: 'custom', path: ['readDeadlineAt'], message: '读取期限超过原预算或不晚于开始' });
    } catch {
      ctx.addIssue({ code: 'custom', path: ['readDeadlineAt'], message: '读取期限无效' });
    }
  });

/** 新消费信封独立保存原意图和deadline交换，不替换事件V3的固定时间合同。 */
export const marketSplitAcquisitionV3Schema = z
  .strictObject({
    version: z.literal('eastmoney-split-acquisition-v1'),
    intent: marketEventRequestV3Schema,
    clock: marketSplitAcquisitionClockV3Schema,
    exchange: marketEventExchangeV3Schema,
    admissionSnapshots: z.strictObject({ before: marketEventAdmissionV3Schema, after: marketEventAdmissionV3Schema }),
  })
  .superRefine(({ intent, clock, exchange, admissionSnapshots }, ctx) => {
    const { request, response } = exchange;
    if (intent.routeKey.kind !== 'data' || intent.routeKey.market !== 'CN'
      || intent.routeKey.assetType !== 'ETF' || intent.routeKey.capability !== 'SPLIT_EVENT'
      || intent.routeTarget.providerId !== 'akshare' || intent.routeTarget.upstreamSource !== 'eastmoney')
      ctx.addIssue({ code: 'custom', path: ['intent'], message: '采集信封仅用于原东财ETF映射拆分' });
    for (const key of Object.keys(marketEventRequestV3Schema.shape) as (keyof typeof intent)[]) {
      if (key === 'dataAsOf') continue;
      if (JSON.stringify(intent[key]) !== JSON.stringify(request[key]))
        ctx.addIssue({ code: 'custom', path: ['exchange', 'request', key], message: '取得请求未匹配原意图' });
    }
    if (request.dataAsOf !== clock.readDeadlineAt)
      ctx.addIssue({ code: 'custom', path: ['exchange', 'request', 'dataAsOf'], message: '原获取截止未匹配期限' });
    requireOrder(intent.dataAsOf, clock.startedAt, ['intent', 'dataAsOf'], ctx);
    requireOrder(clock.startedAt, response.fetchedAt, ['exchange', 'response', 'fetchedAt'], ctx);
    requireOrder(response.fetchedAt, clock.completedAt, ['exchange', 'response', 'fetchedAt'], ctx);
    const admission = response.admission;
    for (const phase of ['before', 'after'] as const) {
      if (JSON.stringify(admissionSnapshots[phase]) !== JSON.stringify(admission))
        ctx.addIssue({ code: 'custom', path: ['admissionSnapshots', phase], message: '采集前后准入记录与真实响应不一致' });
    }
    if (!hasOriginalSplitProof(response))
      ctx.addIssue({ code: 'custom', path: ['exchange', 'response', 'admission'], message: '拆分采集缺少原映射准入' });
    if (admission) {
      requireOrder(admission.validFrom, clock.startedAt, ['clock', 'startedAt'], ctx);
      requireOrder(admission.recordedAt, clock.startedAt, ['clock', 'startedAt'], ctx);
      requireOrder(clock.completedAt, admission.validUntil, ['clock', 'completedAt'], ctx, true);
    }
    if (response.coverage.complete || response.coverage.reason !== 'historical_coverage_unverified')
      ctx.addIssue({ code: 'custom', path: ['exchange', 'response', 'coverage'], message: '拆分采集保持原未知覆盖' });
    response.facts.forEach((fact, index) => {
      requireOrder(clock.startedAt, fact.availableAt, ['exchange', 'response', 'facts', index], ctx);
      requireOrder(fact.availableAt, response.fetchedAt, ['exchange', 'response', 'facts', index], ctx);
    });
  });

export type MarketSplitAcquisitionV3 = z.infer<typeof marketSplitAcquisitionV3Schema>;
export type MarketSplitAcquisitionClockV3 = z.infer<typeof marketSplitAcquisitionClockV3Schema>;
