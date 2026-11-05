import type { ResearchReportComparison } from '@thesis-ledger/schemas';
import { formatFullDateTime } from './ai.display.js';
import { researchQualityReasonDetail } from './research-report-display.js';

type Value = ResearchReportComparison['groups'][number]['fields'][number]['before'];
export type ResearchComparisonChoice = { id: string; question: string | null; createdAt: string };
const object = (value: Value): Record<string, Value> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value: Value | undefined, missing = '未记录') =>
  typeof value === 'string' && value.length ? value : missing;
const number = (value: Value | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '未记录';
const currency = (value: Value | undefined) =>
  value === null || value === 'unrecorded' || value === undefined ? '币种未记录' : text(value);
function lines(value: Value, format: (value: Value) => string = (value) => text(value)) {
  if (!Array.isArray(value)) return '未记录';
  if (!value.length) return '未列出';
  return value.map(format).join('\n\n');
}
function days(value: Value | undefined) {
  if (value === 5 || value === 20) return `${value} 个交易日`;
  return '期限未记录';
}
function claims(value: Value) {
  return lines(value, (entry) => {
    const item = object(entry);
    let scope = '';
    if (item.kind === 'price-direction') {
      const directions: Record<string, string> = { up: '上涨', down: '下跌' };
      scope = `方向：${directions[text(item.direction, '')] ?? '未记录'}；观察 ${days(item.tradingDays)}\n`;
    }
    return `${text(item.description)}\n${scope}${text(item.rationale)}`;
  });
}
function numericClaims(value: Value) {
  return lines(value, (entry) => {
    const item = object(entry);
    const source = item.kind === 'field' ? object(item.source ?? null) : item;
    const unit = source.unit === 'price' ? '价格' : text(source.unit, '单位未记录');
    return `${text(item.description)}：${number(source.value)} ${unit}（${currency(source.currency)}）`;
  });
}
function conditions(value: Value) {
  const operators: Record<string, string> = {
    gt: '高于',
    gte: '不低于',
    lt: '低于',
    lte: '不高于',
  };
  return lines(value, (entry) => {
    const item = object(entry);
    if (item.kind === 'price-threshold')
      return `${text(item.description)}\n价格${operators[text(item.operator, '')] ?? '条件未记录'} ${number(item.value)} ${currency(item.currency)}；观察 ${days(item.tradingDays)}`;
    if (item.kind === 'qualitative') return `${text(item.description)}\n人工复核`;
    return `${text(item.description)}\n尚未明确：${text(item.reason)}`;
  });
}
function confidence(value: Value) {
  const item = object(value);
  const labels: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    unassessed: '未评估',
  };
  return `${labels[text(item.level, '')] ?? '未记录'}\n${lines(item.basis ?? null)}`;
}
function steps(value: Value) {
  const labels: Record<string, string> = {
    view_evidence: '查看证据',
    update_data: '更新资料',
    compare_reports: '比较历史报告',
    review_due: '复核观察',
  };
  return lines(value, (entry) => {
    const item = object(entry);
    return `${labels[text(item.action, '')] ?? '下一步'}：${text(item.description)}`;
  });
}
function quality(value: Value) {
  const item = object(value);
  const labels: Record<string, string> = { complete: '资料完整', partial: '资料不完整' };
  const status = labels[text(item.status, '')] ?? '质量状态未记录';
  if (!Array.isArray(item.reasons) || !item.reasons.length) return status;
  return `${status}\n${item.reasons.map((reason) => researchQualityReasonDetail(text(reason))).join('\n')}`;
}
function routes(value: Value) {
  return lines(value, (entry) => {
    const item = object(entry);
    return [
      `来源：${text(item.providerId)}`,
      `来源标识：${Array.isArray(item.sourceIds) ? item.sourceIds.map((id) => text(id)).join('、') : '未记录'}`,
      `合同：${text(item.contractVersion)}`,
      `策略修订：${text(item.policyRevision)}`,
      `路由修订：${text(item.routeRevision)}`,
      `凭据修订：${text(item.credentialRevision)}`,
    ].join('\n');
  });
}
function scope(value: Value) {
  const item = object(value),
    instrument = object(item.instrument ?? null);
  const labels: Record<string, string> = {
    instrument: '标的',
    position: '持仓',
    portfolio: '组合',
    account: '账户',
    strategy: '策略',
  };
  const modes: Record<string, string> = { shadow: '模拟范围', actual: '实际范围' };
  const output = [
    `${modes[text(item.mode, '')] ?? '模式未记录'} · ${labels[text(item.scope, '')] ?? '范围未记录'}`,
  ];
  if (typeof instrument.symbol === 'string')
    output.push(`标的：${instrument.symbol}（${currency(instrument.currency)}）`);
  if (typeof item.accountId === 'string') output.push(`账户：${item.accountId}`);
  if (typeof item.portfolioId === 'string') output.push(`组合：${item.portfolioId}`);
  if (item.scope === 'portfolio' && item.portfolioId === null) output.push('全部组合');
  if (typeof item.strategyVersionId === 'string')
    output.push(`策略版本：${item.strategyVersionId}`);
  if (Array.isArray(item.accountIds))
    output.push(`账户集合：${item.accountIds.map((id) => text(id)).join('、') || '无账户'}`);
  if (Array.isArray(item.instruments))
    output.push(
      `范围内标的：${item.instruments.map((entry) => text(object(entry).symbol)).join('、') || '无标的'}`,
    );
  return output.join('\n');
}
function model(value: Value) {
  const item = object(value);
  return `供应方：${text(item.providerId)}\n模型：${text(item.modelId)}\n研究设置修订：${text(item.researchSettingsRevision)}`;
}
const formatters: Record<string, (value: Value) => string> = {
  conclusion: (value) => text(value),
  rationale: lines,
  risks: lines,
  unknowns: lines,
  claims,
  numericClaims,
  confidence,
  nextSteps: steps,
  invalidationConditions: conditions,
  tradingDays: (value) => lines(value, (entry) => days(object(entry).tradingDays)),
  dataCutoffAt: (value) => (typeof value === 'string' ? formatFullDateTime(value) : '未记录'),
  dataFingerprint: (value) => text(value),
  promptVersion: (value) => text(value),
  promptFingerprint: (value) => text(value),
  quality,
  routes,
  scopeSnapshot: scope,
  model,
};
export function formatResearchComparisonValue(key: string, value: Value) {
  const format = formatters[key];
  return format ? format(value) : '此字段请在原报告中核对。';
}
export function researchComparisonChoiceLabel(choice: ResearchComparisonChoice) {
  return `${formatFullDateTime(choice.createdAt)} · ${choice.question || '问题未记录'}`;
}

export function researchComparisonChoices(
  runs: readonly { id: string; createdAt: string; status: string; question?: string | null }[],
): ResearchComparisonChoice[] {
  return runs
    .filter((run) => run.status === 'succeeded')
    .map((run) => ({
      id: run.id,
      question: run.question ?? null,
      createdAt: run.createdAt,
    }));
}
