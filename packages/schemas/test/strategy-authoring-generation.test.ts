import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aiGenerationContracts, aiGenerationContractRefSchema } from '../src/ai-execution.js';
import { strategySchema } from '../src/backtest-strategy.js';

const sample = () => strategySchema.parse(JSON.parse(
  readFileSync(new URL('../fixtures/strategy-authoring.exchange.json', import.meta.url), 'utf8'),
));

const question = { id: 'instrument', basedOnRevision: 1, quote: '某个标的', reason: '目录存在歧义',
  options: [], dependsOn: [], answer: null, answerState: 'unanswered' };
describe('策略编写独立用途合同', () => {
  it('三个合同分别注册并拒绝历史或错误版本', () => {
    for (const contract of [aiGenerationContracts.authoringAnalysis, aiGenerationContracts.authoringGeneration, aiGenerationContracts.authoringModification]) {
      expect(aiGenerationContractRefSchema.safeParse(contract.ref).success).toBe(true);
      expect(aiGenerationContractRefSchema.safeParse({ ...contract.ref, version: 'research-generation-v1' }).success).toBe(false);
    }
  });
  it('分析不能替用户确认问题、删除需求或重复标识', () => {
    const base = { requirements: [], questions: [question], runtimeIntents: [] };
    const schema = aiGenerationContracts.authoringAnalysis.schema;
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, questions: [{ ...question, answer: '已确认', answerState: 'confirmed' }] }).success).toBe(false);
    expect(schema.safeParse({ ...base, questions: [question, question] }).success).toBe(false);
    expect(schema.safeParse({ ...base, requirements: [{ id: 'exit', quote: '未知退出', interpretation: '', state: 'removed', definitionPaths: [] }] }).success).toBe(false);
    expect(schema.safeParse({ ...base, ownerId: 'forged' }).success).toBe(false);
  });
  it('生成与修改只携带策略定义和覆盖映射，不能携带执行指令', () => {
    const compiled = sample();
    const definition = { ...compiled, entryTrigger: 'rising-edge', signalSources: compiled.signalSources.map((source) => Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'series'))) };
    for (const contract of [aiGenerationContracts.authoringGeneration, aiGenerationContracts.authoringModification]) {
      expect(contract.schema.safeParse({ definition, coverage: [] }).success).toBe(true);
      expect(contract.schema.safeParse({ definition, coverage: [], runBacktest: true }).success).toBe(false);
      expect(contract.schema.safeParse({ definition: 'arbitrary-code', coverage: [] }).success).toBe(false);
    }
  });
  it('生成和修改均拒绝退役的策略定义版本', () => {
    const compiled = sample();
    const definition = {
      ...compiled,
      schemaVersion: '3',
      entryTrigger: 'rising-edge',
      signalSources: compiled.signalSources.map(({ series, ...source }) => source),
    };
    for (const contract of [aiGenerationContracts.authoringGeneration, aiGenerationContracts.authoringModification])
      expect(contract.schema.safeParse({ definition, coverage: [] }).success).toBe(false);
  });
});
