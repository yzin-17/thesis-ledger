import { aiResearchPageStateSchema, type AiResearchPageState } from '@thesis-ledger/schemas';

export const parseAiResearchPageState = (search: string): AiResearchPageState => {
  const params = new URLSearchParams(search);
  const candidate = {
    search: params.get('q') ?? '',
    status: params.get('status') ?? 'all',
    source: params.get('source') ?? 'all',
    includeInternal: params.get('internal') === '1',
    sort: 'updated_desc' as const,
    selectedRunId: params.get('run'),
    mode: params.get('mode') ?? (params.has('run') ? 'drawer' : 'list'),
  };
  const parsed = aiResearchPageStateSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return aiResearchPageStateSchema.parse({});
};

export const serializeAiResearchPageState = (state: AiResearchPageState) => {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  if (state.status !== 'all') params.set('status', state.status);
  if (state.source !== 'all') params.set('source', state.source);
  if (state.includeInternal) params.set('internal', '1');
  if (state.selectedRunId) params.set('run', state.selectedRunId);
  if (state.mode !== 'list') params.set('mode', state.mode);
  return params.toString();
};
