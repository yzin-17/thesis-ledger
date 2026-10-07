import { createHash } from 'node:crypto';
import { marketEventResponseV3Schema, type MarketEventResponseV3 } from '@thesis-ledger/schemas';
import { tushareEventFixture, tushareIdentityBundle } from './tushare-event-fixtures.js';

/** 离线合成转换，只供协议与冻结回归，绝非真实来源准入。 */
export function hithinkEventFixture() {
  const { request, response } = tushareEventFixture();
  const original = tushareIdentityBundle(response);
  const bundle = {
    contractVersion: 1,
    kind: 'hithink-fund-identity',
    mappings: original.mappings.map((item) => ({
      symbol: item.symbol,
      instrumentType: item.instrumentType,
      queryThscode: item.queryFundCode,
      fundType: 'exchange',
      scopeDateFrom: item.scopeDateFrom,
      scopeDateTo: item.scopeDateTo,
      observedAt: item.observedAt,
      identityEvidence: item.identityEvidence,
      dividendCurrencyEvidence: item.dividendCurrencyEvidence,
    })),
  };
  const content = JSON.stringify(bundle, null, 2) + '\n';
  const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
  const target = { providerId: 'hithink', upstreamSource: 'fund-corporate-actions-dividends' };
  Object.assign(request.routeTarget, target);
  Object.assign(response.routeTarget, target);
  Object.assign(response.admission!.target, target);
  response.admission!.adapterRevision = 'dsa-hithink-fund-dividend-v1';
  response.admission!.sourceRevision = 'hithink-fund-dividends-single-response-v1';
  response.admission!.credentialRevision = `hmac-sha256-v1:${'d'.repeat(64)}`;
  response.admission!.evidenceRef = `sha256:${sha256}`;
  response.admission!.evidenceSha256 = sha256;
  delete response.tushareIdentityEvidence;
  response.hithinkIdentityEvidence = { ref: `sha256:${sha256}`, sha256, content };
  response.providerRevision = `hithink-fund-dividends-content-v1:${'c'.repeat(64)}`;
  for (const fact of response.facts) {
    fact.provider = 'hithink';
    fact.providerRevision = response.providerRevision;
  }
  return { request, response: marketEventResponseV3Schema.parse(response) };
}

export function rebindHithinkIdentityContent(response: MarketEventResponseV3, content: string) {
  const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
  response.hithinkIdentityEvidence = { ref: `sha256:${sha256}`, sha256, content };
  response.admission!.evidenceRef = `sha256:${sha256}`;
  response.admission!.evidenceSha256 = sha256;
  if (response.coverage.complete)
    response.coverage.admissionEvidenceRef = response.admission!.evidenceRef;
}
