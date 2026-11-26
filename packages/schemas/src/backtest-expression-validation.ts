import type { z } from 'zod';
import { temporalInputIssue } from './backtest-temporal-input.js';
import { numericOperationUnitIssues } from './backtest-numeric-unit-validation.js';
import type { NumericExpression } from './backtest-expression.js';
import {
  replaceEventValue,
  containsSequence,
  invalidEventValueScope,
} from './backtest-sequence-validation.js';
import type { SignalSource, SeriesField } from './backtest-values.js';
import { backtestIndicatorNameSchema as indicatorNameSchema } from './backtest-indicators.js';
import {
  sessionValueExpressionSchema,
  validateSessionValueSource,
} from './backtest-session-expression.js';

const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: 'custom', path, message });

const requiredIndicatorParams: Record<string, string[]> = {
  MA: ['period'],
  EMA: ['period'],
  RSI: ['period'],
  MACD: ['fastPeriod', 'slowPeriod', 'signalPeriod'],
  ATR: ['period'],
  VWAP: ['period'],
  Highest: ['period'],
  Lowest: ['period'],
  ADX: ['period'],
};

/** 严格节点解析失败时仍给出来源与参数路径；不对未通过结构检查的树做单位求值。 */
export function validateExpressionDeclarations(
  value: unknown,
  sources: Map<string, SignalSource>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateExpressionDeclarations(item, sources, ctx, [...path, index]),
    );
    return;
  }
  if (!value || typeof value !== 'object') return;
  const node = value as Record<string, unknown>;
  if (node.type === 'series') validateNumericExpression(node, sources, ctx, path);
  if (node.type === 'indicator' && typeof node.name === 'string')
    validateIndicatorParameters(node.name, node.params, ctx, path);
  for (const [key, child] of Object.entries(node)) {
    if (child && typeof child === 'object')
      validateExpressionDeclarations(child, sources, ctx, [...path, key]);
  }
}

function validateIndicatorParameters(
  name: string,
  raw: unknown,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const params =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const required = requiredIndicatorParams[name] ?? [];
  for (const param of required) {
    if (!(param in params)) issue(ctx, [...path, 'params', param], '缺少 Indicator 参数');
  }
  for (const param of Object.keys(params)) {
    if (!required.includes(param)) issue(ctx, [...path, 'params', param], '未知 Indicator 参数');
    const val = params[param];
    if (typeof val === 'number' && (!Number.isInteger(val) || val <= 0))
      issue(ctx, [...path, 'params', param], '参数必须是正整数');
    if (
      typeof val === 'string' &&
      param.toLowerCase().includes('period') &&
      !/^[1-9]\d*$/.test(val)
    )
      issue(ctx, [...path, 'params', param], '周期参数必须是正整数');
  }
}

function validateIndicatorExpression(
  node: Record<string, unknown>,
  sources: Map<string, SignalSource>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (
    node.input &&
    typeof node.input === 'object' &&
    'type' in node.input &&
    node.input.type === 'sessionValue'
  )
    issue(ctx, [...path, 'input'], '会话数值只支持直接比较，不能作为滚动指标输入');
  const name = typeof node.name === 'string' ? node.name : undefined;
  if (
    !name ||
    !indicatorNameSchema.options.includes(name as (typeof indicatorNameSchema.options)[number])
  ) {
    issue(ctx, [...path, 'name'], '未知 Indicator');
    return;
  }
  validateNumericExpression(node.input, sources, ctx, [...path, 'input']);
  if (name === 'ATR' || name === 'ADX') validateAtrInput(node.input, sources, ctx, path);
  validateIndicatorParameters(name, node.params, ctx, path);
  if ((name === 'MACD' || name === 'ADX') && typeof node.output !== 'string')
    issue(ctx, [...path, 'output'], `${name} 必须显式选择 output`);
  if (name === 'MACD' && !['macd', 'signal', 'histogram'].includes(String(node.output)))
    issue(ctx, [...path, 'output'], 'MACD 输出选择不合法');
  if (name === 'ADX' && !['adx', 'plusDI', 'minusDI'].includes(String(node.output)))
    issue(ctx, [...path, 'output'], 'ADX 输出选择不合法');
  if (name !== 'MACD' && name !== 'ADX' && node.output !== undefined)
    issue(ctx, [...path, 'output'], '该 Indicator 不支持 output selector');
}

function validateAtrInput(
  input: unknown,
  sources: Map<string, SignalSource>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const node = input as Record<string, unknown> | undefined;
  const source = typeof node?.sourceId === 'string' ? sources.get(node.sourceId) : undefined;
  if (
    node?.type !== 'series' ||
    node.field !== 'close' ||
    !source ||
    ['high', 'low', 'close'].some((field) => !source.series.includes(field as SeriesField))
  )
    issue(ctx, [...path, 'input'], 'ATR需要同源high/low/close，以close序列为输入');
}

export const validateNumericExpression = (
  value: unknown,
  sources: Map<string, SignalSource>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): 'numeric' | 'boolean' | 'unknown' => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issue(ctx, [...path, 'type'], '必须是受支持的 AST 节点');
    return 'unknown';
  }
  const node = value as Record<string, unknown>;
  if (node.type === 'eventValue') {
    issue(ctx, path, '冻结事件值只能用于声明 capture 的事件序列确认或失效条件');
    return 'unknown';
  }
  if (node.type === 'confirmedPivot') {
    validateNumericExpression(node.input, sources, ctx, [...path, 'input']);
    if (node.sample) validateNumericExpression(node.sample, sources, ctx, [...path, 'sample']);
    const failure = temporalInputIssue(node);
    if (failure) issue(ctx, path, failure);
    return 'numeric';
  }
  if (node.type === 'arithmetic') {
    validateNumericExpression(node.left, sources, ctx, [...path, 'left']);
    validateNumericExpression(node.right, sources, ctx, [...path, 'right']);
    for (const failure of numericOperationUnitIssues(node as NumericExpression, [
      ...sources.values(),
    ]))
      issue(ctx, [...path, ...failure.path], failure.message);
    return 'numeric';
  }
  if (
    node.type === 'absolute' ||
    node.type === 'lag' ||
    node.type === 'rolling' ||
    node.type === 'cumulative'
  ) {
    validateNumericExpression(node.input, sources, ctx, [...path, 'input']);
    const failure = node.type !== 'absolute' ? temporalInputIssue(node.input) : undefined;
    if (failure) issue(ctx, [...path, 'input'], failure);
    return 'numeric';
  }
  if (node.type === 'countTrue') {
    validateBooleanExpression(node.condition, sources, ctx, [...path, 'condition']);
    const failure = temporalInputIssue(node.condition);
    if (failure) issue(ctx, [...path, 'condition'], failure);
    return 'numeric';
  }
  if (node.type === 'constant') return 'numeric';
  if (node.type === 'positionState') {
    if (node.field === 'isOpen') {
      issue(ctx, [...path, 'field'], 'isOpen 是布尔值，不能作为数值表达式');
      return 'boolean';
    }
    return 'numeric';
  }
  if (node.type === 'series') {
    const sourceId = typeof node.sourceId === 'string' ? node.sourceId : undefined;
    const source = sourceId ? sources.get(sourceId) : undefined;
    if (!source) issue(ctx, [...path, 'sourceId'], '未知 SignalSource');
    if (
      source &&
      typeof node.field === 'string' &&
      !source.series.includes(node.field as SeriesField)
    ) {
      issue(ctx, [...path, 'field'], 'Series 未在 SignalSource 中声明');
    }
    return 'numeric';
  }
  if (node.type === 'sessionValue') {
    const session = sessionValueExpressionSchema.safeParse(node);
    if (!session.success) {
      issue(ctx, path, '会话数值必须使用严格来源和字段合同');
      return 'unknown';
    }
    const failure = validateSessionValueSource(session.data, sources.get(session.data.sourceId));
    if (failure) issue(ctx, [...path, failure.field], failure.message);
    return 'numeric';
  }
  if (node.type === 'indicator') {
    validateIndicatorExpression(node, sources, ctx, path);
    return 'numeric';
  }
  issue(ctx, [...path, 'type'], '未知或不支持的数值 AST 节点');
  return 'unknown';
};

export const validateBooleanExpression = (
  value: unknown,
  sources: Map<string, SignalSource>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issue(ctx, [...path, 'type'], '必须是布尔 AST 节点');
    return;
  }
  const node = value as Record<string, unknown>;
  if (node.type === 'sequence') {
    const failure = temporalInputIssue(node);
    if (failure) issue(ctx, path, failure);
    if ([node.trigger, node.confirm, node.invalidation, node.capture].some(containsSequence))
      issue(ctx, path, '事件序列内部不能嵌套其他事件序列');
    if (invalidEventValueScope(node.confirm) || invalidEventValueScope(node.invalidation))
      issue(ctx, path, '冻结事件值只可直接比较或参与当根运算，不能再做历史预计算');
    validateBooleanExpression(node.trigger, sources, ctx, [...path, 'trigger']);
    if (node.capture) validateNumericExpression(node.capture, sources, ctx, [...path, 'capture']);
    validateBooleanExpression(replaceEventValue(node.confirm, node.capture), sources, ctx, [
      ...path,
      'confirm',
    ]);
    validateBooleanExpression(replaceEventValue(node.invalidation, node.capture), sources, ctx, [
      ...path,
      'invalidation',
    ]);
    return;
  }
  if (node.type === 'consecutive') {
    validateBooleanExpression(node.condition, sources, ctx, [...path, 'condition']);
    const failure = temporalInputIssue(node.condition);
    if (failure) issue(ctx, [...path, 'condition'], failure);
    return;
  }
  if (node.type === 'all' || node.type === 'any') {
    if (!Array.isArray(node.conditions))
      issue(ctx, [...path, 'conditions'], 'conditions 必须是数组');
    else
      node.conditions.forEach((item, index) =>
        validateBooleanExpression(item, sources, ctx, [...path, 'conditions', index]),
      );
    return;
  }
  if (node.type === 'not') {
    validateBooleanExpression(node.expression, sources, ctx, [...path, 'expression']);
    return;
  }
  if (node.type === 'positionState' && node.field === 'isOpen') return;
  if (node.type === 'corporateActionEvent') return;
  if (node.type === 'compare' || node.type === 'cross') {
    if (
      node.type === 'cross' &&
      [node.left, node.right].some(
        (value) =>
          value && typeof value === 'object' && 'type' in value && value.type === 'sessionValue',
      )
    )
      issue(ctx, path, '会话数值首期只支持直接比较，跨日交叉时点尚未定义');
    const leftType = validateNumericExpression(node.left, sources, ctx, [...path, 'left']);
    const rightType = validateNumericExpression(node.right, sources, ctx, [...path, 'right']);
    if (leftType !== 'numeric') issue(ctx, [...path, 'left'], '比较输入必须是数值表达式');
    if (rightType !== 'numeric') issue(ctx, [...path, 'right'], '比较输入必须是数值表达式');
    return;
  }
  issue(ctx, [...path, 'type'], '未知或不支持的布尔 AST 节点');
};
