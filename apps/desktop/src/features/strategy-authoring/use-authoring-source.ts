import { useQuery } from '@tanstack/react-query';
import { authoringSourceReadSchema } from '@thesis-ledger/schemas';
import type { StrategyVersion } from '../strategy/strategy.types.js';
import { requestDesktopJson } from '../shared/request.js';
import { useAuthoringIdentity } from './AuthoringIdentity.js';

export function useAuthoringSource(version: StrategyVersion | null, enabled = true) {
  const identity = useAuthoringIdentity();
  return useQuery({
    queryKey: ['desktop', 'authoring-source', identity?.principal.id, version?.id],
    queryFn: async () =>
      authoringSourceReadSchema.parse(
        await requestDesktopJson(`/strategy-authoring/versions/${version!.id}/source`),
      ),
    enabled: enabled && version?.source?.kind === 'ai_assisted' && Boolean(identity),
    retry: false,
  });
}
