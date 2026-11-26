import { parse as parseYaml } from 'yaml';
import { buildGenerationSchemaPrompt } from '../../src/ai/ai-generation-schema-prompt.js';
import { withoutSchemaAnnotations } from '../../src/ai/ai-generation-schema-annotations.js';
import { describe, expect, it, vi } from 'vitest';
import { aiGenerationContracts, type AiGenerationMode } from '@thesis-ledger/schemas';
import {
  generationInputBytes,
  generationOutput,
  validateGenerationRequest,
} from '../../src/ai/ai-generation-output.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import {
  prepareOptimizationGeneration,
  strategyOptimizationPrompt,
} from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { createNormalizedRunConfig } from './strategy-optimization-postgres-fixtures.js';

type SchemaNode = {
  $ref?: string;
  properties: Record<string, SchemaNode>;
  items: SchemaNode;
  const?: unknown;
  enum?: unknown;
  additionalProperties?: boolean;
};

const scope = {
  executionInstrument: { symbol: '600519.SH', market: 'CN' as const, assetType: 'stock' as const },
  primaryTimeframe: '1d' as const,
};

const inputFor = (
  sourceMode: 'existing' | 'discovery',
  useSdkContract = true,
  generationMode: AiGenerationMode = 'native_schema',
) => ({
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
  generationMode,
});

const messagesFor = (...args: Parameters<typeof inputFor>) =>
  strategyOptimizationPrompt(inputFor(...args));

function discoveryReply(execution?: unknown) {
  return {
    reason: '独立序列化样本',
    strategy: {
      name: '独立样本',
      signalSources: [{ id: 'discovery-primary', timeframe: '1d', priceCoordinate: 'research' }],
      entryTrigger: 'rising-edge',
      entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
      exit: {
        type: 'compare',
        operator: 'eq',
        left: { type: 'constant', value: '0' },
        right: { type: 'constant', value: '1' },
      },
      sizing: { type: 'percentOfEquity', percent: '0.3' },
      risk: [],
      ...(execution === undefined ? {} : { execution }),
    },
    evidenceRefs: [],
  };
}

describe('优化业务输出合同提示', () => {
  it.each([true, false])('探索消息明确左右主语、方向及等价交换（精简=%s）', async (sdk) => {
    const messages = await messagesFor('discovery', sdk);
    const system = messages[0]!.content;
    expect(system).toContain('above 是前值 left<=right 且当前 left>right');
    expect(system).toContain('left=价格、right=EMA、direction=above');
    expect(system).toContain('left=价格、right=EMA、direction=below');
    expect(system).toContain('同时反转 direction');
  });

  it('原生探索消息去重，SDK 仍发送具名合同的来源坐标及递归定义', async () => {
    const messages = await messagesFor('discovery');
    const system = messages.find((message) => message.role === 'system')!.content;

    expect(system).toContain('OUTPUT_CONTRACT:strategy_discovery/strategy-discovery-generation-v1');
    expect(system).not.toContain('OUTPUT_JSON_SCHEMA:');
    const contract = aiGenerationContracts.strategyDiscovery;
    const format = await generationOutput('native_schema', contract.schema, contract.ref)
      .responseFormat;
    if (format?.type !== 'json' || !format.schema) throw new Error('缺少原生 Schema');
    const document = JSON.parse(JSON.stringify(format.schema)) as SchemaNode & {
      anyOf?: SchemaNode[];
      $defs?: Record<string, SchemaNode>;
      definitions?: Record<string, SchemaNode>;
    };
    const definitions = document.$defs ?? document.definitions;
    if (!definitions) throw new Error('缺少递归定义');
    const branches = (document.anyOf ?? [document]).map((branch: SchemaNode) =>
      branch.$ref ? definitions[branch.$ref.split('/').at(-1)!]! : branch,
    );
    const schema = branches.find((branch: SchemaNode) => branch.properties?.strategy);
    if (!schema) throw new Error('缺少成功策略分支');
    const gap = branches.find(
      (branch: SchemaNode) => branch.properties?.status?.const === 'unsupported',
    );
    expect(gap?.additionalProperties).toBe(false);
    expect(gap?.properties).not.toHaveProperty('strategy');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.strategy!.additionalProperties).toBe(false);
    const source = schema.properties.strategy!.properties.signalSources!.items;
    const sourceShape = source.$ref ? definitions[source.$ref.split('/').at(-1)!]! : source;
    expect(sourceShape.properties).toHaveProperty('priceCoordinate');
    expect(sourceShape.properties).toHaveProperty('timeframe');
    expect(sourceShape.properties).not.toHaveProperty('series');
    expect(definitions).toBeDefined();
    expect(schema.properties.strategy!.properties).not.toHaveProperty('executionInstrument');
    const user = messages.find((message) => message.role === 'user')!.content;
    const request = JSON.parse(user.slice(user.indexOf(':') + 1));
    expect(request).not.toHaveProperty('outputExample');
    expect(request).not.toHaveProperty('semanticVersion');
    expect(request.frozenSource.id).toBe('discovery-primary');
    expect(request.inheritedExecution).toEqual(inputFor('discovery').strategy.execution);
    expect(request.frozenCost).toEqual(inputFor('discovery').strategy.cost);
    expect(system).toContain('用户明确指定本次模拟执行坐标中的委托触发价时，同坐标直接使用该价位');
    expect(system).toContain('转换证据');
    expect(schema.properties.strategy!.properties).toHaveProperty('tradePlan');
    expect(schema.properties.strategy!.properties).toHaveProperty('execution');
    const successWithDefault = discoveryReply(request.inheritedExecution);
    expect(contract.schema.safeParse(successWithDefault).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(messages), 'utf8')).toBeLessThan(16_000);
  });

  it('文本模式保留完整合同与预检，原生预算另外计入同一输出格式', async () => {
    const contract = aiGenerationContracts.strategyDiscovery;
    const native = await messagesFor('discovery');
    const text = await messagesFor('discovery', true, 'json_validated');
    const input = {
      requestId: '11111111-1111-4111-8111-111111111111',
      adapter: 'openai-compatible-chat' as const,
      contract: contract.ref,
      schema: contract.schema,
    };
    expect(() =>
      validateGenerationRequest({ ...input, mode: 'native_schema', messages: native }),
    ).not.toThrow();
    expect(() =>
      validateGenerationRequest({ ...input, mode: 'json_validated', messages: native }),
    ).toThrow();
    expect(() =>
      validateGenerationRequest({ ...input, mode: 'json_validated', messages: text }),
    ).not.toThrow();
    const schemaText = text[0]!.content.split('OUTPUT_JSON_SCHEMA_YAML:')[1]!.split('\n')[0]!;
    const original = buildGenerationSchemaPrompt(contract.schema, 'ref');
    const assertions = withoutSchemaAnnotations(JSON.parse(original.split('OUTPUT_JSON_SCHEMA:')[1]!));
    expect(parseYaml(schemaText)).toStrictEqual(assertions);
    const tampered = text.map((message) => ({
      ...message,
      content: message.content.replace(/OUTPUT_JSON_SCHEMA_YAML:(.)/u, 'OUTPUT_JSON_SCHEMA_YAML:$1broken: true,'),
    }));
    expect(() =>
      validateGenerationRequest({ ...input, mode: 'json_validated', messages: tampered }),
    ).toThrow('缺少当前输出合同');
    expect(native.at(-1)).toEqual(text.at(-1));
    const format = await generationOutput('native_schema', contract.schema, contract.ref)
      .responseFormat;
    const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
    expect(await generationInputBytes(native, 'native_schema', contract.schema, contract.ref)).toBe(
      bytes(native) + bytes(format),
    );
    expect(await generationInputBytes(text, 'json_validated', contract.schema, contract.ref)).toBe(
      bytes(text),
    );
    const prepared = await prepareOptimizationGeneration(inputFor('discovery'));
    expect(prepared.messages).toEqual(native);
    expect(prepared.inputTokenReservation).toBe(bytes(native) + bytes(format));
  });

  it.each(['native_schema', 'json_validated'] as const)(
    '发现 SDK 请求、额度与结果校验（%s）',
    async (mode) => {
      const contract = aiGenerationContracts.strategyDiscovery;
      const { messages } = await prepareOptimizationGeneration(inputFor('discovery', true, mode));
      const raw = discoveryReply();
      let reply: unknown = raw;
      let body: unknown;
      const httpClient = vi.fn<typeof fetch>(async (_url, init) => {
        body = JSON.parse(init!.body as string);
        return new Response(
          JSON.stringify({
            id: 'fixture',
            created: 0,
            model: 'fixture',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: JSON.stringify(reply) },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      });
      const generate = () =>
        new AiSdkGenerationAdapter().generate({
          requestId: '11111111-1111-4111-8111-111111111111',
          adapter: 'openai-compatible-chat',
          providerId: 'fixture',
          baseURL: 'https://unused.invalid/v1',
          authMode: 'none',
          apiKey: '',
          model: 'fixture',
          messages,
          contract: contract.ref,
          schema: contract.schema,
          mode,
          transport: 'single',
          maxOutputTokens: 2048,
          timeout: { totalMs: 5000 },
          signal: new AbortController().signal,
          httpClient,
        });
      const result = await generate();
      expect(httpClient).toHaveBeenCalledOnce();
      const sent = JSON.parse(JSON.stringify(body));
      expect(result.output).toEqual(contract.schema.parse(raw));
      expect(sent.messages).toEqual(messages);
      const frozen = JSON.parse(sent.messages[1].content.replace('DISCOVERY_REQUEST_JSON:', ''));
      expect(frozen.inheritedExecution).toEqual(inputFor('discovery').strategy.execution);
      expect(frozen.frozenCost).toEqual(inputFor('discovery').strategy.cost);
      expect(sent).toMatchObject({ model: 'fixture', max_tokens: 2048 });
      if (mode === 'json_validated') {
        expect(sent).not.toHaveProperty('response_format');
        reply = { ...raw, strategy: { ...raw.strategy, signalSources: [{ id: 'discovery-primary', timeframe: '1d', priceCoordinate: 'unknown' }] } };
        await expect(generate()).rejects.toMatchObject({
          fact: { code: 'schema_invalid', phase: 'validation' },
        });
        return;
      }
      expect(JSON.stringify(sent.messages)).not.toContain('OUTPUT_JSON_SCHEMA');
      expect(sent).toMatchObject({
        model: 'fixture',
        max_tokens: 2048,
        response_format: { type: 'json_schema' },
      });
      const format = await generationOutput('native_schema', contract.schema, contract.ref)
        .responseFormat;
      if (format?.type !== 'json') throw new Error('缺原生格式');
      expect(sent.response_format.json_schema.schema).toEqual(format.schema);
    },
  );

  it('策略发现文本模式的固定消息和预留低于 24 KiB', async () => {
    const { messages, inputTokenReservation } = await prepareOptimizationGeneration(
      inputFor('discovery', true, 'json_validated'),
    );
    expect(inputTokenReservation).toBe(Buffer.byteLength(JSON.stringify(messages), 'utf8'));
    expect(inputTokenReservation).toBeLessThan(24 * 1024);
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
