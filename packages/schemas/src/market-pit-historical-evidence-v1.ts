import { z } from 'zod';
import {
  indexCalendarTradingDates,
  validateCalendarStructure,
} from './market-pit-calendar-structure-v1.js';
import { validateHistoricalBarBindings } from './market-pit-historical-bar-bindings-v1.js';
import {
  indexHistoricalEvidence,
  validateOriginalEvidence,
  validateCalendarArtifacts,
  validateCalendarReferences,
  validatePublicationReferences,
  validateSourceWitnesses,
} from './market-pit-historical-references-v1.js';

export const MARKET_PIT_RECONSTRUCTION_MAX_BYTES = 32 * 1024 * 1024;
export const MARKET_PIT_HISTORICAL_MAX_DATES = 100_000;
export const MARKET_PIT_HISTORICAL_MAX_BARS = 100_000;
export const MARKET_PIT_HISTORICAL_MAX_RECORDS = 1_024;
export const MARKET_PIT_HISTORICAL_MAX_RAW_BYTES = 8 * 1024 * 1024;

const text = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value, '文本不得含首尾空白');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.iso.date();
const instant = z.iso.datetime({ offset: true });
const ids = z.array(text).min(1).max(MARKET_PIT_HISTORICAL_MAX_RECORDS);
const records = <T extends z.ZodType>(schema: T) =>
  z.array(schema).max(MARKET_PIT_HISTORICAL_MAX_RECORDS);
const rawText = z.string().min(1).max(MARKET_PIT_HISTORICAL_MAX_RAW_BYTES);
const base64 = z
  .string()
  .max(MARKET_PIT_HISTORICAL_MAX_RAW_BYTES)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const timezone = text.refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, '需要有效 IANA 时区');
const session = z.strictObject({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  openedAt: instant,
  closedAt: instant,
});
const calendar = z.strictObject({
  id: text,
  calendarContentHash: digest,
  projectionHash: digest,
  market: z.enum(['CN', 'HK', 'US']),
  exchange: text,
  timezone,
  symbolScope: z.array(text).min(1).max(10_000),
  venueBindingEvidenceIds: ids,
  historicalRange: z.strictObject({ start: date, end: date }),
  knownAvailableAt: instant,
  acquiredAt: instant,
  normalizationVersion: text,
  timezoneRulesIdentity: text,
  dateStates: z
    .array(
      z.strictObject({
        date,
        status: z.enum(['open', 'closed']),
        reason: z.enum(['regular', 'weekend', 'exchange-holiday', 'special-session']),
        publicationIds: ids,
        sessions: z.array(session).max(16),
      }),
    )
    .min(1)
    .max(MARKET_PIT_HISTORICAL_MAX_DATES),
  publicationIds: ids,
  calendarArtifactId: text.optional(),
});
const originalEvidence = z.strictObject({
  id: text,
  kind: z.enum(['exchange-publication', 'calendar-package-release', 'server-archive-capture']),
  publisher: text,
  originUri: z.string().url().max(2_048),
  revision: text,
  parserVersion: text,
  raw: z.strictObject({ encoding: z.enum(['utf8', 'base64']), bytes: rawText, sha256: digest }),
  publicationLocator: z.string().min(1).max(2_048),
  knownAvailableAt: instant,
  acquiredAt: instant,
});
const artifact = z.strictObject({
  id: text,
  version: text,
  artifactSha256: digest,
  sourceTreeHash: digest,
  publicationId: text,
  files: records(
    z.strictObject({
      relativePath: z
        .string()
        .min(1)
        .max(1_024)
        .refine(
          (value) =>
            !value.startsWith('/') &&
            !value.includes('\\') &&
            !value.split('/').some((part) => part === '..' || part === '.' || !part),
          '文件路径须为规范相对路径',
        ),
      rawBase64: base64,
      sha256: digest,
    }),
  ).min(1),
});
const witness = z.strictObject({
  id: text,
  windowIdentityFingerprint: digest,
  completeResponseHash: digest,
  captureEvidenceId: text,
  revisionPublicationIds: ids,
  revisionKnownAvailableAt: instant,
});
const binding = z.strictObject({
  timestamp: instant,
  windowIdentityFingerprint: digest,
  completeResponseHash: digest,
  calendarEvidenceId: text,
  sourceWitnessId: text,
  tradingDate: date,
  decisionAt: instant,
  closedAt: instant,
  nextTradingDate: date,
  nextOpenedAt: instant,
});

/** 展开日期或解析记录前检查；只验证结构，不验证原文摘要或历史真实性。 */
export const marketPitEvidenceWithinLimits = (value: unknown): boolean => {
  try {
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
      MARKET_PIT_RECONSTRUCTION_MAX_BYTES
    )
      return false;
    if (typeof value !== 'object' || value === null) return true;
    const object = value as Record<string, unknown>;
    for (const key of ['barArchives', 'barDecisionBindings']) {
      if (Array.isArray(object[key]) && object[key].length > MARKET_PIT_HISTORICAL_MAX_BARS)
        return false;
    }
    if (Array.isArray(object.calendars)) {
      let total = 0;
      for (const item of object.calendars) {
        if (typeof item !== 'object' || item === null) continue;
        const entry = item as Record<string, unknown>;
        if (Array.isArray(entry.dateStates)) total += entry.dateStates.length;
        const range = entry.historicalRange as Record<string, unknown> | undefined;
        if (range && typeof range.start === 'string' && typeof range.end === 'string') {
          const days = (Date.parse(range.end) - Date.parse(range.start)) / 86_400_000 + 1;
          if (days > MARKET_PIT_HISTORICAL_MAX_DATES) return false;
        }
        if (total > MARKET_PIT_HISTORICAL_MAX_DATES) return false;
      }
    }
    return (
      !object.historicalDecisionWindow ||
      marketPitEvidenceWithinLimits(object.historicalDecisionWindow)
    );
  } catch {
    return false;
  }
};
export const boundMarketPitEvidenceStructureV3 = (value: unknown, context: z.RefinementCtx) => {
  if (!marketPitEvidenceWithinLimits(value)) {
    context.addIssue({ code: 'custom', message: '历史证据超过文件、Bar 或日期展开上限' });
    return z.NEVER;
  }
  return value;
};

const historicalDecisionWindowFields = z.strictObject({
  contractVersion: z.literal(1),
  kind: z.literal('market-pit-historical-decision-window'),
  calendars: records(calendar).min(1),
  originalEvidence: records(originalEvidence).min(1),
  calendarArtifacts: records(artifact),
  sourceWitnesses: records(witness).min(1),
  barDecisionBindings: z.array(binding).min(1).max(MARKET_PIT_HISTORICAL_MAX_BARS),
});
export type HistoricalDecisionWindowV3 = z.infer<typeof historicalDecisionWindowFields>;

export const marketPitHistoricalDecisionWindowV3Schema = z.preprocess(
  boundMarketPitEvidenceStructureV3,
  historicalDecisionWindowFields.superRefine((value, context) => {
    const references = indexHistoricalEvidence(value, context);
    validateOriginalEvidence(value, references, base64, MARKET_PIT_HISTORICAL_MAX_RAW_BYTES);
    validateCalendarArtifacts(value, references);
    for (const item of value.calendars) {
      validateCalendarReferences(item, references);
      validateCalendarStructure(item, references.fail, (ids) =>
        validatePublicationReferences(ids, references),
      );
    }
    validateSourceWitnesses(value, references);
    validateHistoricalBarBindings(value, references, indexCalendarTradingDates(value.calendars));
  }),
);
