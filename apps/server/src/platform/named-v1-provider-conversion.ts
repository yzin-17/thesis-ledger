import { z } from 'zod';
import {
  aiGenerationContracts,
  aiProviderExecutionRouteInputSchema,
} from '@thesis-ledger/schemas';
import { isDeepStrictEqual } from 'node:util';
import { hashCanonicalManifest } from '../backtest/backtest-snapshot.js';

const object = z.record(z.string(), z.unknown());
export const namedV1ProviderRoutesSchema = z.array(object);
const previous: Readonly<Record<string, readonly string[]>> = {
  strategy_authoring_analysis: ['authoring-analysis-v1'],
  strategy_authoring_generation: ['authoring-generation-v1', 'authoring-generation-v2',
    'authoring-generation-v3', 'authoring-generation-v4', 'authoring-generation-v5', 'authoring-generation-v6'],
  strategy_authoring_modification: ['authoring-modification-v1', 'authoring-modification-v2',
    'authoring-modification-v3', 'authoring-modification-v4', 'authoring-modification-v5', 'authoring-modification-v6'],
  strategy_discovery: ['strategy-discovery-v2', 'strategy-discovery-v3', 'strategy-discovery-v4',
    'strategy-discovery-v5', 'strategy-discovery-v6'],
  research: ['research-generation-v1', 'research-generation-v2'],
  arena_live_research: ['arena-live-research-v2', 'arena-live-research-v3', 'arena-live-research-v4',
    'arena-live-research-v5', 'arena-live-research-v6'],
};
const live = Object.values(aiGenerationContracts).map(({ ref }) => ref);
export function convertNamedV1ProviderRoutes(entries: ReturnType<typeof namedV1ProviderRoutesSchema.parse>) {
  const counts = { current: 0, converted: 0, blocked: 0 };
  const seen = new Set<string>();
  const replacement: typeof entries = [];
  const routes = entries.map((entry) => {
    const ref = z.object({ id: z.string(), version: z.string() }).safeParse(entry.contract);
    if (!ref.success || typeof entry.model !== 'string') {
      counts.blocked += 1;
      return { outcome: 'blocked', reason: '原模型用途或合同无效' };
    }
    const { id, version } = ref.data;
    const current = live.find((item) => item.id === id);
    const key = JSON.stringify([entry.model, id]);
    if (!current || (current.version !== version && !previous[id]?.includes(version)) || seen.has(key)) {
      counts.blocked += 1;
      return { contract: id, version, outcome: 'blocked', reason: '原配置合同未知或同模型用途冲突' };
    }
    seen.add(key);
    const candidate = { ...entry, contract: current };
    const result = aiProviderExecutionRouteInputSchema.safeParse(candidate);
    if (!result.success || !isDeepStrictEqual(result.data, candidate)) {
      counts.blocked += 1;
      return { contract: id, version, outcome: 'blocked', reason: '原配置无法通过当前用途校验' };
    }
    const outcome = current.version === version ? 'current' : 'converted';
    counts[outcome] += 1;
    replacement.push(result.data);
    return {
      contract: id, version, targetVersion: current.version, outcome,
      sourceHash: hashCanonicalManifest(entry), targetHash: hashCanonicalManifest(result.data),
      ...(outcome === 'converted' ? { validationStatus: 'not_run' } : {}),
    };
  });
  return { counts, routes, replacement: counts.blocked === 0 ? replacement : undefined };
}
