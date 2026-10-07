import { isDeepStrictEqual } from 'node:util';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  marketRouteCatalogV3Schema,
  marketRouteKeyIdV3,
  type BacktestNavSourceRequestV3,
} from '@thesis-ledger/schemas';
import { DsaV3ProtocolError } from '../integration/dsa/dsa-v3-protocol.js';

export function navRouteState(
  desiredRaw: unknown,
  effectiveRaw: unknown,
  catalogRaw: unknown,
  key: BacktestNavSourceRequestV3['routeKey'],
) {
  const desired = desiredProviderPolicyV3Schema.parse(desiredRaw);
  const effective = effectiveProviderPolicyV3Schema.parse(effectiveRaw);
  const catalog = marketRouteCatalogV3Schema.parse(catalogRaw);
  if (
    !desired.enabled ||
    !effective.enabled ||
    effective.revision !== desired.revision ||
    effective.sourceDesiredRevision !== desired.revision ||
    catalog.integrity !== 'complete'
  ) {
    throw new DsaV3ProtocolError('净值路由策略或目录未就绪', 'control-rejected');
  }
  const id = marketRouteKeyIdV3(key);
  const wanted = desired.routes.find((route) => marketRouteKeyIdV3(route.key) === id);
  const applied = effective.routes.find((route) => marketRouteKeyIdV3(route.key) === id);
  if (
    !wanted ||
    !applied ||
    applied.reason !== null ||
    !isDeepStrictEqual(
      wanted.targets,
      applied.targets.map(({ providerId, upstreamSource }) => ({ providerId, upstreamSource })),
    )
  ) {
    throw new DsaV3ProtocolError('净值精确路由缺失或目标顺序不一致', 'control-rejected');
  }
  const targets = applied.targets.map((target) => ({
    ...target,
    catalogState:
      catalog.entries.find(
        (entry) =>
          marketRouteKeyIdV3(entry.key) === id &&
          entry.target.providerId === target.providerId &&
          entry.target.upstreamSource === target.upstreamSource,
      )?.state ?? null,
  }));
  const selected = targets.find((target) => target.eligible && target.catalogState === 'ready');
  if (!selected) throw new DsaV3ProtocolError('净值路由未准入', 'control-rejected');
  if (selected.providerId !== 'efinance' || selected.upstreamSource !== 'eastmoney') {
    throw new DsaV3ProtocolError('所选净值来源尚无精确原文适配器', 'unsupported-capability');
  }
  return {
    desiredRevision: desired.revision,
    effectivePolicyRevision: effective.revision,
    catalogRevision: catalog.catalogRevision,
    targets,
    routeTarget: {
      providerId: selected.providerId,
      upstreamSource: selected.upstreamSource,
      routeIndex: selected.routeIndex,
    },
  };
}
