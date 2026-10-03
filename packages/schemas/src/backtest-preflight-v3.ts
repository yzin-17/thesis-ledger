import { z } from 'zod';
import { backtestErrorCodes, type BacktestErrorCode } from './backtest-contract.js';
import { marketRouteKeyV3Schema } from './market-route-v3.js';

const text = z.string().trim().min(1);
const isoDateTime = z.iso.datetime({ offset: true });

export * from './backtest-preflight-context-v3.js';
import {
  backtestPreflightPurposeV3Schema,
  backtestPreflightDateRangeV3Schema,
  backtestPreflightRevisionStampV3Schema,
  targetSourcesSchema,
} from './backtest-preflight-context-v3.js';

export const backtestPreflightDiagnosticCategoryV3Schema = z.enum([
  'input-invalid',
  'unsupported-adjustment',
  'incompatible-accounting',
  'incompatible-price-basis',
  'insufficient-coverage',
  'point-in-time-unavailable',
  'invalid-price-series',
  'auth-or-quota-unavailable',
  'rule-incompatible',
  'data-unavailable',
]);
export type BacktestPreflightDiagnosticCategoryV3 = z.infer<
  typeof backtestPreflightDiagnosticCategoryV3Schema
>;

export const backtestPreflightActionV3Schema = z.strictObject({
  action: z.enum([
    'correct-input',
    'select-supported-adjustment',
    'choose-compatible-accounting',
    'select-compatible-route',
    'repair-data-coverage',
    'provide-point-in-time-evidence',
    'repair-price-series',
    'configure-credentials-or-quota',
    'review-strategy-rules',
    'retry-preflight',
  ]),
  description: text,
});
export type BacktestPreflightActionV3 = z.infer<typeof backtestPreflightActionV3Schema>;

const codesByCategory: Record<BacktestPreflightDiagnosticCategoryV3, readonly BacktestErrorCode[]> =
  {
    'input-invalid': ['INVALID_SCHEMA', 'UNKNOWN_FIELD', 'INVALID_PARAMETER'],
    'unsupported-adjustment': ['UNSUPPORTED_CAPABILITY'],
    'incompatible-accounting': ['RULE_REJECTED', 'UNSUPPORTED_CAPABILITY'],
    'incompatible-price-basis': ['RULE_REJECTED', 'DATA_UNAVAILABLE'],
    'insufficient-coverage': ['DATA_UNAVAILABLE'],
    'point-in-time-unavailable': ['FUTURE_DATA', 'DATA_UNAVAILABLE'],
    'invalid-price-series': ['DATA_UNAVAILABLE', 'RULE_REJECTED'],
    'auth-or-quota-unavailable': ['DATA_UNAVAILABLE'],
    'rule-incompatible': ['RULE_REJECTED'],
    'data-unavailable': ['DATA_UNAVAILABLE'],
  };

export const backtestPreflightDiagnosticV3Schema = z
  .strictObject({
    severity: z.enum(['error', 'warning', 'info']),
    category: backtestPreflightDiagnosticCategoryV3Schema,
    code: z.enum(backtestErrorCodes),
    message: text,
    symbol: text.nullable(),
    capability: text.nullable(),
    purpose: backtestPreflightPurposeV3Schema.nullable(),
    dateRange: backtestPreflightDateRangeV3Schema.nullable(),
    routeKey: marketRouteKeyV3Schema.nullable(),
    missingFields: z.array(text),
    incompatibleRules: z.array(text),
    targetSources: targetSourcesSchema,
    suggestedActions: z.array(backtestPreflightActionV3Schema).min(1),
  })
  .superRefine((diagnostic, context) => {
    if (!codesByCategory[diagnostic.category].includes(diagnostic.code)) {
      context.addIssue({
        code: 'custom',
        path: ['code'],
        message: `错误码 ${diagnostic.code} 不适用于诊断类别 ${diagnostic.category}`,
      });
    }
    if (diagnostic.routeKey && diagnostic.routeKey.capability !== diagnostic.capability) {
      context.addIssue({
        code: 'custom',
        path: ['capability'],
        message: 'capability 必须与精确 RouteKey 一致',
      });
    }
  });
export type BacktestPreflightDiagnosticV3 = z.infer<typeof backtestPreflightDiagnosticV3Schema>;

const resultBase = {
  contractVersion: z.literal(3),
  requestId: text,
  checkedAt: isoDateTime,
};

const diagnostics = z.array(backtestPreflightDiagnosticV3Schema);

const readyResult = z
  .strictObject({
    ...resultBase,
    status: z.literal('ready'),
    revisionStamp: backtestPreflightRevisionStampV3Schema,
    diagnostics,
  })
  .superRefine((result, context) => {
    if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      context.addIssue({
        code: 'custom',
        path: ['diagnostics'],
        message: 'ready 结果不能包含 error 诊断',
      });
    }
    if (
      result.revisionStamp.desiredRevision === null ||
      result.revisionStamp.effectiveRevision === null ||
      result.revisionStamp.catalogRevision === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['revisionStamp'],
        message: 'ready 结果必须绑定 Desired、Effective 与 Catalog revision',
      });
    }
  });

const blockedResult = z
  .strictObject({
    ...resultBase,
    status: z.literal('blocked'),
    revisionStamp: backtestPreflightRevisionStampV3Schema,
    diagnostics: diagnostics.min(1),
  })
  .superRefine((result, context) => {
    if (!result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      context.addIssue({
        code: 'custom',
        path: ['diagnostics'],
        message: 'blocked 结果必须包含 error 诊断',
      });
    }
  });

const invalidInputResult = z
  .strictObject({
    ...resultBase,
    status: z.literal('invalid-input'),
    revisionStamp: z.null(),
    diagnostics: diagnostics.min(1),
  })
  .superRefine((result, context) => {
    if (
      result.diagnostics.some(
        (diagnostic) => diagnostic.severity !== 'error' || diagnostic.category !== 'input-invalid',
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['diagnostics'],
        message: 'invalid-input 结果只能包含 input-invalid error 诊断',
      });
    }
  });

export const backtestPreflightResultV3Schema = z.discriminatedUnion('status', [
  readyResult,
  blockedResult,
  invalidInputResult,
]);
export type BacktestPreflightResultV3 = z.infer<typeof backtestPreflightResultV3Schema>;
