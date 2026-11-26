import { describe, expect, it } from 'vitest';
import { generationJsonSchema } from '../../src/ai/ai-generation-json-schema.js';
import { authoringMessages } from '../../src/strategy-authoring/authoring-prompt.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
import { authoringProposal } from './authoring-proposal.fixture.js';
import {
  compiledAuthoringPlan,
  fixedAuthoringPlan,
  planAuthoringContent,
} from '../backtest/trade-plan-authoring-content.fixture.js';
const operation = {
  revision: 3,
  input: {
    content: { description: '只用用户确认条件' },
    selection: { kind: 'generate', intent: '' },
  },
} as AuthoringOperation;
describe('编写生产提示的实际 AST 合同', () => {
  it('描述生成来源及交叉语义，并提供包含净值能力的现行 Schema', () => {
    const messages = authoringMessages(operation);
    expect(messages[0]!.content).toContain('sourceId');
    expect(messages[0]!.content).toContain('series集合由程序按AST派生');
    expect(messages[0]!.content).toContain('每项需求标识一次');
    expect(messages[0]!.content).toContain('native-nav');
    expect(messages[0]!.content).toContain('已确认规则');
    expect(JSON.parse(messages[1]!.content).content.description).toBe('只用用户确认条件');
    expect(messages[0]!.content).toContain('above 是前值 left<=right 且当前 left>right');
    expect(messages[0]!.content).toContain('left=价格、right=EMA、direction=above');
    expect(messages[0]!.content).toContain('left=价格、right=EMA、direction=below');
  });
});

it('两份保护需求按实际合同先覆盖再落实计划，省略计划的旧失败结果仍被拒绝', () => {
  for (const trailing of [false, true]) {
    const content = planAuthoringContent(trailing);
    const input = {
      revision: 1,
      input: { content, selection: { kind: 'generate', intent: content.description } },
    } as AuthoringOperation;
    const schema = authoringOperationSchema(input);
    const document = generationJsonSchema(schema, 'draft-7', 'ref', 'input');
    expect(Object.keys(document.properties!)).toEqual(['proposal', 'intentCheck']);
    const proposal = document.properties!.proposal as { anyOf: unknown[] };
    expect(proposal.anyOf).toHaveLength(4);
    for (const variant of proposal.anyOf)
      expect(variant).toMatchObject({
        properties: {
          coverage: {
            minItems: 1,
            maxItems: 1,
            additionalItems: false,
            items: [{ properties: { requirementId: { const: 'rules' } } }],
          },
        },
      });
    const messages = authoringMessages(input);
    expect(messages[0]!.content).toContain('activationGainPercent');
    expect(messages[0]!.content).toContain('stopBars');
    expect(JSON.parse(messages[1]!.content).intent).toBe(content.description);
    const definition = compiledAuthoringPlan(trailing);
    const coverage = [
      { requirementId: 'rules', definitionPaths: ['entry', 'sizing', 'tradePlan'] },
    ];
    const output = authoringProposal(definition, coverage);
    expect(schema.safeParse(output).success).toBe(true);
    expect(validateAuthoringGeneration(content, output).definition).toEqual(definition);
    const missing = { ...definition };
    delete missing.tradePlan;
    const missingOutput = authoringProposal(missing, coverage);
    expect(schema.safeParse(missingOutput).success).toBe(false);
    expect(() => validateAuthoringGeneration(content, missingOutput)).toThrow('需求引用未对应实际定义');
  }
});

it('冻结的无计划基线做风险修改时不新增计划字段或允许范围外计划', () => {
  const baseline = { ...compiledAuthoringPlan(false), entryTrigger: 'rising-edge' as const };
  delete baseline.tradePlan;
  const input = {
    revision: 1,
    input: {
      content: { ...planAuthoringContent(false), definitionText: JSON.stringify(baseline) },
      selection: { kind: 'modify', modificationTarget: 'risk', intent: '保持风险为空' },
    },
  } as AuthoringOperation;
  const schema = authoringOperationSchema(input);
  const coverage = [{ requirementId: 'rules', definitionPaths: ['risk'] }];
  expect(schema.safeParse(authoringProposal(baseline, coverage)).success).toBe(true);
  expect(
    schema.safeParse(authoringProposal({
      ...baseline, tradePlan: compiledAuthoringPlan(false).tradePlan,
    }, coverage)).success,
  ).toBe(false);
});

it('修改提示把旧确认标为历史来源，当前替换意图优先，原输入与范围外冻结保持', () => {
  const content = {
    ...planAuthoringContent(false),
    definitionText: JSON.stringify(fixedAuthoringPlan(false)),
  };
  const input = {
    revision: 1,
    input: {
      content,
      selection: {
        kind: 'modify',
        modificationTarget: 'tradePlan',
        intent: '取消固定保护，改为最高价回撤保护，其他不变',
      },
    },
  } as AuthoringOperation;
  const before = JSON.stringify(input);
  const messages = authoringMessages(input);
  expect(messages[0]!.content).toContain('以当前intent修改modificationTarget范围内的规则');
  expect(messages[0]!.content).toContain('其余已冻结字段原样复制，包括原入场触发政策');
  expect(messages[0]!.content).toContain('历史描述不覆盖当前修改');
  const request = JSON.parse(messages[1]!.content);
  expect(request.intent).toBe(input.input.selection.intent);
  expect(request.modificationTarget).toBe('tradePlan');
  expect(request.content).toEqual(content);
  expect(JSON.stringify(input)).toBe(before);
});
