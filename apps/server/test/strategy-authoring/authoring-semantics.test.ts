import { describe, expect, it } from 'vitest';
import { authoringContentSchema, type AuthoringContent } from '@thesis-ledger/schemas';
import {
  authoringGenerationIssues,
  invalidateAuthoringConfirmations,
  validateAuthoringGeneration,
} from '../../src/strategy-authoring/authoring-semantics.js';

const asset = { symbol: '159516.SZ', market: 'CN', assetType: 'etf' } as const;
const definition = {
  schemaVersion: '2',
  name: '明确确认样本',
  executionInstrument: asset,
  primaryTimeframe: '1d',
  signalSources: [{ id: 'price', asset, timeframe: '1d', series: ['close'] }],
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'price', field: 'close' },
    right: { type: 'constant', value: '1' },
  },
  exit: {
    type: 'compare',
    operator: 'lt',
    left: { type: 'series', sourceId: 'price', field: 'close' },
    right: { type: 'constant', value: '1' },
  },
  sizing: { type: 'fixedQuantity', quantity: '100' },
  risk: [{ type: 'fixedStop', percent: '0.05' }],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0.0003', slippageRate: '0.001' },
};
const complete = (): AuthoringContent =>
  authoringContentSchema.parse({
    title: '确认样本',
    description: '价格大于一时买入',
    questions: [],
    requirements: [
      {
        id: 'entry',
        quote: '价格大于一时买入',
        interpretation: '明确入场',
        state: 'understood',
        definitionPaths: ['entry'],
      },
    ],
    runtimeIntents: [],
    removedRequirements: [],
    definitionText: '',
    manualChanges: [],
    confirmation: {
      instrumentId: 'catalog-id',
      instrument: asset,
      timeframe: '1d',
      entrySummary: '价格大于一时买入',
      exitSummary: '价格小于一时卖出',
      sizing: definition.sizing,
      risk: definition.risk,
      noExtraRiskConfirmed: false,
      execution: definition.execution,
      cost: definition.cost,
      periodsAreBarsConfirmed: true,
    },
  });
const output = () => ({
  definition: structuredClone(definition),
  coverage: [{ requirementId: 'entry', definitionPaths: ['entry'] }],
});

describe('编写服务端确认与语义约束', () => {
  it('人工确认不能绕过明确并行交易代码的门禁；明确移除保留原文后才可继续', () => {
    const content = complete();
    content.description = '同时交易159516.SZ和510300.SH。';
    content.requirements[0]!.quote = content.description;
    expect(authoringGenerationIssues(content).join()).toContain('首期仅支持单标的');
    expect(() => validateAuthoringGeneration(content, output())).toThrow();
    expect(invalidateAuthoringConfirmations(content, content).requirements[0]!.state).toBe(
      'unsupported',
    );
    content.requirements[0]!.state = 'removed';
    content.removedRequirements = [content.description];
    expect(authoringGenerationIssues(content)).toEqual([]);
  });
  it.each([
    '同时交易159516.SZ和159516.SZ。',
    '不同时交易159516.SZ和510300.SH。',
    '159516.SZ和510300.SH选一个交易。',
  ])('单标的、明确否定或候选选择不被并行交易检查误判：%s', (quote) => {
    const content = complete();
    content.description = quote;
    content.requirements[0]!.quote = quote;
    expect(authoringGenerationIssues(content)).toEqual([]);
  });
  it('人工扩写或替换引用不能夹带原描述和确认答案之外的要求', () => {
    const content = complete();
    content.requirements[0]!.quote += '，模型虚构规则';
    expect(authoringGenerationIssues(content).join()).toContain('需求原文必须来自当前描述');
    expect(() => validateAuthoringGeneration(content, output())).toThrow();
  });
  it('旧草稿可读取，但缺少交易确认不能生成', () => {
    const content = complete();
    delete content.confirmation;
    expect(authoringContentSchema.safeParse(content).success).toBe(true);
    expect(authoringGenerationIssues(content)).not.toEqual([]);
    expect(() => validateAuthoringGeneration(content, output())).toThrow();
  });
  it('明确约束及真实覆盖完整时接受定义', () => {
    expect(validateAuthoringGeneration(complete(), output()).definition).toEqual(definition);
  });
  it.each(['sizing', 'risk', 'cost', 'executionInstrument', 'primaryTimeframe'])(
    'Schema 合法也不能改变确认字段 %s',
    (field) => {
      const result = output();
      const changed: Record<string, unknown> = {
        sizing: { type: 'fixedQuantity', quantity: '200' },
        risk: [],
        cost: { commissionRate: '0', slippageRate: '0' },
        executionInstrument: { ...asset, symbol: '510300.SH' },
        primaryTimeframe: '5m',
      };
      Object.assign(result.definition, { [field]: changed[field] });
      expect(() => validateAuthoringGeneration(complete(), result)).toThrow();
    },
  );
  it('拒绝遗漏原文、重复或虚构需求及不存在的覆盖路径', () => {
    const content = complete();
    content.description += '；保留另一个限制';
    expect(authoringGenerationIssues(content).join()).toContain('遗漏原文');
    for (const coverage of [
      [],
      [{ requirementId: 'entry', definitionPaths: ['missing'] }],
      [{ requirementId: 'invented', definitionPaths: ['entry'] }],
      [output().coverage[0], output().coverage[0]],
    ]) {
      expect(() => validateAuthoringGeneration(complete(), { ...output(), coverage })).toThrow();
    }
  });
  it('不支持项、未回答问题与未经明确移除不能生成', () => {
    const content = complete();
    content.requirements[0]!.state = 'unsupported';
    expect(authoringGenerationIssues(content).length).toBeGreaterThan(0);
    content.requirements[0]!.state = 'removed';
    expect(authoringGenerationIssues(content).join()).toContain('移除');
  });
  it('修改描述保留答案但撤销确认；上游答案变化传播依赖失效', () => {
    const content = complete();
    content.questions = ['a', 'b'].map((id) => ({
      id,
      basedOnRevision: 1,
      quote: '',
      reason: '确认条件',
      options: [],
      dependsOn: id === 'b' ? ['a'] : [],
      answer: '原值',
      answerState: 'confirmed',
    }));
    const changed = structuredClone(content);
    changed.description = '新描述';
    const invalid = invalidateAuthoringConfirmations(content, changed);
    expect(invalid.confirmation).toBeNull();
    expect(invalid.questions.every((question) => question.answerState === 'needs_review')).toBe(
      true,
    );
    const answered = structuredClone(content);
    answered.questions[0]!.answer = '新值';
    expect(invalidateAuthoringConfirmations(content, answered).questions[1]!.answerState).toBe(
      'needs_review',
    );
  });
  it('空风险和未确认周期单位不能进入共享确认合同', () => {
    const content = complete();
    content.confirmation!.risk = [];
    expect(authoringContentSchema.safeParse(content).success).toBe(false);
    content.confirmation!.noExtraRiskConfirmed = true;
    expect(authoringContentSchema.safeParse(content).success).toBe(true);
    expect(
      authoringContentSchema.safeParse({
        ...content,
        confirmation: { ...content.confirmation, periodsAreBarsConfirmed: false },
      }).success,
    ).toBe(false);
  });
  it('手动改定义撤销确认并要求审核，格式变化和内部已确认应用保持语义', () => {
    const before = { ...complete(), definitionText: JSON.stringify(definition) };
    const changed = {
      ...before,
      definitionText: JSON.stringify({
        ...definition,
        risk: [{ type: 'fixedStop', percent: '0.03' }],
      }),
    };
    expect(invalidateAuthoringConfirmations(before, changed)).toMatchObject({
      confirmation: null,
      requirements: [{ state: 'unresolved' }],
    });
    expect(invalidateAuthoringConfirmations(before, changed, true).confirmation).toEqual(
      before.confirmation,
    );
    expect(
      invalidateAuthoringConfirmations(before, {
        ...before,
        definitionText: JSON.stringify(definition, null, 2),
      }).confirmation,
    ).toEqual(before.confirmation);
  });
  it('客户端自行写入的问题依赖也不能缺失或成环', () => {
    const question = {
      id: 'a',
      basedOnRevision: 1,
      quote: '',
      reason: '',
      options: [],
      dependsOn: ['missing'],
      answer: null,
      answerState: 'unanswered',
    };
    expect(authoringContentSchema.safeParse({ ...complete(), questions: [question] }).success).toBe(
      false,
    );
    expect(
      authoringContentSchema.safeParse({
        ...complete(),
        questions: [{ ...question, dependsOn: ['a'] }],
      }).success,
    ).toBe(false);
  });
});
