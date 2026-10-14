/** 独立功能的稳定身份；政策仅依赖身份，不依赖结果 Schema。 */
export const statusCapabilityNamesV1 = [
  'DAILY_TRADING_STATUS', 'RISK_WARNING', 'DAILY_PRICE_RULE', 'SECURITY_BASIC_DATES', 'LISTING_PHASE',
] as const;
export type StatusCapabilityNameV1 = (typeof statusCapabilityNamesV1)[number];
export function isStatusCapabilityNameV1(value: string): value is StatusCapabilityNameV1 {
  return statusCapabilityNamesV1.some((name) => name === value);
}
