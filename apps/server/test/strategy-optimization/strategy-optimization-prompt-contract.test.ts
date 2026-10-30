import { describe, expect, it, vi } from 'vitest';
import { optimizationDiscoveryGenerationOutputSchema } from '@thesis-ledger/schemas';
import { strategyOptimizationPrompt } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { createNormalizedRunConfig } from './strategy-optimization-postgres-fixtures.js';

const scope = {
  executionInstrument: { symbol: '600519.SH', market: 'CN' as const, assetType: 'stock' as const },
  primaryTimeframe: '1d' as const,
};

const messagesFor = (sourceMode: 'existing' | 'discovery', useSdkContract = true) =>
  strategyOptimizationPrompt({
    prisma: { $queryRaw: vi.fn(async () => []) } as never,
    experiment: {
      id: '11111111-1111-4111-8111-111111111111',
      sourceMode,
      allowedParameterIds: [],
      objective: { mode: 'balanced', minClosedTrades: 1 },
      runConfig: createNormalizedRunConfig(),
      baselineMetrics: {},
      discoveryScope: scope,
      strategySpaceVersion: 'strategy-space-v1',
    } as never,
    strategy: createDiscoverySeed(scope),
    descriptors: [],
    modelKey: 'fixture',
    round: 1,
    useSdkContract,
  });

describe('优化业务输出合同提示', () => {
  it('探索实际消息提供精简合同、series 枚举和递归表达式定义', async () => {
    const messages = await messagesFor('discovery');
    const system = messages.find((message) => message.role === 'system')!.content;

    expect(system).toContain('OUTPUT_CONTRACT:strategy_discovery/strategy-discovery-v2');
    const schema = JSON.parse(system.split('OUTPUT_JSON_SCHEMA:')[1]!);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.strategy.additionalProperties).toBe(false);
    expect(schema.properties.strategy.properties.series.items.enum).toEqual([
      'open',
      'high',
      'low',
      'close',
      'volume',
      'nav',
    ]);
    expect(schema.$defs).toBeDefined();
    expect(schema.properties.strategy.properties).not.toHaveProperty('executionInstrument');
    const user = messages.find((message) => message.role === 'user')!.content;
    const request = JSON.parse(user.slice(user.indexOf(':') + 1));
    const example = optimizationDiscoveryGenerationOutputSchema.parse(request.outputExample);
    expect(Object.keys(example.strategy).sort()).toEqual([
      'entry',
      'exit',
      'name',
      'risk',
      'series',
      'sizing',
    ]);
    expect(example.strategy).not.toHaveProperty('cost');
    expect(example.strategy).not.toHaveProperty('execution');
    expect(system).toContain('绝对价格');
    expect(system).toContain('转换证据');
    expect(Buffer.byteLength(JSON.stringify(messages), 'utf8')).toBeLessThan(10_000);
  });

  it('参数优化实际消息提供参数提案合同及必需 reason', async () => {
    const messages = await messagesFor('existing');
    const system = messages.find((message) => message.role === 'system')!.content;

    expect(system).toContain('OUTPUT_CONTRACT:parameter_optimization/optimization-parameter-v1');
    const schema = JSON.parse(system.split('OUTPUT_JSON_SCHEMA:')[1]!);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(expect.arrayContaining(['changes', 'reason']));
    expect(schema.properties.changes.items.required).toEqual(
      expect.arrayContaining(['parameterId', 'value']),
    );
  });

  it('旧完整探索提示保持自身输出合同', async () => {
    const messages = await messagesFor('discovery', false);

    expect(JSON.stringify(messages)).not.toContain('OUTPUT_JSON_SCHEMA:');
    expect(JSON.stringify(messages)).toContain('responseTemplate');
  });
});
