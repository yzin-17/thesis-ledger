import {
  createBaselineObservationBatchCommandSchema,
  type InstrumentSearchResult,
} from '@thesis-ledger/schemas';
import { ledgerInputTime } from '../accounts/ledger-input-time';

export type BaselineForm = {
  instrument: InstrumentSearchResult | null;
  quantity: string;
  cost: string;
  currency: string;
  observedAt: string;
  costIncludesFees: 'UNKNOWN' | 'INCLUDES_FEES' | 'EXCLUDES_FEES';
};
function baselineContent(form: BaselineForm) {
  if (!form.instrument || !form.observedAt.trim())
    throw new Error('请确认目录标的，并填写实际观察日期或 ISO 时间。');
  return {
    observedAt: ledgerInputTime(
      form.observedAt,
      form.observedAt.trim().length === 10 ? 'DATE' : 'INSTANT',
    ),
    observations: [
      {
        symbol: form.instrument.symbol,
        quantity: form.quantity.trim(),
        ...(form.cost.trim() ? { averageCost: form.cost.trim() } : {}),
        currency: form.currency,
        costIncludesFees: form.costIncludesFees,
      },
    ],
  };
}
export function baselineFingerprint(form: BaselineForm) {
  return JSON.stringify(baselineContent(form));
}
export async function buildBaselineCommand(
  form: BaselineForm,
  context: { accountId: string; id: string; capturedAt: string; sourceTimezone: string },
  digest: (value: string) => Promise<string>,
) {
  const content = baselineContent(form);
  return createBaselineObservationBatchCommandSchema.parse({
    command: 'CREATE_BASELINE_OBSERVATION_BATCH',
    batchId: context.id,
    accountId: context.accountId,
    scope: 'PARTIAL',
    ...content,
    timePrecision: content.observedAt.length === 10 ? 'DATE' : 'INSTANT',
    capturedAt: context.capturedAt,
    sourceTimezone: context.sourceTimezone,
    source: { category: 'MANUAL', channel: 'mobile-account-data', externalId: context.id },
    actorId: 'mobile-user',
    evidenceRef: `mobile-manual:${context.id}`,
    contentHash: await digest(baselineFingerprint(form)),
  });
}
