import type {
  MarketRouteCapabilityV3,
  RoutingAuthoring,
  RoutingRule,
  RoutingScope,
} from '@thesis-ledger/schemas';
import { dataSourceDisplay, type ProviderManifest } from './market-data.types.js';
import { routeAvailabilityLabelV3 } from './market-data-routes-v3.js';
import { accountAccessLabel, accountAccessSelectable } from './provider-account-access.js';
import {
  routingInheritedRule,
  routingScopeMatchesKey,
  updateRoutingScopeBinding,
  updateRoutingScopeSelection,
} from './routing-config-draft.js';

const localIds = new Set([
  'official-states',
  'official-rules',
  'official-hk-rules',
  'official-us-rules',
  'official-dividends',
]);
export const routingProviderChoices = (providers: ProviderManifest[]) => {
  const items = providers
    .filter((provider) => !localIds.has(provider.providerId))
    .map((provider) => ({ value: provider.providerId, label: provider.displayName }));
  if (!items.some((item) => item.value === 'local-materials'))
    items.push({ value: 'local-materials', label: '本地资料' });
  return items;
};

export type RoutingSourceChoice = {
  value: string;
  label: string;
  providerId: string;
  upstreamSource: string | null;
  disabled?: boolean;
};
const choiceValue = (id: string, source: string | null) => JSON.stringify([id, source]);

const unsupportedStates = new Set(['not_adapted', 'unsupported_adjustment', 'basis_incompatible']);
const credentialMissing = (entry: MarketRouteCapabilityV3, provider?: ProviderManifest) =>
  entry.state === 'credential_missing' ||
  (provider?.requiresCredential === true && !provider.credentialConfigured);

function supportedEntries(entries: MarketRouteCapabilityV3[], provider?: ProviderManifest) {
  return entries.filter(
    (entry) =>
      !unsupportedStates.has(entry.state) &&
      accountAccessSelectable(
        entry.accountAccess,
        Date.now(),
        provider?.configVersion,
      ),
  );
}

function sourceChoice(
  providerId: string,
  source: string | null,
  label: string,
  entries: MarketRouteCapabilityV3[],
  provider?: ProviderManifest,
): RoutingSourceChoice {
  const disabled = entries.every((entry) => credentialMissing(entry, provider));
  if (disabled) label += ' · 凭据缺失';
  else if (!entries.some((entry) => entry.state === 'ready'))
    label += ` · ${routeAvailabilityLabelV3(entries[0]?.state)}`;
  else if (entries.every((entry) => entry.verification?.state === 'verified')) label += ' · 已验证';
  else if (entries.some((entry) => entry.verification?.state === 'verified')) label += ' · 部分已验证';
  else label += ' · 未验证，可尝试';
  return {
    value: choiceValue(providerId, source),
    label,
    providerId,
    upstreamSource: source,
    disabled,
  };
}

function unavailableChoice(
  providerId: string,
  source: string | null,
  label: string,
  entries: MarketRouteCapabilityV3[],
  provider?: ProviderManifest,
): RoutingSourceChoice {
  const entry = entries.find((item) => !source || item.target.upstreamSource === source);
  let reason = '不支持当前能力';
  if (
    entry?.accountAccess &&
    !accountAccessSelectable(
      entry.accountAccess,
      Date.now(),
      provider?.configVersion,
    )
  )
    reason = accountAccessLabel(entry.accountAccess, Date.now(), provider?.configVersion);
  else if (entry && unsupportedStates.has(entry.state))
    reason = routeAvailabilityLabelV3(entry.state)!;
  else if (entry && provider?.accountAccessSupported) reason = '权限待验证';
  return {
    value: choiceValue(providerId, source),
    label: `${label} · ${reason}`,
    providerId,
    upstreamSource: source,
    disabled: true,
  };
}

export function routingSourceChoices(
  providers: ProviderManifest[],
  catalog: MarketRouteCapabilityV3[],
  scope: RoutingScope,
  rule?: RoutingRule,
): RoutingSourceChoice[] {
  const names = routingProviderChoices(providers);
  for (const id of rule?.providers ?? []) {
    if (!names.some((item) => item.value === id))
      names.push({ value: id, label: `${id}（来源已移除）` });
  }
  return names.flatMap(({ value: providerId, label }) => {
    const provider = providers.find((item) => item.providerId === providerId);
    const matching = catalog.filter(
      (entry) => entry.target.providerId === providerId && routingScopeMatchesKey(scope, entry.key),
    );
    const eligible = supportedEntries(matching, provider);
    const sources = [...new Set(eligible.map((entry) => entry.target.upstreamSource))];
    const choices: RoutingSourceChoice[] = [];
    const pinned = rule?.upstreamSources?.[providerId];
    if (!scope.capability && sources.length) {
      const title =
        sources.length === 1
          ? dataSourceDisplay(providerId, sources[0], providers)
          : `${label} · 按能力匹配`;
      return [sourceChoice(providerId, null, title, eligible, provider)];
    }
    for (const source of sources)
      choices.push(
        sourceChoice(
          providerId,
          source,
          dataSourceDisplay(providerId, source, providers),
          eligible.filter((entry) => entry.target.upstreamSource === source),
          provider,
        ),
      );
    if (
      rule?.providers.includes(providerId) &&
      (!sources.length || (pinned && !sources.includes(pinned)))
    )
      choices.push(
        unavailableChoice(
          providerId,
          pinned ?? null,
          pinned ? dataSourceDisplay(providerId, pinned, providers) : label,
          matching,
          provider,
        ),
      );
    return choices;
  });
}

export function routingSourceValue(
  rule: RoutingRule | undefined,
  providerId: string | undefined,
  choices: RoutingSourceChoice[],
) {
  if (!providerId) return '__none__';
  const pinned = rule?.upstreamSources?.[providerId];
  if (pinned) return choiceValue(providerId, pinned);
  const automatic = choices.find(
    (item) => item.providerId === providerId && item.upstreamSource === null,
  );
  if (automatic) return automatic.value;
  const specific = choices.filter((item) => item.providerId === providerId);
  if (specific.length === 1) return specific[0]!.value;
  return null;
}

export function updateRoutingSourceChoice(
  config: RoutingAuthoring,
  scope: RoutingScope,
  index: 0 | 1,
  choice: RoutingSourceChoice | null,
) {
  if (choice?.disabled) return config;
  const selected = routingInheritedRule(config, scope)?.providers ?? [];
  if (index === 1 && !selected[0]) return config;
  let providers = selected.slice(0, index);
  if (choice) {
    if (selected[1 - index] === choice.providerId) return config;
    providers =
      index === 0 ? [choice.providerId, ...selected.slice(1)] : [selected[0]!, choice.providerId];
  }
  const next = updateRoutingScopeSelection(config, scope, providers);
  if (!choice || !scope.capability) return next;
  return updateRoutingScopeBinding(next, scope, choice.providerId, choice.upstreamSource);
}
