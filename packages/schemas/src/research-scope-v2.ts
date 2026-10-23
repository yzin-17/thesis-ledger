import { z } from 'zod';
import { isNewsInstrumentV3 } from './market-news-v3-primitives.js';
import { marketNewsRequestV3Schema } from './market-news-v3.js';
import { currencySchema } from './market.js';

const label = z.string().trim().min(1).max(256);
export const researchCurrencyV2Schema = currencySchema;
export const researchInstrumentV2Schema = z
  .strictObject({
    ...marketNewsRequestV3Schema.shape.instrument.shape,
    instrumentId: z.uuid(),
    currency: researchCurrencyV2Schema,
    catalogGeneration: z.number().int().nonnegative(),
  })
  .refine(isNewsInstrumentV3, '研究标的必须为规范市场身份');

export const researchScopeSelectionV2Schema = z.discriminatedUnion('scope', [
  z.strictObject({ scope: z.literal('instrument'), instrumentId: z.uuid() }),
  z.strictObject({ scope: z.literal('portfolio'), portfolioId: label.optional() }),
  z.strictObject({ scope: z.literal('account'), accountId: z.uuid() }),
  z.strictObject({ scope: z.literal('position'), accountId: z.uuid(), symbol: label }),
  z.strictObject({ scope: z.literal('strategy'), strategyVersionId: z.uuid() }),
]);
export const researchSubmissionV2Schema = z.strictObject({
  version: z.literal(2),
  submissionId: z.uuid(),
  mode: z.enum(['actual', 'shadow']),
  scope: researchScopeSelectionV2Schema,
  question: z.string().trim().min(1).max(2000),
  templateId: z
    .enum(['primary-risks', 'recent-changes', 'counter-evidence', 'stress-scenario'])
    .optional(),
  researchSettingsRevision: z.string().trim().min(1).max(120),
});
const base = {
  version: z.literal('research-scope-v2'),
  mode: z.enum(['actual', 'shadow']),
  confirmedAt: z.iso.datetime({ offset: true }),
};
const instruments = z
  .array(researchInstrumentV2Schema)
  .max(1000)
  .refine(
    (values) =>
      new Set(values.map((value) => value.instrumentId)).size === values.length &&
      new Set(values.map((value) => `${value.market}:${value.assetType}:${value.symbol}`)).size ===
        values.length,
    '研究标的身份或规范代码重复',
  );
export const researchScopeSnapshotV2Schema = z.discriminatedUnion('scope', [
  z.strictObject({
    ...base,
    scope: z.literal('instrument'),
    instrument: researchInstrumentV2Schema,
  }),
  z.strictObject({
    ...base,
    scope: z.literal('portfolio'),
    portfolioId: label.nullable(),
    accountIds: z
      .array(z.uuid())
      .max(1000)
      .refine((ids) => new Set(ids).size === ids.length),
    instruments,
  }),
  z.strictObject({ ...base, scope: z.literal('account'), accountId: z.uuid(), instruments }),
  z.strictObject({
    ...base,
    scope: z.literal('position'),
    accountId: z.uuid(),
    instrument: researchInstrumentV2Schema,
  }),
  z.strictObject({
    ...base,
    scope: z.literal('strategy'),
    strategyVersionId: z.uuid(),
    instruments,
  }),
]);
export const researchHistoricalScopeV2Schema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('known'), snapshot: researchScopeSnapshotV2Schema }),
  z.strictObject({
    status: z.literal('unrecorded'),
    snapshot: z.null(),
    label: z.literal('历史范围未记录'),
  }),
]);
export type ResearchScopeSnapshotV2 = z.infer<typeof researchScopeSnapshotV2Schema>;
export type ResearchSubmissionV2 = z.infer<typeof researchSubmissionV2Schema>;

/** 调用方与服务端共用规范输入，大小写不会改变找回或范围关联。 */
export function normalizeResearchSubmissionV2(value: unknown): ResearchSubmissionV2 {
  const input = researchSubmissionV2Schema.parse(value);
  input.submissionId = input.submissionId.toLowerCase();
  const scope = input.scope;
  if (scope.scope === 'instrument') scope.instrumentId = scope.instrumentId.toLowerCase();
  else if (scope.scope === 'account') scope.accountId = scope.accountId.toLowerCase();
  else if (scope.scope === 'position') {
    scope.accountId = scope.accountId.toLowerCase();
    scope.symbol = scope.symbol.toUpperCase();
  } else if (scope.scope === 'strategy')
    scope.strategyVersionId = scope.strategyVersionId.toLowerCase();
  return input;
}

export function researchScopeMatchesSubmissionV2(
  input: Pick<ResearchSubmissionV2, 'mode' | 'scope'>,
  snapshot: ResearchScopeSnapshotV2,
) {
  if (input.mode !== snapshot.mode) return false;
  const selected = input.scope;
  if (selected.scope === 'instrument' && snapshot.scope === 'instrument')
    return selected.instrumentId === snapshot.instrument.instrumentId;
  if (selected.scope === 'portfolio' && snapshot.scope === 'portfolio')
    return (selected.portfolioId ?? null) === snapshot.portfolioId;
  if (selected.scope === 'account' && snapshot.scope === 'account')
    return selected.accountId === snapshot.accountId;
  if (selected.scope === 'position' && snapshot.scope === 'position')
    return (
      selected.accountId === snapshot.accountId &&
      selected.symbol.toUpperCase() === snapshot.instrument.symbol
    );
  if (selected.scope === 'strategy' && snapshot.scope === 'strategy')
    return selected.strategyVersionId === snapshot.strategyVersionId;
  return false;
}

export function researchScopeInstrumentsV2(scope: ResearchScopeSnapshotV2) {
  if (scope.scope === 'instrument' || scope.scope === 'position') return [scope.instrument];
  return scope.instruments;
}
