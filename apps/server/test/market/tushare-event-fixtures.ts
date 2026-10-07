import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  marketEventRequestV3Schema,
  marketEventResponseV3Schema,
  parseMarketTushareFundIdentityV3,
  type MarketEventResponseV3,
} from '@thesis-ledger/schemas';

export function tushareEventFixture() {
  const golden = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/market-tushare-identity-v3.synthetic.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  return {
    request: marketEventRequestV3Schema.parse(golden.request),
    response: marketEventResponseV3Schema.parse(golden.response),
  };
}

export function tushareIdentityBundle(response: MarketEventResponseV3) {
  return parseMarketTushareFundIdentityV3(response.tushareIdentityEvidence!.content);
}

export function rebindTushareIdentityContent(response: MarketEventResponseV3, content: string) {
  const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
  response.tushareIdentityEvidence = { content, sha256, ref: `sha256:${sha256}` };
  response.admission!.evidenceRef = `sha256:${sha256}`;
  response.admission!.evidenceSha256 = sha256;
  if (response.coverage.complete)
    response.coverage.admissionEvidenceRef = response.admission!.evidenceRef;
}
