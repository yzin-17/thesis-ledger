import { z } from 'zod';
import {
  dailyTradingStatusRequestV1Schema,
  riskWarningRequestV1Schema,
  dailyPriceRuleRequestV1Schema,
  securityBasicDatesRequestV1Schema,
  listingPhaseRequestV1Schema,
  statusCapabilityRequestV1Schema,
  statusCapabilityResultV1Schema,
  correlateStatusCapabilityV1,
} from './market-status-capabilities-v1.js';
import { statusCapabilityNamesV1 } from './market-status-capability-id.js';
import { effectiveProviderPolicyV3Schema } from './market-route-v3.js';

function unpin<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const { routeTarget, policyRevision, ...fields } = schema.shape;
  void routeTarget;
  void policyRevision;
  return z.strictObject(fields);
}
export const statusCapabilityQueryV1Schema = z
  .union([
    unpin(dailyTradingStatusRequestV1Schema),
    unpin(riskWarningRequestV1Schema),
    unpin(dailyPriceRuleRequestV1Schema),
    unpin(securityBasicDatesRequestV1Schema),
    unpin(listingPhaseRequestV1Schema),
  ])
  .superRefine((query, context) => {
    const suffix = query.symbol.split('.').at(-1);
    const market = suffix === 'HK' || suffix === 'US' ? suffix : 'CN';
    if (market !== query.routeKey.market)
      context.addIssue({ code: 'custom', message: '组合证券与市场不符' });
  });
export type StatusCapabilityQueryV1 = z.infer<typeof statusCapabilityQueryV1Schema>;
const requirement = z.enum(['optional', 'completeWindow', 'ipoDate', 'outDate', 'basicDates']);
export const statusCompositionDemandV1Schema = z
  .strictObject({ query: statusCapabilityQueryV1Schema, requirement })
  .superRefine((value, context) => {
    const dates = value.query.routeKey.capability === 'SECURITY_BASIC_DATES';
    if (value.requirement !== 'optional' && dates !== (value.requirement !== 'completeWindow'))
      context.addIssue({ code: 'custom', message: '必需字段必须符合本能力语义' });
  });
export type StatusCompositionDemandV1 = z.infer<typeof statusCompositionDemandV1Schema>;
const sourceError = z.enum([
  'timeout',
  'unavailable',
  'unsupported-capability',
  'insufficient-coverage',
  'source-symbol-unrecognized',
  'permission-denied',
  'source-authentication-failed',
]);
const entry = z.discriminatedUnion('status', [
  statusCompositionDemandV1Schema.safeExtend({
    status: z.literal('included'),
    request: statusCapabilityRequestV1Schema,
    result: statusCapabilityResultV1Schema,
  }),
  statusCompositionDemandV1Schema.safeExtend({ status: z.literal('failed'), error: sourceError }),
]);
export type StatusCompositionEntryV1 = z.infer<typeof entry>;
const capability = z.enum(statusCapabilityNamesV1);
export const statusCompositionConflictV1Schema = z.strictObject({
  date: z.iso.date(),
  field: z.literal('exchangeTradeEligibility'),
  capabilities: z.tuple([capability, capability]),
});

/** 只比较明确事实；基础日期不是价格覆盖，也不是最后交易日。 */
export function evaluateStatusCompositionV1(entries: readonly StatusCompositionEntryV1[]) {
  const included = entries.filter((item) => item.status === 'included').map((item) => item.result);
  const trading = included.find(
    (item) =>
      item.routeKey.capability === 'DAILY_TRADING_STATUS' &&
      'days' in item &&
      'state' in (item.days[0] ?? {}),
  );
  const phase = included.find((item) => item.routeKey.capability === 'LISTING_PHASE');
  const dates = included.find((item) => 'dates' in item);
  const conflicts: z.infer<typeof statusCompositionConflictV1Schema>[] = [];
  if (trading && 'days' in trading)
    for (const day of trading.days) {
      if (!('state' in day) || day.state !== 'trading') continue;
      const phaseDay =
        phase && 'days' in phase ? phase.days.find((item) => item.date === day.date) : undefined;
      if (phaseDay && 'phase' in phaseDay && ['notListed', 'delisted'].includes(phaseDay.phase))
        conflicts.push({
          date: day.date,
          field: 'exchangeTradeEligibility',
          capabilities: ['DAILY_TRADING_STATUS', 'LISTING_PHASE'],
        });
      if (
        dates &&
        'dates' in dates &&
        ((dates.dates.ipoDateStatus === 'known' && day.date < dates.dates.ipoDate!) ||
          (dates.dates.outDateStatus === 'known' && day.date >= dates.dates.outDate!))
      )
        conflicts.push({
          date: day.date,
          field: 'exchangeTradeEligibility',
          capabilities: ['DAILY_TRADING_STATUS', 'SECURITY_BASIC_DATES'],
        });
    }
  const blocked = entries
    .filter((item) => {
      if (item.requirement === 'optional') return false;
      if (
        item.status === 'failed' ||
        conflicts.some((value) => value.capabilities.includes(item.query.routeKey.capability))
      )
        return true;
      const result = item.result;
      if (item.requirement === 'completeWindow')
        return !('coverage' in result) || !result.coverage.complete;
      if (!('dates' in result)) return true;
      if (item.requirement === 'ipoDate') return result.dates.ipoDateStatus !== 'known';
      if (item.requirement === 'outDate') return result.dates.outDateStatus !== 'known';
      return result.dates.ipoDateStatus !== 'known' || result.dates.outDateStatus !== 'known';
    })
    .map((item) => item.query.routeKey.capability);
  const suspendedDates =
    trading && 'days' in trading
      ? trading.days
          .filter((day) => 'state' in day && day.state === 'suspended')
          .map((day) => day.date)
      : [];
  return { blockedCapabilities: blocked, conflicts, suspendedDates };
}
export const marketStatusCompositionV1Schema = z
  .strictObject({
    version: z.literal('market-status-composition-v1'),
    policy: effectiveProviderPolicyV3Schema,
    entries: z.array(entry).min(1).max(5),
  })
  .superRefine((value, context) => {
    const first = value.entries[0]!.query;
    const seen = new Set<string>();
    const windows = value.entries.flatMap((item) =>
      'range' in item.query ? [JSON.stringify(item.query.range)] : [],
    );
    if (!value.policy.enabled || new Set(windows).size > 1)
      context.addIssue({ code: 'custom', message: '组合政策关闭或窗口不一致' });
    for (const item of value.entries) {
      const query = item.query;
      if (
        query.symbol !== first.symbol ||
        query.routeKey.market !== first.routeKey.market ||
        seen.has(query.routeKey.capability)
      )
        context.addIssue({ code: 'custom', message: '组合能力重复或身份不一致' });
      seen.add(query.routeKey.capability);
      const route = value.policy.routes.find(
        (route) => JSON.stringify(route.key) === JSON.stringify(query.routeKey),
      );
      if (!route || route.enabled !== true)
        context.addIssue({ code: 'custom', message: '未启用功能不能纳入组合' });
      if (item.status === 'included') {
        try {
          correlateStatusCapabilityV1(item.request, item.result);
          const { routeTarget, policyRevision, ...unpinned } = item.request;
          if (
            JSON.stringify(unpinned) !== JSON.stringify(query) ||
            policyRevision !== value.policy.revision ||
            !route?.targets.some(
              (target) =>
                target.eligible &&
                target.routeIndex === routeTarget.routeIndex &&
                target.providerId === routeTarget.providerId &&
                target.upstreamSource === routeTarget.upstreamSource,
            )
          )
            throw new Error();
        } catch {
          context.addIssue({ code: 'custom', message: '独立请求/结果与组合政策不符' });
        }
      }
    }
  });
export type MarketStatusCompositionV1 = z.infer<typeof marketStatusCompositionV1Schema>;
