import { ZodError } from 'zod';
import {
  backtestNavPreparationResultV3Schema,
  type BacktestNavPreparationDiagnosticV3,
} from '@thesis-ledger/schemas';
import { DsaError } from '../integration/dsa/dsa.client.js';
import { DsaV3ProtocolError, type DsaV3ErrorCode } from '../integration/dsa/dsa-v3-protocol.js';
import { NavInputPlanError } from './backtest-nav-planning-calendar.js';
import { SnapshotIntegrityError } from './backtest-snapshot.js';
import type { NavRunPreparationV3 } from './backtest-nav-preparation.js';

export class NavPreparationStaleError extends Error {}
const sourceCodes: Record<DsaV3ErrorCode, BacktestNavPreparationDiagnosticV3['code']> = {
  timeout: 'SOURCE_TIMEOUT',
  unavailable: 'SOURCE_UNAVAILABLE',
  unauthorized: 'SOURCE_UNAUTHORIZED',
  'invalid-response': 'SOURCE_INVALID_RESPONSE',
  'unsupported-capability': 'SOURCE_UNSUPPORTED',
  'insufficient-coverage': 'DATA_UNAVAILABLE',
  'control-rejected': 'SOURCE_NOT_ADMITTED',
  'stale-revision': 'PREPARATION_STALE',
};
const messages: Record<BacktestNavPreparationDiagnosticV3['code'], string> = {
  DATA_UNAVAILABLE: '净值、日期或模型未满足完整输入要求',
  PREPARATION_STALE: '策略或路由已变化，请重新准备',
  SOURCE_TIMEOUT: '净值来源读取超时',
  SOURCE_UNAVAILABLE: '净值来源暂不可用',
  SOURCE_UNAUTHORIZED: '净值来源鉴权未通过',
  SOURCE_INVALID_RESPONSE: '净值来源证据未通过核验',
  SOURCE_UNSUPPORTED: '所选净值来源或模式尚未支持',
  SOURCE_NOT_ADMITTED: '净值路由未就绪或准入已失效',
};
export function navPreparationDiagnostic(
  error: unknown,
): BacktestNavPreparationDiagnosticV3 | null {
  let code: BacktestNavPreparationDiagnosticV3['code'];
  if (error instanceof NavPreparationStaleError) code = 'PREPARATION_STALE';
  else if (error instanceof NavInputPlanError) code = 'DATA_UNAVAILABLE';
  else if (error instanceof SnapshotIntegrityError || error instanceof ZodError)
    code = 'SOURCE_INVALID_RESPONSE';
  else if (error instanceof DsaError || error instanceof DsaV3ProtocolError)
    code = sourceCodes[error.code];
  else return null;
  return { code, severity: 'error', message: messages[code] };
}

export function publicNavPreparationResult(prepared: NavRunPreparationV3) {
  const plan = prepared.plan;
  const response = prepared.selection.response;
  return backtestNavPreparationResultV3Schema.parse({
    contractVersion: 3,
    status: 'prepared',
    scope: 'nav-input-plan',
    requestId: prepared.requestId,
    checkedAt: prepared.binding.checkedAt,
    binding: prepared.binding,
    runConfig: prepared.runConfig,
    inputPlanSummary: {
      version: plan.version,
      runWindow: plan.runWindow,
      navRange: plan.navRange,
      requiredCalendarRange: plan.requiredCalendarRange,
      warmupPeriods: plan.warmup.lookbackPeriods,
      tailTradingDays: plan.periodEnd.tailTradingDays,
      disclosureTailWorkdays: plan.visibility.disclosureTailWorkdays,
      expectedValuationDates: plan.expectedValuationDates,
      priceInputs: plan.priceInputs,
    },
    actualSource: {
      routeKey: response.routeKey,
      routeTarget: response.routeTarget,
      desiredRevision: response.desiredRevision,
      effectivePolicyRevision: response.effectivePolicyRevision,
      catalogRevision: response.catalogRevision,
      source: response.source,
      admission: response.admission,
    },
  });
}
