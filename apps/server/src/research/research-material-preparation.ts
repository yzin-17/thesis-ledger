import {
  type researchScopeInstrumentsV2,
  researchScopeSnapshotV2Schema,
  type ResearchFrozenEvidenceV2,
  type ResearchScopeSnapshotV2,
} from '@thesis-ledger/schemas';
import type { ResearchPreparedContext } from './research-preparation-contract.js';
import { privateResearchEvidence } from './research-private-evidence.js';
import { missingResearchEvidence } from './research-public-evidence.js';

export type ResearchPublicMaterial = {
  instrument: ReturnType<typeof researchScopeInstrumentsV2>[number];
  evidence: ResearchFrozenEvidenceV2[];
};

/** 范围身份中的价格币种来自实际材料；缺资格的身份不进入私人报告的价格断言集合。 */
export function finalizeResearchMaterials(
  context: ResearchPreparedContext,
  reads: ResearchPublicMaterial[],
  newsRequired: boolean,
) {
  const original = context.scopeSnapshot;
  let scopeSnapshot: ResearchScopeSnapshotV2;
  const qualified = reads.filter((read) =>
    read.evidence.some((entry) => entry.audit.kind === 'quote' && entry.usable),
  );
  if (original.scope === 'instrument' || original.scope === 'position')
    scopeSnapshot = { ...original, instrument: reads[0]?.instrument ?? original.instrument };
  else scopeSnapshot = { ...original, instruments: qualified.map((read) => read.instrument) };
  const evidence = reads.flatMap((read) => read.evidence);
  if (context.privateMaterial) {
    const material = structuredClone(context.privateMaterial);
    const missing = reads
      .filter((read) => !qualified.includes(read))
      .map((read) => read.instrument.symbol);
    material.unresolvedSymbols = [...new Set([...material.unresolvedSymbols, ...missing])].sort();
    const reasons = [
      ...context.reasons,
      ...missing.map((symbol) => `instrument_price_unqualified:${symbol}`),
    ];
    if (material.version === 'research-portfolio-material-v2') {
      for (const position of material.positions) {
        const quote = qualified.find((read) => read.instrument.symbol === position.symbol);
        if (position.currency && quote && position.currency !== quote.instrument.currency)
          reasons.push(`position_cost_quote_currency_differs:${position.symbol}`);
      }
    }
    evidence.unshift(privateResearchEvidence(material, context.fetchedAt, reasons));
  }
  if (newsRequired && reads.length === 0)
    evidence.push(missingResearchEvidence('news', true, 'news_required_instrument_unresolved'));
  return { scopeSnapshot: researchScopeSnapshotV2Schema.parse(scopeSnapshot), evidence };
}
