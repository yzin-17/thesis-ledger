import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, expect, it, vi } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { generationOutput } from '../../src/ai/ai-generation-output.js';
import { restoreExpressionQualification } from './strategy-expression-qualification.fixture.js';

type Validator = ((value: unknown) => boolean) & { errors?: unknown[] };
const require = createRequire(import.meta.url);
const Ajv = require(require.resolve('ajv', { paths: [require.resolve('eslint')] })) as new (
  options: object,
) => { compile: (schema: unknown) => Validator };
const contract = aiGenerationContracts.strategyDiscovery;
const price = { type: 'series', sourceId: 'discovery-primary', field: 'close' };
const directional = {
  type: 'indicator',
  name: 'ADX',
  input: price,
  params: { period: 14 },
  output: 'adx',
};
const std = { type: 'rolling', statistic: 'standardDeviation', periods: 20, input: price, ddof: 0 };
const envelope = (value: unknown) => ({
  strategy: {
    name: '原生合同样本',
    entryTrigger: 'rising-edge',
    signalSources: [{ id: 'discovery-primary', timeframe: '1d', priceCoordinate: 'research' }],
    entry: {
      type: 'compare',
      operator: 'gt',
      left: value,
      right: { type: 'constant', value: '0' },
    },
    exit: {
      type: 'compare',
      operator: 'eq',
      left: { type: 'constant', value: '0' },
      right: { type: 'constant', value: '1' },
    },
    sizing: { type: 'percentOfEquity', percent: '0.2' },
    risk: [],
  },
  reason: '按实际配置回读',
  evidenceRefs: [],
});
let native: Validator;
beforeAll(async () => {
  const format = await generationOutput('native_schema', contract.schema, contract.ref)
    .responseFormat;
  if (format?.type !== 'json') throw new Error('缺少实际SDK输出Schema');
  native = new Ajv({ allErrors: true, strictKeywords: true }).compile(format.schema);
});

it.each([
  ['ADX输出缺失', { ...directional, output: undefined }],
  [
    'ADX输出误放参数',
    { ...directional, output: undefined, params: { period: 14, outputField: 'plusDI' } },
  ],
  ['ADX不能选择MACD输出', { ...directional, output: 'macd' }],
  ['ADX输入必须close', { ...directional, input: { ...price, field: 'open' } }],
  [
    'MACD必选输出',
    {
      ...directional,
      name: 'MACD',
      params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      output: undefined,
    },
  ],
  ['单输出指标不带选择器', { ...directional, name: 'EMA' }],
  ['标准差必填自由度', { ...std, ddof: undefined }],
  ['样本窗口不能只有一根', { ...std, ddof: 1, periods: 1 }],
  ['分位数必填水平', { type: 'rolling', statistic: 'quantile', periods: 20, input: price }],
  [
    '分位水平不能超过一',
    { type: 'rolling', statistic: 'quantile', periods: 20, input: price, quantile: '1.1' },
  ],
  ['求和不带自由度', { ...std, statistic: 'sum' }],
])('实际原生Schema与正式解析共同拒绝：%s', (_label, value) => {
  const body: unknown = JSON.parse(JSON.stringify(envelope(value)));
  expect(native(body)).toBe(false);
  expect(contract.schema.safeParse(body).success).toBe(false);
});

it.each([
  ['ADX', directional],
  ['正向分量', { ...directional, output: 'plusDI' }],
  ['负向分量', { ...directional, output: 'minusDI' }],
  ['字符串周期', { ...directional, params: { period: '14' } }],
  ['EMA', { type: 'indicator', name: 'EMA', input: price, params: { period: 20 } }],
  [
    'MACD',
    {
      type: 'indicator',
      name: 'MACD',
      input: price,
      params: { fastPeriod: '12', slowPeriod: 26, signalPeriod: 9 },
      output: 'histogram',
    },
  ],
  ['总体标准差', { ...std, periods: 1 }],
  ['样本标准差', { ...std, ddof: 1 }],
  [
    '分位数端点',
    { type: 'rolling', statistic: 'quantile', periods: 20, input: price, quantile: '1.0' },
  ],
])('合法与历史有效节点继续通过实际原生Schema：%s', (_label, value) => {
  const body = envelope(value);
  expect(native(body), JSON.stringify(native.errors)).toBe(true);
  expect(contract.schema.parse(body)).toEqual(body);
});

const captured = process.env.STRATEGY_EXPRESSION_RECORDED_DIR;
const qualificationDirectory = process.env.STRATEGY_EXPRESSION_QUALIFICATION_DIR;
it.skipIf(!qualificationDirectory)('原私有资格仍满足路由与版本检查，恢复本身不发送请求', async () => {
  const capture = vi.fn();
  const row = JSON.parse(readFileSync(resolve(qualificationDirectory!, 'discovery.json'), 'utf8'));
  const provider = await restoreExpressionQualification(row, 'discovery', capture);
  expect(provider.resolved.execution.mode).toBe('native_schema');
  expect(capture).not.toHaveBeenCalled();
});
it.skipIf(!captured)(
  '已有真实ADX回执：旧wire确实放行，当前实际wire拒绝，不发起网络请求',
  async () => {
    const raw = JSON.parse(
      readFileSync(resolve(captured!, '05-events-directional/directional.json'), 'utf8'),
    );
    const wire = JSON.parse(
      readFileSync(resolve(captured!, '05-events-directional/discovery/wire-2-1.json'), 'utf8'),
    );
    const previous = new Ajv({ allErrors: true, strictKeywords: true }).compile(
      wire.responseFormat.json_schema.schema,
    );
    expect(previous(raw.generation.output)).toBe(true);
    expect(native(raw.generation.output)).toBe(false);
    expect(contract.schema.safeParse(raw.generation.output).success).toBe(false);
  },
);

it.skipIf(!captured)(
  '同一默认成交配置：旧精简wire不允许显式填写，当前实际wire允许且不改成日线委托',
  () => {
    const wire = JSON.parse(
      readFileSync(resolve(captured!, '02-windows/discovery/wire-1-1.json'), 'utf8'),
    );
    const previous = new Ajv({ allErrors: true, strictKeywords: true }).compile(
      wire.responseFormat.json_schema.schema,
    );
    const execution = {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    };
    const body = envelope(directional);
    const probe = { ...body, strategy: { ...body.strategy, execution } };
    expect(previous(probe)).toBe(false);
    expect(native(probe), JSON.stringify(native.errors)).toBe(true);
    const parsed = contract.schema.parse(probe);
    if (!('strategy' in parsed)) throw new Error('默认成交样本不应变成能力缺口');
    expect(parsed.strategy.execution).toEqual(execution);
  },
);
