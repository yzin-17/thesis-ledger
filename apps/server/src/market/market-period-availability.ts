import { HttpException } from '@nestjs/common';
import { MarketPeriodWindowError } from './market-period-window.js';

/** 预算不足可降级，非法请求仍按 400 拒绝。 */
export function periodAvailabilityReason(error: unknown): string {
  if (error instanceof MarketPeriodWindowError) {
    if (error.code === 'window_invalid') throw error;
    return error.code;
  }
  if (!(error instanceof HttpException)) return 'service_unavailable';
  const response = error.getResponse();
  const reason =
    typeof response === 'object' &&
    response !== null &&
    'details' in response &&
    typeof response.details === 'object' &&
    response.details !== null &&
    'reason' in response.details
      ? response.details.reason
      : undefined;
  if (
    error.getStatus() === 400 &&
    !['calendar_input_limit', 'daily_input_limit', 'calculation_input_limit'].includes(
      String(reason),
    )
  )
    throw error;
  if (typeof reason === 'string') return reason;
  if (error.getStatus() === 422) return 'asset_unsupported';
  return 'service_unavailable';
}
