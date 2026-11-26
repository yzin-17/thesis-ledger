import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import { backtestProtectionExamplesV6 } from '@thesis-ledger/domain';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { fixedAuthoringPlan, planAuthoringContent } from '../backtest/trade-plan-authoring-content.fixture.js';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import { savedAuthoringContract, authoringPricingFingerprint } from '../../src/strategy-authoring/authoring-model-policy.js';
import { AuthoringAttemptRunner } from '../../src/strategy-authoring/authoring-attempt.js';
import { authoringMessages } from '../../src/strategy-authoring/authoring-prompt.js';
import { generationOutput } from '../../src/ai/ai-generation-output.js';

const wire = () => {
  const compiled = fixedAuthoringPlan(false);
  return { intentCheck: '逐项核对当前要求', proposal: { definition: { ...compiled, entryTrigger: 'rising-edge',
    signalSources: compiled.signalSources.map((source) => Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'series'))),
    tradePlan: { ...compiled.tradePlan!, initialStop: { kind: 'percent', percent: '0.05', activation: { kind: 'immediate' } } } },
  coverage: [{ requirementId: 'rules', definitionPaths: ['entry', 'tradePlan'] }] } };
};
const ref = aiGenerationContracts.authoringGeneration.ref;

it('每种编写操作使用各自的具名合同', () => {
  expect(savedAuthoringContract({ kind: 'generate' }).ref).toEqual(ref);
  expect(savedAuthoringContract({ kind: 'modify' }).ref).toEqual(aiGenerationContracts.authoringModification.ref);
  expect(savedAuthoringContract({ kind: 'analyze' }).ref).toEqual(aiGenerationContracts.authoringAnalysis.ref);
});

it('动态V6合同保留wire，编译与正式确认使用派生定义，原文保持不变', () => {
  const raw = wire(), original = JSON.stringify(raw), content = planAuthoringContent(false);
  const operation = { input: { content, selection: { kind: 'generate', generationContract: ref } } } as never;
  expect(authoringOperationSchema(operation).parse(raw)).toEqual(raw);
  const output = validateAuthoringGeneration(content, raw);
  expect(output.definition.signalSources[0]?.series).toEqual([]);
  expect(output.definition.entryTrigger).toBe('rising-edge');
  expect(output).toHaveProperty('compilation.status', 'compiled');
  expect(JSON.stringify(raw)).toBe(original);
});

it.each(['description', 'tradePlan'] as const)('V6覆盖引用可选根字段时要求该字段实际存在：%s', async (path) => {
  const content = planAuthoringContent(false);
  const schema = authoringOperationSchema({
    input: { content, selection: { kind: 'generate', generationContract: ref } },
  } as never);
  const format = await generationOutput('native_schema', schema, ref).responseFormat;
  if (format?.type !== 'json' || !format.schema) throw new Error('缺少原生输出合同');
  const require = createRequire(import.meta.url);
  const Ajv = require(require.resolve('ajv', { paths: [require.resolve('eslint')] })) as new (
    options: object,
  ) => { compile: (schema: unknown) => (value: unknown) => boolean };
  const native = new Ajv({ strictKeywords: true }).compile(format.schema);
  expect(Object.keys(format.schema.properties ?? {})).toEqual(['proposal', 'intentCheck']);

  const present = wire();
  Object.assign(present.proposal.definition, { description: '冻结资料' });
  present.proposal.coverage[0]!.definitionPaths = [path];
  expect(native(present)).toBe(true);
  expect(schema.parse(present)).toEqual(present);
  expect(validateAuthoringGeneration(content, present).coverage).toEqual(present.proposal.coverage);

  const absent = structuredClone(present);
  Reflect.deleteProperty(absent.proposal.definition, path);
  expect(native(absent)).toBe(false);
  expect(() => validateAuthoringGeneration(content, absent)).toThrow('需求引用未对应实际定义');
  expect(schema.safeParse(absent).success).toBe(false);
  absent.proposal.coverage[0]!.definitionPaths = ['entry'];
  expect(native(absent)).toBe(true);
  expect(schema.parse(absent)).toEqual(absent);
});

it('V6分钟编写公开已确认的下一可交易根，不把日线时钟套到分钟策略', () => {
  const content = planAuthoringContent(false);
  content.confirmation!.timeframe = '1m';
  const messages = authoringMessages({
    revision: 1,
    input: { content, selection: { kind: 'generate', intent: content.description, generationContract: ref } },
  } as never);
  const request = JSON.parse(messages[1]!.content);
  expect(request.content).toEqual(content);
  expect(request.executionClock).toBe('下一根可交易的1分钟K线开盘，可以在本交易日');
  expect(messages[0]!.content).toContain('没有原价要求的指标、会话累计与相对比例用research');
});

it('V6计划修改的即时与延迟两种参考均经过实际合同，交易距离相同', () => {
  const before = fixedAuthoringPlan(false);
  delete before.tradePlan;
  const content = { ...planAuthoringContent(false), definitionText: JSON.stringify(before) };
  const selection = { kind: 'modify', intent: '只修改保护计划', modificationTarget: 'tradePlan',
    generationContract: aiGenerationContracts.authoringModification.ref } as const;
  const operation = { revision: 1, input: { content, selection } } as never;
  const messages = authoringMessages(operation);
  const schema = authoringOperationSchema(operation);
  const examples = backtestProtectionExamplesV6();
  expect(messages[0]!.content).toContain(JSON.stringify(examples));
  expect(messages[0]!.content).toContain('收盘价达到或低于止损线（含等于）');
  expect(messages[0]!.content).not.toContain('EXPRESSION_V6_REFERENCE_JSON');
  const raw = wire();
  for (const tradePlan of Object.values(examples)) {
    const candidate = { ...raw, proposal: { ...raw.proposal,
      definition: { ...raw.proposal.definition, tradePlan },
    } };
    expect(schema.parse(candidate)).toEqual(candidate);
    expect(validateAuthoringModification(content, selection, candidate).definition.tradePlan).toEqual(tradePlan);
  }
});

it('仅加止损先物化旧普通策略政策，派生字段不误报为越权修改', () => {
  const before = fixedAuthoringPlan(false); delete before.tradePlan;
  const content = { ...planAuthoringContent(false), definitionText: JSON.stringify(before) };
  const selection = { kind: 'modify', intent: '只增加首笔成交价下方5%保护', modificationTarget: 'tradePlan',
    generationContract: aiGenerationContracts.authoringModification.ref } as const;
  const raw = wire(); delete (raw.proposal.definition as { entryTrigger?: string }).entryTrigger;
  raw.proposal.definition.entryTrigger = 'rising-edge';
  const operation = { input: { content, selection } } as never;
  expect(authoringOperationSchema(operation).safeParse(raw).success).toBe(true);
  expect(validateAuthoringModification(content, selection, raw).definition.entryTrigger).toBe('rising-edge');
  raw.proposal.definition.entryTrigger = 'while-flat';
  expect(() => validateAuthoringModification(content, selection, raw)).toThrow('授权范围以外');
});

it.each([false, true])('单次离线SDK接收保留原始wire与独立编译诊断，非法=%s', async (invalid) => {
  const raw = wire();
  if (invalid) raw.proposal.definition.entry = { type: 'compare', operator: 'gt',
    left: { type: 'series', sourceId: 'undeclared', field: 'close' }, right: { type: 'eventValue' } } as never;
  const provider = { metadata: {}, sdkRuntime: () => ({ baseURL: 'http://unused.invalid', apiKey: 'fixture', authMode: 'none' }) };
  const operation = { id: 'operation', ownerId: 'owner', attempt: 1, revision: 1, startedAt: new Date(),
    input: { content: planAuthoringContent(false), selection: { kind: 'generate', generationContract: ref,
      providerId: 'fixture', model: 'fixture', intent: '使用确认规则', configurationFingerprint: 'configuration',
      pricingFingerprint: authoringPricingFingerprint(provider as never, 'fixture') } } };
  const sdk = { generate: vi.fn(async () => ({ output: raw, usage: null, actualModel: 'fixture', providerCost: null, providerCostCurrency: null })) };
  const registry = { strictReadyContract: vi.fn(() => ({ provider, execution: { mode: 'native_schema', adapter: 'openai-chat',
    liveValidation: { status: 'passed' }, readiness: { configurationFingerprint: 'configuration' } } })) };
  const result = await new AuthoringAttemptRunner(operation as never, new AbortController().signal, {
    sdk, registry, operations: { renew: vi.fn(async () => true) }, providers: { refreshRegistry: vi.fn() },
    audit: { prepare: vi.fn(), append: vi.fn() },
  } as never).run();
  expect(sdk.generate).toHaveBeenCalledTimes(1);
  expect(result.outputText).toBe(JSON.stringify(raw));
  expect(result.compilation?.status).toBe(invalid ? 'rejected' : 'compiled');
  expect(result.errorCode).toBe(invalid ? 'STRATEGY_COMPILATION_INVALID' : null);
  if (invalid) expect(result.compilation?.diagnostics.map((issue) => issue.code)).toEqual(expect.arrayContaining(['UNDECLARED_SOURCE', 'EVENT_VALUE_UNBOUND']));
});
