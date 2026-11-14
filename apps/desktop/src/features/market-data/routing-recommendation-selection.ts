import { uniqBy } from 'es-toolkit';
import { marketRouteKeyIdV3, type MarketRouteCapabilityV3 } from '@thesis-ledger/schemas';
import { accountAccessSelectable } from './provider-account-access.js';
import type { ProviderManifest } from './market-data.types.js';

export type RecommendationCandidate = MarketRouteCapabilityV3;
export const targetIdentity = (entry: RecommendationCandidate) =>
  JSON.stringify([entry.target.providerId, entry.target.upstreamSource]);

export function eligibleRecommendationCandidates(
  providers: ProviderManifest[], catalog: MarketRouteCapabilityV3[], selectable: Set<string>, now: number,
) {
  const manifests = new Map(providers.map((provider) => [provider.providerId, provider]));
  return uniqBy(catalog.filter((entry) => {
    const provider = manifests.get(entry.target.providerId);
    if (!provider || !selectable.has(provider.providerId) || !provider.enabled || entry.state !== 'ready') return false;
    const required = entry.credentialRequired ?? provider.requiresCredential;
    if (required && (!provider.configured || !provider.credentialConfigured)) return false;
    if (!provider.configured && entry.credentialRequired !== false) return false;
    return accountAccessSelectable(entry.accountAccess, now, provider.configVersion);
  }), (entry) => `${marketRouteKeyIdV3(entry.key)}:${targetIdentity(entry)}`);
}

export function selectPreferredCandidate(
  candidates: RecommendationCandidate[], preference: string[], current?: { providerId: string; upstreamSource: string | undefined },
) {
  if (!candidates.length) return { choices: candidates, reason: '没有符合当前配置和权限条件的来源' };
  const rank = (entry: RecommendationCandidate) => {
    const index = preference.indexOf(entry.target.providerId);
    return index < 0 ? preference.length : index;
  };
  const bestRank = Math.min(...candidates.map(rank));
  let choices = candidates.filter((entry) => rank(entry) === bestRank);
  let reason = bestRank < preference.length ? '遵循大类来源偏好' : '唯一合格来源';
  const evidenced = choices.filter((entry) => entry.recommendation?.readEvidence === true);
  if (evidenced.length) {
    choices = evidenced;
    reason += '；已有当前有效读取准入证据（限已验证范围）';
  }
  const declared = choices.filter((entry) => entry.recommendation?.priority !== undefined);
  if (declared.length) {
    const priority = Math.min(...declared.map((entry) => entry.recommendation!.priority!));
    choices = declared.filter((entry) => entry.recommendation!.priority === priority);
    if (choices.length === 1) reason += `；${choices[0]!.recommendation!.reason}`;
  }
  if (choices.length > 1 && current?.upstreamSource) {
    const retained = choices.find((entry) => entry.target.providerId === current.providerId
      && entry.target.upstreamSource === current.upstreamSource);
    if (retained) return { entry: retained, choices: [retained], reason: '同等条件下保留现有具体来源' };
  }
  if (choices.length === 1) return { entry: choices[0], choices, reason };
  return { choices, reason: `${choices.length} 个接口条件相同，请选择具体来源` };
}

export function backupCandidates(primary: RecommendationCandidate, candidates: RecommendationCandidate[]) {
  const others = candidates.filter((entry) => entry.target.providerId !== primary.target.providerId);
  const group = primary.recommendation?.upstreamGroup;
  const independent = others.filter((entry) => group && entry.recommendation?.upstreamGroup
    && entry.recommendation.upstreamGroup !== group);
  return independent.length ? independent : others;
}

export function backupReason(primary: RecommendationCandidate, backup: RecommendationCandidate) {
  const first = primary.recommendation?.upstreamGroup;
  const second = backup.recommendation?.upstreamGroup;
  if (!first || !second) return '服务上游归属尚未确认';
  return first === second ? '同源备用，可能共享上游故障' : '与主源服务上游不同';
}
