import {
  marketReferenceCatalog,
  marketReferenceInputSchema,
  type MarketReferenceDataset,
  type MarketReferenceResult,
} from '@thesis-ledger/schemas';

export type ReferenceContractKind = 'future' | 'option';
const futuresSources = [
  'futures-daily-shfe',
  'futures-daily-ine',
  'futures-daily-czce',
  'futures-daily-cffex',
  'futures-daily-gfex',
] as const;
export type ReferenceContractSource = (typeof futuresSources)[number] | 'etf-option-contracts';
export const referenceContractSources = (kind: ReferenceContractKind) => {
  const sources: readonly ReferenceContractSource[] =
    kind === 'future' ? futuresSources : ['etf-option-contracts'];
  return sources.map((value) => ({ value, label: marketReferenceCatalog[value].label }));
};
export const isReferenceOptionUnderlying = (symbol: string) =>
  marketReferenceInputSchema.safeParse({ dataset: 'etf-option-contracts', symbol }).success;

export function referenceContractReadInput(
  source: ReferenceContractSource,
  date: string,
  underlying: string,
) {
  return marketReferenceInputSchema.parse({
    dataset: source,
    symbol: source === 'etf-option-contracts' ? underlying.trim().toUpperCase() : null,
    start: source === 'etf-option-contracts' ? null : date,
    end: source === 'etf-option-contracts' ? null : date,
    pageSize: 20,
    requestBudgetMs: 12_000,
  });
}
export type ReferenceContractChoice = {
  id: string;
  value: string;
  label: string;
  description: string;
};
type ContractPage = Pick<MarketReferenceResult, 'dataset' | 'items' | 'fetchedAt' | 'start'>;

/** Project only observed source contracts; do not create canonical Instrument identities. */
export function referenceContractChoices(result: ContractPage): ReferenceContractChoice[] {
  const option = result.dataset === 'etf-option-contracts';
  if (!option && !(futuresSources as readonly MarketReferenceDataset[]).includes(result.dataset))
    return [];
  const seen = new Set<string>();
  const choices: ReferenceContractChoice[] = [];
  for (const row of result.items) {
    const raw = row.values.contract;
    if (!raw) continue;
    const code = raw.toUpperCase();
    if (option ? !/^\d{8}$/.test(code) : !/^[A-Z]{1,2}\d{2}(?:0[1-9]|1[0-2])$/.test(code)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    const values = row.values;
    const label = option ? code : `${values.product || code} · ${code}`;
    const details = option
      ? [values.underlying, values.month, values.optionType]
      : [values.exchange, values.date || result.start];
    choices.push({
      id: `${result.dataset}:${row.id}`,
      value: code,
      label,
      description: details.filter(Boolean).join(' · '),
    });
  }
  return choices;
}
