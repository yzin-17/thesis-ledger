export type ArenaDailyView = 'performance' | 'accounts' | 'activity' | 'settings';
const views: ArenaDailyView[] = ['performance', 'accounts', 'activity', 'settings'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readArenaDailyNavigation(params: URLSearchParams) {
  const view = params.get('view') as ArenaDailyView;
  const round = params.get('round'), model = params.get('model');
  return {
    view: views.includes(view) ? view : 'performance' as ArenaDailyView,
    roundId: round && uuid.test(round) ? round.toLowerCase() : null,
    modelId: model && uuid.test(model) ? model.toLowerCase() : null,
    invalidRound: Boolean(round && !uuid.test(round)),
    invalidModel: Boolean(model && !uuid.test(model)),
  };
}
export function updateArenaDailyNavigation(params: URLSearchParams, changes: { view?: ArenaDailyView; roundId?: string | null; modelId?: string | null }) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    const name = { roundId: 'round', modelId: 'model', view: 'view' }[key];
    if (!name) continue;
    if (!value || name === 'view' && value === 'performance') next.delete(name);
    else next.set(name, value);
  }
  return next;
}
export function arenaDailyLegacyTarget(path: string, search: string, roundId: string, hash: string) {
  const model = hash.startsWith('#model-') ? hash.slice(7) : null;
  const params = updateArenaDailyNavigation(new URLSearchParams(search), { view: 'activity', roundId, modelId: model });
  return { pathname: path, search: '?' + params.toString(), hash: '' };
}
