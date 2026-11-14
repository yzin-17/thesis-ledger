import { ThesisLedgerApiError } from './api-error.js';
import { arenaProtocolSchema } from '@thesis-ledger/schemas';
import type { ArenaLiveForm } from './arena-live-setup.js';

export type ArenaSetupErrorKey = keyof ArenaLiveForm | 'models' | 'instruments' | 'market' | 'universe' | 'budgetCurrency' | 'allowWebSearch' | 'form';
export type ArenaSetupErrors = Partial<Record<ArenaSetupErrorKey, string>>;
type Issue = { path: readonly PropertyKey[]; code: string; message: string };
const budgetFields = { requests: 'requests', tokens: 'tokens', costMicros: 'cost' } as const;
const totalFields = { requests: 'allRequests', tokens: 'allTokens', costMicros: 'allCost' } as const;
const roots: Readonly<Record<string, ArenaSetupErrorKey>> = {
  title: 'title', startsOn: 'startsOn', endsOn: 'endsOn', initialCash: 'initialCash', maxPositionBps: 'maxPositionBps',
  instruments: 'instruments', market: 'market', universe: 'universe', budgetCurrency: 'budgetCurrency', allowWebSearch: 'allowWebSearch',
  decisionDeadlineMinutes: 'deadline',
};
export function arenaSetupDateOrderFields(startsOn: string, endsOn: string): ArenaSetupErrors {
  if (arenaProtocolSchema.shape.startsOn.safeParse(startsOn).success && arenaProtocolSchema.shape.endsOn.safeParse(endsOn).success && startsOn > endsOn)
    return { endsOn: '赛期结束早于开始' };
  return {};
}
function fieldFor(path: readonly PropertyKey[], live: boolean): ArenaSetupErrorKey {
  const [root, child, member, dimension] = path.map(String);
  if (root === 'entrants') {
    if (member === 'maxInputTokens') return 'maxInput';
    if (member === 'maxOutputTokens') return 'maxOutput';
    if (member === 'budget') return budgetFields[dimension as keyof typeof budgetFields] ?? 'models';
    return 'models';
  }
  if (root === 'budget') return totalFields[child as keyof typeof totalFields] ?? 'form';
  if (root === 'fees' && ['buyBps', 'sellBps', 'minimum', 'slippageBps'].includes(child ?? '')) return child as ArenaSetupErrorKey;
  if (root === 'resources' && ['maxActiveSymbols', 'maxResearchSteps', 'maxCycleSeconds', 'quoteIntervalSeconds', 'maxQuoteAgeSeconds'].includes(child ?? '')) return child as ArenaSetupErrorKey;
  if (root === 'decisionDeadlineMinutes' && live) return 'maxCycleSeconds';
  return roots[root ?? ''] ?? 'form';
}
const messages: Partial<Record<ArenaSetupErrorKey, string>> = {
  title: '请填写不超过 200 字的比赛名称', startsOn: '请选择有效的开始日期', endsOn: '请选择有效的结束日期',
  initialCash: '请输入大于零的金额，最多六位小数', maxPositionBps: '请输入 1 至 10000 的整数',
  buyBps: '请输入 0 至 10000 的整数', sellBps: '请输入 0 至 10000 的整数', minimum: '请输入非负金额，最多六位小数', slippageBps: '请输入 0 至 9999 的整数',
  maxInput: '请输入正整数，且不超过 2147483647', maxOutput: '请输入正整数，且不超过 2147483647',
  maxActiveSymbols: '请输入 1 至 200 的整数', maxResearchSteps: '请输入 1 至 100 的整数', maxCycleSeconds: '请输入 30 至 1800 的整数',
  quoteIntervalSeconds: '请输入 15 至 300 的整数', maxQuoteAgeSeconds: '请输入 15 至 300 的整数', deadline: '请输入 1 至 1440 的整数',
  requests: '请输入 0 至 2147483647 的整数', tokens: '请输入 0 至 2147483647 的整数',
  allRequests: '请输入 0 至 2147483647 的整数', allTokens: '请输入 0 至 2147483647 的整数',
  cost: '请输入非负金额，最多六位小数且不超过 2147.483647', allCost: '请输入非负金额，最多六位小数且不超过 2147.483647',
  instruments: '请选择有效的同市场标的', models: '请选择参赛模型', market: '请选择交易市场', universe: '请选择选股范围', budgetCurrency: '请选择模型费用币种',
};
export function arenaSetupIssueFields(issues: readonly Issue[], live: boolean): ArenaSetupErrors {
  const errors: ArenaSetupErrors = {};
  for (const issue of issues) {
    const field = fieldFor(issue.path, live);
    if (errors[field]) continue;
    let message = messages[field] ?? '配置未通过校验，请检查后重试';
    if ((issue.code === 'custom' || issue.code === 'server') && /[\u3400-\u9fff]/u.test(issue.message)) message = issue.message;
    if (field === 'models' && issue.code === 'too_big') message = '最多选择 12 个参赛模型';
    errors[field] = message;
  }
  return errors;
}
export class ArenaSetupValidationError extends Error {
  constructor(readonly fields: ArenaSetupErrors) { super('请检查标记的配置'); this.name = 'ArenaSetupValidationError'; }
}
export function arenaSetupFailureFields(error: unknown, live: boolean): ArenaSetupErrors {
  if (error instanceof ArenaSetupValidationError) return error.fields;
  if (error instanceof ThesisLedgerApiError && [400, 422].includes(error.status) && error.payload?.fields?.length)
    return arenaSetupIssueFields(error.payload.fields.map((field) => ({ path: field.path.split('.'), code: 'server', message: field.message })), live);
  return {};
}
