import { aiGenerationContracts, arenaLiveDefaults, arenaLiveProtocolSchema, type ArenaLiveProtocol, type AiProviderRecord } from '@thesis-ledger/schemas';
import { arenaInitialForm, arenaSetupFields, copyArenaGroup, type ArenaForm, type ArenaChoice, type ArenaBinding } from './arena-setup.js';
import type { ThesisLedgerApiClient } from './index.js';
import { arenaSetupDateOrderFields, arenaSetupIssueFields, ArenaSetupValidationError, type ArenaSetupErrors } from './arena-setup-validation.js';

export const arenaLiveSetupFields = arenaSetupFields.filter(([key]) => key !== 'deadline').map(([key, label, value]) => {
  let text: string = label;
  if (key === 'slippageBps') text = '模拟成交滑点（万分比）';
  if (key === 'maxInput') text = '每次请求输入上限';
  if (key === 'maxOutput') text = '每次请求输出上限';
  if (key === 'requests') text = '每模型研究请求总额（含工具）';
  if (key === 'allRequests') text = '全场研究请求总额（含工具）';
  const initial = ['requests', 'tokens', 'cost', 'allRequests', 'allTokens', 'allCost', 'maxInput', 'maxOutput'].includes(key) ? '' : value;
  return [key, text, initial] as const;
});
export const arenaResourceFields = [
  ['maxActiveSymbols', '监测标的上限', String(arenaLiveDefaults.resources.maxActiveSymbols)], ['maxResearchSteps', '单次研究步骤上限', ''],
  ['maxCycleSeconds', '单次研究时限（秒）', ''], ['quoteIntervalSeconds', '行情观察间隔（秒）', String(arenaLiveDefaults.resources.quoteIntervalSeconds)],
  ['maxQuoteAgeSeconds', '可成交行情最大延迟（秒）', String(arenaLiveDefaults.resources.maxQuoteAgeSeconds)],
] as const;
export type ArenaLiveForm = ArenaForm & Record<(typeof arenaResourceFields)[number][0], string>;
export const arenaLiveInitialForm = (): ArenaLiveForm => ({ ...arenaInitialForm(), ...Object.fromEntries(arenaLiveSetupFields.map(([key, , value]) => [key, value])),
  ...Object.fromEntries(arenaResourceFields.map(([key, , value]) => [key, value])),
} as ArenaLiveForm);
export function arenaLiveFieldPlaceholder(key: string) {
  if (['maxResearchSteps', 'maxCycleSeconds'].includes(key)) return '不限制';
  if (['requests', 'tokens', 'cost', 'allRequests', 'allTokens', 'allCost', 'maxInput', 'maxOutput'].includes(key)) return '不限额';
  if (key === 'title') return '默认 ' + arenaLiveDefaults.title;
  const value = [...arenaLiveSetupFields, ...arenaResourceFields].find(([name]) => name === key)?.[2];
  return value ? '默认 ' + value : undefined;
}
export function arenaLiveModels(providers: AiProviderRecord[]): ArenaBinding[] {
  return providers.filter((p) => p.enabled).flatMap((p) => [...new Set((p.executionRoutes ?? []).filter((r) => {
    // 合同兼容性由服务端 readiness 判定，客户端只限定自主研究用途。
    if (r.contract.id !== aiGenerationContracts.arenaLiveResearch.ref.id) return false;
    const price = p.modelPricing?.[r.model];
    return r.readiness.state === 'ready' || r.liveValidation.status === 'passed' &&
      r.readiness.reasons.every((reason) => reason === 'budget_not_authorized') &&
      price?.costPer1kInput != null && price.costPer1kOutput != null && Boolean(price.costCurrency);
  }).map((r) => r.model))].sort().map((model) => ({ providerId: p.name, model })));
}
export async function copyArenaLiveGroup(api: ThesisLedgerApiClient, group: string) {
  const names: Record<string, string> = {};
  const items = await copyArenaGroup(api, group, (symbol, name) => { names[symbol] = name; });
  return { items, names };
}
const integer = (value: string) => /^\d+$/.test(value) ? Number(value) : NaN;
const optionalInteger = (value: string) => value.trim() === '' ? null : integer(value.trim());
const micros = (value: string) => {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) return NaN;
  const [unit, decimal = ''] = value.split('.');
  return Number(unit) * 1000000 + Number(decimal.padEnd(6, '0'));
};
const optionalMicros = (value: string) => value.trim() === '' ? null : micros(value.trim());
const defaultInteger = (value: string) => value.trim() === '' ? undefined : integer(value.trim());
const defaultText = (value: string) => value.trim() || undefined;
export function validateArenaLiveSetup(f: ArenaLiveForm, pool: ArenaChoice[], models: ArenaBinding[],
  options: Pick<ArenaLiveProtocol, 'market' | 'universe' | 'budgetCurrency' | 'allowWebSearch'>) {
  const { market, universe } = options;
  const budget = { requests: optionalInteger(f.requests), tokens: optionalInteger(f.tokens), costMicros: optionalMicros(f.cost) };
  const resources = { ...Object.fromEntries(arenaResourceFields.map(([key]) => [key, defaultInteger(f[key])])),
    maxResearchSteps: optionalInteger(f.maxResearchSteps), maxCycleSeconds: optionalInteger(f.maxCycleSeconds) };
  const checked = arenaLiveProtocolSchema.safeParse({ version: 2, title: defaultText(f.title), ...options,
    currency: { CN: 'CNY', HK: 'HKD', US: 'USD' }[market],
    timeZone: { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' }[market],
    calendarId: market, calendarVersion: null, startsOn: f.startsOn.trim() || null, endsOn: f.endsOn.trim() || null, initialCash: defaultText(f.initialCash),
    maxPositionBps: defaultInteger(f.maxPositionBps), decisionDeadlineMinutes: resources.maxCycleSeconds === null ? null : Math.max(1, Math.ceil(resources.maxCycleSeconds / 60)), maxInfrastructureAttempts: 3,
    fees: { version: 'fixed-v1', buyBps: defaultInteger(f.buyBps), sellBps: defaultInteger(f.sellBps), minimum: defaultText(f.minimum), slippageBps: defaultInteger(f.slippageBps) },
    instruments: universe === 'fixed' ? pool : [], benchmarks: universe === 'fixed' ? ['cash', 'equal_weight_buy_hold'] : ['cash'],
    resources,
    entrants: models.map((m) => ({ ...m, budget, maxInputTokens: optionalInteger(f.maxInput), maxOutputTokens: optionalInteger(f.maxOutput) })),
    budget: { requests: optionalInteger(f.allRequests), tokens: optionalInteger(f.allTokens), costMicros: optionalMicros(f.allCost) },
  });
  if (!checked.success) return { success: false as const, errors: { ...arenaSetupIssueFields(checked.error.issues, true), ...arenaSetupDateOrderFields(f.startsOn.trim(), f.endsOn.trim()) } };
  return { success: true as const, protocol: checked.data, errors: {} as ArenaSetupErrors };
}
export async function saveArenaLiveSetup(api: ThesisLedgerApiClient, f: ArenaLiveForm, pool: ArenaChoice[], models: ArenaBinding[],
  options: Pick<ArenaLiveProtocol, 'market' | 'universe' | 'budgetCurrency' | 'allowWebSearch'>) {
  const result = validateArenaLiveSetup(f, pool, models, options);
  if (!result.success) throw new ArenaSetupValidationError(result.errors);
  const checked = result.protocol;
  const calendar = checked.startsOn && checked.endsOn
    ? await api.modelArenas.calendar({ market: checked.market, startsOn: checked.startsOn, endsOn: checked.endsOn }) : {};
  return api.arenaMatches.create({ ...checked, ...calendar });
}
