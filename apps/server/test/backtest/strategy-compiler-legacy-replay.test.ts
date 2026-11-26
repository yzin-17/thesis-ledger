import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { optimizationDiscoveryGenerationOutputSchema } from '@thesis-ledger/schemas';
import { compileBacktestStrategy } from '../../src/backtest/backtest-strategy-compiler.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';

const evidenceRoot = resolve('../../var/acceptance/strategy-expression-model-root-cause-live-20261120');
const reviewPath = resolve(evidenceRoot, 'semantic-review.json');
const outputRoot = resolve('../../var/acceptance/backtest-practical-20261120');
const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

it.skipIf(!existsSync(reviewPath))('只读重放四份真实旧失败回执，机械适配不改AST、capture、lag或锚点', () => {
  const reviewBefore = readFileSync(reviewPath);
  const review = JSON.parse(reviewBefore.toString()) as { 样本: Array<{ id: string; 语义通过: boolean;
    原始回执: string; 回执SHA256: string; 模型原始输出: ReturnType<typeof optimizationDiscoveryGenerationOutputSchema.parse> }> };
  const results = review.样本.filter((sample) => !sample.语义通过).map((sample) => {
    const receiptPath = resolve(evidenceRoot, sample.原始回执), before = readFileSync(receiptPath);
    expect(sha(before)).toBe(sample.回执SHA256);
    const input = JSON.parse(readFileSync(receiptPath.replace(/\.json$/u, '-input.json'), 'utf8')) as {
      messages: Array<{ content: string }>;
    };
    const prefix = 'DISCOVERY_REQUEST_JSON:';
    const message = input.messages.find((item) => item.content.startsWith(prefix));
    if (!message) throw new Error('历史冻结输入缺少探索事实');
    const request = JSON.parse(message.content.slice(prefix.length)) as { scope: Parameters<typeof createDiscoverySeed>[0];
      frozenSource: { id: string }; inheritedExecution: unknown; frozenCost: unknown };
    // 仅展开原V5明确的主源及附加源继承合同；不是V6模型实际响应。
    const seed = createDiscoverySeed(request.scope, true), raw = sample.模型原始输出;
    const { series, additionalSources, ...rules } = raw.strategy;
    const primary = seed.signalSources[0]!;
    const source = { id: request.frozenSource.id, asset: primary.asset, timeframe: primary.timeframe, priceCoordinate: primary.priceCoordinate };
    const outline = { ...rules, schemaVersion: seed.schemaVersion, entryTrigger: 'rising-edge',
      signalSources: [source, ...(additionalSources ?? []).map((item) => ({ ...source, id: item.id, timeframe: item.timeframe }))],
      executionInstrument: request.scope.executionInstrument, primaryTimeframe: request.scope.primaryTimeframe,
      execution: rules.execution ?? request.inheritedExecution, cost: request.frozenCost };
    const result = compileBacktestStrategy(outline);
    if (result.candidate) {
      expect(result.candidate.entry).toEqual(raw.strategy.entry);
      expect(result.candidate.exit).toEqual(raw.strategy.exit);
    }
    if (['count-confirmation', 'statistics-gap'].includes(sample.id)) {
      expect(result.status, JSON.stringify(result.diagnostics)).toBe('compiled');
      expect(series).not.toContain('open');
      expect(result.definition?.signalSources[0]?.series).toContain('open');
    } else if (sample.id === 'captured-retest') {
      expect(result.status).toBe('rejected');
      expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'EVENT_VALUE_UNBOUND' })]));
      expect(result.candidate?.entry).not.toHaveProperty('capture');
      expect(result.candidate?.signalSources[0]?.series).toContain('high');
    } else if (sample.id === 'timeframes-anchor') {
      expect(result.status).toBe('rejected');
      expect(result.diagnostics.filter((issue) => issue.path.includes('anchorAt'))).toHaveLength(2);
      expect(result.candidate).toBeUndefined();
    }
    expect(readFileSync(receiptPath)).toEqual(before);
    return { 样本: sample.id, 原回执SHA256: sha(before), 原判定: '未通过', 旧合同结构有效: optimizationDiscoveryGenerationOutputSchema.safeParse(raw).success,
      兼容适配: '仅展开旧V5固定事实和来源继承，补入旧路径原政策，去除重复字段声明',
      编译状态: result.status, 诊断: result.diagnostics, 原AST未修改: true, 新模型调用: 0 };
  });
  expect(results).toHaveLength(4);
  expect(readFileSync(reviewPath)).toEqual(reviewBefore);
  if (existsSync(outputRoot)) writeFileSync(resolve(outputRoot, 't07-legacy-failure-replay.json'), JSON.stringify({ 旧证据未修改: true,
    说明: '只证明新编译器兼容能力；不改变旧业务失败或模型成功统计，未证明模型能按V6生成正确策略。', 样本: results }, null, 2));
});
