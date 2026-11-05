import { useEffect, useState } from 'react';
import type { ResearchSubmissionV2 } from '@thesis-ledger/schemas';
import type { InstrumentLookup } from '../portfolio/portfolio.types.js';
import { useResearchDraftObjects } from './research-draft-objects.js';
import { useResearchIdentity } from './research.queries.js';

export const researchScopeLabels = {
  instrument: '独立标的',
  portfolio: '全组合',
  account: '账户',
  position: '单个持仓',
  strategy: '策略版本',
} as const;
export type ResearchDraft = {
  scope: ResearchSubmissionV2['scope']['scope'];
  instrument: InstrumentLookup | null;
  accountId: string | null;
  symbol: string | null;
  strategyVersionId: string | null;
  question: string;
  templateId: ResearchSubmissionV2['templateId'];
};
const initialDraft = (question: string): ResearchDraft => ({
  scope: 'instrument',
  instrument: null,
  accountId: null,
  symbol: null,
  strategyVersionId: null,
  question,
  templateId: undefined,
});
function selectionFor(
  draft: ResearchDraft,
  objects: ReturnType<typeof useResearchDraftObjects>,
): ResearchSubmissionV2['scope'] | null {
  const { scope, instrument, symbol, strategyVersionId } = draft;
  if (scope === 'instrument' && instrument) return { scope, instrumentId: instrument.id };
  if (scope === 'portfolio') return { scope };
  if (scope === 'account' && objects.effectiveAccountId)
    return { scope, accountId: objects.effectiveAccountId };
  if (
    scope === 'position' &&
    objects.effectiveAccountId &&
    symbol &&
    objects.positionOptions.some((item) => item.value === symbol)
  )
    return { scope, accountId: objects.effectiveAccountId, symbol };
  if (
    scope === 'strategy' &&
    strategyVersionId &&
    objects.strategyOptions.some((item) => item.value === strategyVersionId)
  )
    return { scope, strategyVersionId };
  return null;
}
export const researchDraftDirty = (draft: ResearchDraft, question: string) =>
  Boolean(
    draft.question !== question ||
    draft.scope !== 'instrument' ||
    draft.instrument ||
    draft.accountId ||
    draft.strategyVersionId ||
    draft.templateId,
  );
export function useResearchDraft(
  open: boolean,
  question: string,
  mode: ResearchSubmissionV2['mode'],
  editable: boolean,
  allowedScopes: ResearchDraft['scope'][],
) {
  const owner = useResearchIdentity();
  const [draft, setDraft] = useState(() => initialDraft(question));
  useEffect(() => {
    if (open) setDraft(initialDraft(question));
  }, [open, question, mode, owner]);
  const objects = useResearchDraftObjects(
    draft.scope,
    mode,
    draft.accountId,
    open && editable && allowedScopes.includes(draft.scope),
  );
  const selection = selectionFor(draft, objects);
  const update = (change: Partial<ResearchDraft>) =>
    setDraft((current) => ({ ...current, ...change }));
  return {
    draft,
    objects,
    selection,
    update,
    valid: Boolean(selection && draft.question.trim() && draft.question.trim().length <= 2000),
  };
}
