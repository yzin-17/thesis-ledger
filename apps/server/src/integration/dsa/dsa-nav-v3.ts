import {
  backtestNavSourceRequestV3Schema,
  backtestNavSourceResponseV3Schema,
  type BacktestNavSourceRequestV3,
} from '@thesis-ledger/schemas';
import { navEnvelopeSchema } from './dsa-nav-envelope.js';
import { verifyNavPages } from './dsa-nav-source-pages.js';
import { verifyNavIdentity, verifyNavRule } from './dsa-nav-rule-proof.js';
import { verifyNavCalendar } from './dsa-nav-calendar-proof.js';
import { navEqual, navHash, navInvalid, navTimeBefore, parseNavRaw } from './dsa-nav-raw.js';
import { DsaV3ProtocolError, type DsaV3ErrorCode } from './dsa-v3-protocol.js';
import { z } from 'zod';

export function parseNavResponseV3(raw: unknown, input: BacktestNavSourceRequestV3) {
  try {
    const request = backtestNavSourceRequestV3Schema.parse(input);
    const response = backtestNavSourceResponseV3Schema.parse(raw);
    const fields = [
      'contractVersion',
      'requestId',
      'symbol',
      'routeKey',
      'routeTarget',
      'desiredRevision',
      'effectivePolicyRevision',
      'catalogRevision',
      'dataAsOf',
    ] as const;
    if (
      fields.some((key) => !navEqual(request[key], response[key])) ||
      request.visibilityMode !== 'research-assumption' ||
      Buffer.byteLength(response.responseRaw) > 64 * 1024 * 1024 ||
      response.source.responseHash !== navHash(response.responseRaw)
    )
      navInvalid();
    const envelope = navEnvelopeSchema.parse(parseNavRaw(response.responseRaw));
    if (
      envelope.symbol !== request.symbol ||
      envelope.navSource.fundCode !== request.symbol.slice(0, 6) ||
      envelope.capturedAt !== response.source.capturedAt ||
      response.source.providerRevision !== envelope.navSource.readerRevision
    )
      navInvalid();
    for (const field of [
      'ruleRaw',
      'calendarRaw',
      'assumptionRaw',
      'calendarDecisionRaw',
    ] as const) {
      if (envelope[field] !== response[field]) navInvalid();
    }
    if (
      request.calendarDecisionRaw !== response.calendarDecisionRaw ||
      envelope.records.length !== response.facts.length
    )
      navInvalid();
    for (const at of [
      envelope.identity.capturedAt,
      envelope.navSource.capturedAt,
      envelope.ruleDocument.capturedAt,
    ]) {
      navTimeBefore(at, response.source.capturedAt);
    }
    const dates = verifyNavPages(envelope);
    const asOfDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(request.dataAsOf));
    if (dates.some((day) => day > asOfDay)) navInvalid();
    response.facts.forEach((fact, index) => {
      const record = envelope.records[index];
      const publication = response.publicationRecords[index];
      if (
        !record ||
        !publication ||
        !navEqual(record, parseNavRaw(publication.rawRecord)) ||
        fact.publicationEvidence.rawRecordHash !== navHash(publication.rawRecord) ||
        record.sourceRecordId !== fact.publicationEvidence.sourceRecordId ||
        record.valuationDate !== fact.valuationDate ||
        record.nav !== fact.nav
      )
        navInvalid();
    });
    verifyNavIdentity(request, envelope);
    verifyNavRule(request, response, envelope);
    verifyNavCalendar(request, response, envelope, dates);
    return response;
  } catch (error) {
    if (error instanceof DsaV3ProtocolError) throw error;
    navInvalid();
  }
}

const codes: Record<string, DsaV3ErrorCode> = {
  invalid_request: 'control-rejected',
  not_adapted: 'unsupported-capability',
  not_admitted: 'control-rejected',
  policy_not_applied: 'stale-revision',
  publication_unavailable: 'unsupported-capability',
  identity_mismatch: 'invalid-response',
  future_evidence: 'invalid-response',
  rule_unavailable: 'unsupported-capability',
  insufficient_evidence: 'insufficient-coverage',
  invalid_response: 'invalid-response',
  upstream_failure: 'unavailable',
};
export function mapNavHttpError(status: number, payload: unknown, requestId: string) {
  if (status === 401 || status === 403)
    return new DsaV3ProtocolError('DSA 净值接口鉴权失败', 'unauthorized', status);
  if (status === 404 || status === 405)
    return new DsaV3ProtocolError('DSA 不支持精确净值接口', 'unsupported-capability', status);
  const parsed = z
    .strictObject({
      contractVersion: z.literal(3),
      requestId: z.literal(requestId),
      error: z.strictObject({
        code: z.enum(Object.keys(codes) as [string, ...string[]]),
        message: z.string(),
      }),
    })
    .safeParse(payload);
  if (!parsed.success)
    return new DsaV3ProtocolError('DSA 净值错误响应无效', 'invalid-response', status);
  return new DsaV3ProtocolError('DSA 净值证据不可用', codes[parsed.data.error.code]!, status);
}
