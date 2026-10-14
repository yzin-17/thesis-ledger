import { createHash } from 'node:crypto';
import { DecimalValue } from '@thesis-ledger/domain';
import {
  isMarketNoticeDividendRouteV3,
  parseMarketNoticeDividendPackV3,
  compareMarketPitEvidenceInstantStringsV1,
  type MarketEventResponseV3,
} from '@thesis-ledger/schemas';

/** 在线和离线均从准入绑定的原字节重建现金事件，拒绝遗漏或额外事实。 */
export function verifyNoticeDividendsV3(response: MarketEventResponseV3): void {
  const evidence = response.noticeDividendEvidence;
  if (!isMarketNoticeDividendRouteV3(response) && !evidence) return;
  const admission = response.admission;
  if (
    !isMarketNoticeDividendRouteV3(response) ||
    !evidence ||
    !admission ||
    Buffer.byteLength(evidence.content, 'utf8') > 256 * 1024 ||
    createHash('sha256').update(evidence.content, 'utf8').digest('hex') !== evidence.sha256 ||
    evidence.ref !== `sha256:${evidence.sha256}` ||
    admission.evidenceRef !== evidence.ref ||
    admission.evidenceSha256 !== evidence.sha256
  )
    throw new Error('公告原文与准入摘要不匹配');
  const pack = parseMarketNoticeDividendPackV3(evidence.content);
  const revision = `official-cash-notices-sha256:${evidence.sha256}`;
  if (
    response.providerRevision !== revision ||
    admission.sourceRevision !== revision ||
    admission.adapterRevision !== 'official-cash-notices-v1' ||
    admission.credentialRevision !== 'not-required' ||
    pack.symbol !== response.symbol ||
    response.start < pack.coverage.start ||
    response.end > pack.coverage.end ||
    admission.scopeSymbols.some((symbol) => symbol !== pack.symbol) ||
    admission.scopeDateFrom < pack.coverage.start ||
    admission.scopeDateTo > pack.coverage.end ||
    !response.coverage.complete
  )
    throw new Error('公告来源修订或现金覆盖不匹配');
  const observed = pack.sourceDocuments
    .map((item) => item.observedAt)
    .reduce((latest, item) =>
      compareMarketPitEvidenceInstantStringsV1(latest, item) === -1 ? item : latest,
    );
  if (
    ![response.dataAsOf, response.fetchedAt, admission.recordedAt].every((value) => {
      const order = compareMarketPitEvidenceInstantStringsV1(observed, value);
      return order === -1 || order === 0;
    })
  )
    throw new Error('来源核验晚于冻结或准入');
  const expected = pack.events.filter(
    (item) => response.start <= item.effectiveDate && item.effectiveDate <= response.end,
  );
  if (response.facts.length !== expected.length) throw new Error('现金事件遗漏或额外');
  for (const item of expected) {
    const fact = response.facts.find((candidate) => candidate.effectiveDate === item.effectiveDate);
    if (
      !fact ||
      fact.symbol !== pack.symbol ||
      fact.market !== pack.market ||
      fact.instrumentType !== pack.instrumentType ||
      fact.type !== 'CASH_DIVIDEND' ||
      fact.currency !== pack.currency ||
      fact.ratio !== undefined ||
      fact.strategyVisibility !== undefined ||
      fact.provider !== response.routeTarget.providerId ||
      fact.providerRevision !== revision ||
      fact.recordDate !== item.recordDate ||
      fact.paymentDate !== item.paymentDate ||
      fact.occurredAt !== `${item.effectiveDate}T00:00:00+08:00` ||
      compareMarketPitEvidenceInstantStringsV1(fact.availableAt, observed) !== 0 ||
      fact.cashAmount !== DecimalValue.from(item.cashAmount).dividedBy('10').toString()
    )
      throw new Error('现金事件与公告原文不一致');
  }
}
