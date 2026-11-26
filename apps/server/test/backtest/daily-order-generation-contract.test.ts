import { expect, it } from 'vitest';
import { aiGenerationContracts, optimizationObjectiveSchema } from '@thesis-ledger/schemas';
import { materializeEntryPolicy } from '@thesis-ledger/domain';
import { generationOutput } from '../../src/ai/ai-generation-output.js';
import { generationJsonSchema } from '../../src/ai/ai-generation-json-schema.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import { prepareOptimizationGeneration } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { createNormalizedRunConfig } from '../strategy-optimization/strategy-optimization-postgres-fixtures.js';
import { dailyModelCases, dailyModelContent, dailyModelModification, dailyModelDiscoveryObjective, fixedDailyModelCase } from './daily-order-model.fixture.js';
import { authoringProposal } from '../strategy-authoring/authoring-proposal.fixture.js';
import type { BacktestStrategy } from '@thesis-ledger/schemas';

type Node = Record<string, unknown>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value as Node, ...Object.values(value).flatMap(nodes)];
}
function checkOrderContract(value: unknown) {
  const document = JSON.parse(JSON.stringify(value));
  expect(nodes(document).some(node => 'contains' in node)).toBe(false);
  const resolve = (node: Node) => {
    while (typeof node.$ref === 'string') {
      const pointer = node.$ref.slice(2).split('/');
      node = pointer.reduce((parent, key) => parent[key], document);
    }
    return JSON.parse(JSON.stringify(node));
  };
  const arrays = nodes(document).filter(node => node.type === 'array' && ((node.items as Node)?.anyOf) && (node.allOf || node.prefixItems));
  expect(arrays.length).toBeGreaterThan(0);
  for (const array of arrays) {
    expect(array.minItems).toBe(2);
    const tuple = array.prefixItems ? array : (array.allOf as Node[])[0]!;
    const slots = (array.prefixItems ?? tuple.items) as Node[];
    if (!array.prefixItems) expect((array.items as Node).anyOf).toHaveLength(5);
    expect(slots).toHaveLength(2);
    expect(slots.map((slot: Node) => resolve(resolve(slot).properties.action).properties.kind.const)).toEqual(['entry', 'exit']);
    const rest = (array.prefixItems ? array.items : tuple.additionalItems) as { anyOf: Node[] };
    expect(rest.anyOf).toHaveLength(3);
    const branches = [...slots, ...rest.anyOf].map((branch: Node) => resolve(branch));
    const seen: string[] = [];
    for (const branch of branches) {
      const action = resolve(branch.properties.action);
      const kind = resolve(action.properties.kind);
      const roles = kind.enum ?? [kind.const];
      seen.push(...roles);
      expect(branch.additionalProperties).toBe(false);
      if (roles.includes('stopLoss') || roles.includes('takeProfit')) {
        expect(branch.required).toContain('parent');
        const order = resolve(branch.properties.order);
        expect(resolve(order.properties.kind).const).toBe(roles[0] === 'stopLoss' ? 'stopMarket' : 'limit');
        expect(order.required).toContain('price');
      } else {
        expect(branch.properties).not.toHaveProperty('parent');
        expect(branch.properties).not.toHaveProperty('exitGroup');
        const validity = resolve(branch.properties.validity);
        expect(validity.oneOf.map((option: Node) => resolve(resolve(option).properties.kind).const)).toEqual(['DAY', 'bars']);
      }
    }
    expect(seen.sort()).toEqual(['entry', 'exit', 'stage', 'stopLoss', 'takeProfit'].sort());
  }
}

it.each(['discovery', 'authoring', 'modification'] as const)('%s 的原生及文本参数包含同一订单组合与必需模板约束', async entry => {
  const sample = dailyModelCases.find(s => s.id === 'each-fill')!;
  const strategy = await fixedDailyModelCase(sample);
  const contract = entry === 'discovery' ? aiGenerationContracts.strategyDiscovery : entry === 'authoring' ? aiGenerationContracts.authoringGeneration : aiGenerationContracts.authoringModification;
  const content = dailyModelContent(sample, strategy, entry === 'modification');
  const selection = entry === 'modification' ? dailyModelModification(sample) : { kind: 'generate' };
  const schema = entry === 'discovery' ? contract.schema : authoringOperationSchema({ input: { content, selection: { ...selection, kind: entry === 'modification' ? 'modify' : 'generate' } } } as never);
  const native = await generationOutput('native_schema', schema, contract.ref).responseFormat;
  if (native?.type !== 'json') throw new Error('缺少原生合同');
  checkOrderContract(native.schema);
  checkOrderContract(generationJsonSchema(schema, 'draft-7', 'inline', 'input'));
  checkOrderContract(generationJsonSchema(schema, 'draft-2020-12', 'ref', 'input'));
  const versions = {
    discovery: 'strategy-discovery-generation-v1',
    authoring: 'strategy-authoring-generation-v1',
    modification: 'strategy-authoring-modification-v1',
  };
  expect(contract.ref.version).toBe(versions[entry]);
});

it('局部修改范围外的历史订单顺序保持冻结，不改成生成槽位', async () => {
  const sample = dailyModelCases.find(s => s.id === 'close')!;
  const strategy = await fixedDailyModelCase(sample);
  if (strategy.execution.timing !== 'dailyBarOrders') throw new Error('夹具');
  strategy.execution.orders.reverse();
  const content = dailyModelContent(sample, strategy, true);
  const schema = authoringOperationSchema({ input: { content, selection: { kind: 'modify', ...dailyModelModification(sample) } } } as never);
  const native = await generationOutput('native_schema', schema, aiGenerationContracts.authoringModification.ref).responseFormat;
  if (native?.type !== 'json') throw new Error('缺少原生合同');
  const frozen = nodes(native.schema).find(node => node.type === 'array' && Array.isArray(node.items) && node.items[0]?.properties?.action?.properties?.kind?.const === 'exit');
  expect(frozen).toMatchObject({ minItems: 2, maxItems: 2, additionalItems: false });
  const raw = authoringProposal(materializeEntryPolicy(strategy), [
    { requirementId: 'rules', definitionPaths: ['tradePlan'] },
  ]);
  const result = schema.parse(raw) as { proposal: { definition: Pick<BacktestStrategy, 'execution'> } };
  expect(result.proposal.definition.execution).toEqual(strategy.execution);
});

it('独立发现意图夹具实际消息允许零笔平仓，生产默认值仍为一笔', async () => {
  const strategy = await fixedDailyModelCase(dailyModelCases[0]);
  const scope = { executionInstrument: strategy.executionInstrument, primaryTimeframe: strategy.primaryTimeframe };
  const prepared = await prepareOptimizationGeneration({
    prisma: { $queryRaw: async () => [] } as never,
    experiment: { id: 'daily-intent-fixture', sourceMode: 'discovery', allowedParameterIds: [], objective: dailyModelDiscoveryObjective, runConfig: createNormalizedRunConfig(), discoveryScope: scope, strategySpaceVersion: 'strategy-space-v1' } as never,
    strategy: createDiscoverySeed(scope, true), descriptors: [], modelKey: 'fixture', round: 1, useSdkContract: true, generationMode: 'native_schema',
  });
  const user = prepared.messages.find(message => message.role === 'user')!.content;
  const request = JSON.parse(user.slice(user.indexOf(':') + 1));
  expect(request.objective).toEqual({ mode: 'balanced', minClosedTrades: 0 });
  expect(optimizationObjectiveSchema.parse({ mode: 'balanced' }).minClosedTrades).toBe(1);
});
