import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { omit } from 'es-toolkit';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Output, jsonSchema, modelMessageSchema, streamText, type ModelMessage } from 'ai';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { generationOutput } from '../../src/ai/ai-generation-output.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import { authoringMessages } from '../../src/strategy-authoring/authoring-prompt.js';
import {
  prepareValidityPilot,
  validityPilotSchema,
  validityPilotSystem,
} from './order-validity-pilot.fixture.js';

const captureRoot = process.env.BACKTEST_DAILY_ORDER_CAPTURE_ROOT;
const evidence = process.env.ORDER_VALIDITY_PILOT_EVIDENCE;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cases = [
  {
    id: 'day',
    dir: 'backtest-daily-orders-remaining20-20261118/schema-modification',
    index: 3,
    before: { kind: 'bars', bars: 2 },
    after: { kind: 'DAY' },
  },
  {
    id: 'two-bars',
    dir: 'whole-order-model-20261118/modify',
    index: 2,
    before: { kind: 'DAY' },
    after: { kind: 'bars', bars: 2 },
  },
] as const;

// 用同一个 SDK 序列化三种请求。fetch 只记录本地请求体并返回内存中的 SSE。
async function measure(
  model: string,
  limit: number,
  messages: { role: string; content: string }[],
  schema: Parameters<typeof jsonSchema>[0],
  response: unknown,
) {
  let bodyText = '';
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if (typeof init?.body !== 'string') throw Error('缺少 JSON 请求体');
    bodyText = init.body;
    const frame = {
      id: 'offline',
      object: 'chat.completion.chunk',
      model,
      created: 0,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: JSON.stringify(response) },
          finish_reason: 'stop',
        },
      ],
    };
    return new Response('data: ' + JSON.stringify(frame) + '\n\ndata: [DONE]\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
  });
  const provider = createOpenAICompatible({
    name: 'compatible',
    baseURL: 'https://offline.invalid/v1',
    apiKey: 'offline',
    fetch,
    includeUsage: true,
    supportsStructuredOutputs: true,
  });
  const result = streamText({
    model: provider(model),
    instructions: messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n'),
    messages: modelMessageSchema.array().parse(messages.filter((m) => m.role !== 'system')),
    output: Output.object({ schema: jsonSchema(schema) }),
    maxOutputTokens: limit,
    maxRetries: 0,
  });
  expect(await result.output).toEqual(response);
  expect(fetch).toHaveBeenCalledOnce();
  const body = JSON.parse(bodyText);
  expect(body).toMatchObject({
    model,
    max_tokens: limit,
    stream: true,
    stream_options: { include_usage: true },
    response_format: { type: 'json_schema', json_schema: { strict: true, schema } },
  });
  return {
    body,
    metrics: {
      requestBytes: Buffer.byteLength(bodyText),
      messagesBytes: bytes(body.messages),
      formatBytes: bytes(body.response_format),
      outputBytes: bytes(response),
      requestSha256: createHash('sha256').update(bodyText).digest('hex'),
    },
  };
}

const pilotTest = it.skipIf(!captureRoot);
pilotTest.each(cases)('$id 真实基线，单项变更保留其他全部字段', async (sample) => {
  const read = (name: string) =>
    JSON.parse(readFileSync(join(captureRoot!, sample.dir, name + '.json'), 'utf8'));
  const { operation } = read(sample.id + '-input') as { operation: AuthoringOperation };
  const history = read('request-' + sample.index),
    wire = read('wire-' + sample.index + '-1');
  const acceptedRaw = read('wire-output-' + sample.index + '-1'),
    accepted = read(sample.id);
  const original = JSON.parse(operation.input.content.definitionText);
  const snapshot = structuredClone(operation);
  const user = history.messages.find((m: ModelMessage) => m.role === 'user');
  expect(JSON.parse(user.content)).toMatchObject({
    baseline: original,
    intent: operation.input.selection.intent,
    modificationTarget: 'execution',
    revision: operation.revision,
    requirementIds: ['rules'],
  });
  expect(accepted).toMatchObject({
    category: 'passed',
    intentIssues: [],
    executionIssues: [],
    replayEqual: true,
    beforeConfiguration: original,
  });
  expect(accepted.savedVersionId).toBeTruthy();
  expect(history.contract).toEqual(aiGenerationContracts.authoringModification.ref);
  expect(history.mode).toBe('native_schema');

  const patch = {
    change: 'validity',
    templateId: 'buy',
    requirementId: 'rules',
    value: sample.after,
  };
  const prepared = await prepareValidityPilot(operation, operation.revision, patch);
  if (!prepared) throw Error('缺少试点提案');
  const changed = prepared.checked.definition;
  expect(changed).toEqual(acceptedRaw.proposal.definition);
  expect(changed).toEqual(accepted.configuration);
  expect(acceptedRaw.proposal.definition).toEqual(
    read('response-' + sample.index).output.definition,
  );
  if (changed.execution.timing !== 'dailyBarOrders') throw Error('缺日线委托');
  const index = changed.execution.orders.findIndex((o) => o.id === 'buy');
  expect(original.execution.orders[index].validity).toEqual(sample.before);
  expect(changed.execution.orders[index]!.validity).toEqual(sample.after);
  const restored = structuredClone(changed);
  if (restored.execution.timing !== 'dailyBarOrders') throw Error('缺少日线委托');
  restored.execution.orders[index]!.validity = sample.before;
  expect(restored).toStrictEqual(original);
  expect(prepared.checked.differences).toEqual(accepted.differences);
  expect(operation).toEqual(snapshot);

  const format = await generationOutput(
    'native_schema',
    authoringOperationSchema(operation),
    history.contract,
  ).responseFormat;
  if (format?.type !== 'json' || !format.schema) throw Error('缺 v5 原生合同');
  const args = [wire.model, history.maxOutputTokens] as const;
  const historic = await measure(
    ...args,
    history.messages,
    wire.responseFormat.json_schema.schema,
    acceptedRaw,
  );
  expect(historic.body.response_format).toEqual(wire.responseFormat);
  expect(
    historic.body.messages.map((m: { role: string; content: unknown }) => ({
      role: m.role,
      contentBytes: bytes(m.content),
      contentSha256: digest(m.content),
    })),
  ).toEqual(wire.messages);
  expect(authoringOperationSchema(operation).parse(acceptedRaw)).toEqual(
    read('response-' + sample.index).output,
  );
  const currentMessages = authoringMessages(operation);
  expect(currentMessages.filter((m) => m.role === 'user')).toEqual([user]);
  const current = await measure(...args, currentMessages, format.schema, acceptedRaw);
  const short = await measure(
    ...args,
    [{ role: 'system', content: validityPilotSystem }, user],
    z.toJSONSchema(validityPilotSchema, { target: 'draft-7', io: 'input' }) as Parameters<
      typeof jsonSchema
    >[0],
    patch,
  );
  const envelope = (body: Record<string, unknown>) => omit(body, ['messages', 'response_format']);
  expect(envelope(short.body)).toEqual(envelope(current.body));
  expect(envelope(current.body)).toEqual(envelope(historic.body));
  expect(short.body.messages.filter((m: ModelMessage) => m.role === 'user')).toEqual([user]);
  if (evidence && sample.id === 'day')
    writeFileSync(
      join(evidence, 'pilot-schema.json'),
      JSON.stringify(short.body.response_format.json_schema.schema, null, 2) + '\n',
    );
  expect(short.metrics.requestBytes).toBeLessThan(current.metrics.requestBytes);
  expect(short.metrics.outputBytes).toBeLessThan(current.metrics.outputBytes);
  if (evidence)
    writeFileSync(
      join(evidence, sample.id + '.json'),
      JSON.stringify(
        {
          source: sample.dir,
          index: sample.index,
          intentAndBaseline: digest(user.content),
          target: prepared.templateId,
          path: prepared.path,
          before: sample.before,
          after: sample.after,
          fullDefinitionSha256: digest(changed),
          historical: historic.metrics,
          currentV5: current.metrics,
          pilot: short.metrics,
          historicalUsage: read('response-' + sample.index).usage,
          shortResponse: patch,
        },
        null,
        2,
      ) + '\n',
    );
});

pilotTest('未知或越界目标、非法期限、空改、过期与旧顺序均有明确结果', async () => {
  const { operation } = JSON.parse(
    readFileSync(join(captureRoot!, cases[1].dir, 'two-bars-input.json'), 'utf8'),
  ) as { operation: AuthoringOperation };
  const patch = {
    change: 'validity',
    templateId: 'buy',
    requirementId: 'rules',
    value: { kind: 'bars', bars: 2 },
  };
  const prepare = (p: unknown, rev = operation.revision) => prepareValidityPilot(operation, rev, p);
  for (const templateId of ['unknown', 'exit', 'stop'])
    await expect(prepare({ ...patch, templateId })).rejects.toThrow('找不到目标建仓单');
  for (const value of [
    { kind: 'bars', bars: 0 },
    { kind: 'bars', bars: 1.5 },
    { kind: 'position' },
    { kind: 'DAY', bars: 2 },
  ])
    await expect(prepare({ ...patch, value })).rejects.toThrow();
  await expect(prepare({ ...patch, requirementId: 'missing' })).rejects.toThrow('需求');
  await expect(prepare({ ...patch, value: { kind: 'DAY' } })).rejects.toThrow('建议没有实际变化');
  await expect(prepare(patch, operation.revision + 1)).rejects.toThrow('过期');
  await expect(prepare({ ...patch, extra: 'exit' })).rejects.toThrow();
  await expect(prepare({ change: 'unsupported' })).resolves.toBeNull();
  const otherScope = structuredClone(operation);
  otherScope.input.selection.modificationTarget = 'cost';
  await expect(prepareValidityPilot(otherScope, otherScope.revision, patch)).rejects.toThrow(
    '修改范围',
  );
  const linked = structuredClone(operation);
  linked.input.content.requirements[0]!.definitionPaths = ['entry', 'exit', 'execution'];
  const withLinks = await prepareValidityPilot(linked, linked.revision, patch);
  expect(withLinks?.checked.coverage[0]?.definitionPaths).toEqual(['entry', 'exit', 'execution']);
  const reversed = structuredClone(operation);
  const before = JSON.parse(reversed.input.content.definitionText);
  const [buy, exit, stop] = before.execution.orders;
  before.execution.orders = [buy, stop, exit];
  reversed.input.content.definitionText = JSON.stringify(before);
  await expect(prepareValidityPilot(reversed, reversed.revision, patch)).rejects.toThrow(/第 2 项/);
  const renamed = structuredClone(operation);
  before.execution.orders = [buy, exit, stop];
  buy.id = 'renamed-buy';
  stop.parent.templateId = buy.id;
  renamed.input.content.definitionText = JSON.stringify(before);
  const valid = await prepareValidityPilot(renamed, renamed.revision, {
    ...patch,
    templateId: buy.id,
  });
  expect(valid?.templateId).toBe('renamed-buy');
  expect(JSON.parse(renamed.input.content.definitionText)).toEqual(before);
});

pilotTest('正式局部修改按所选范围分流，短响应越界或无变化时拒绝', () => {
  const sample = cases[1];
  const { operation } = JSON.parse(
    readFileSync(join(captureRoot!, sample.dir, 'two-bars-input.json'), 'utf8'),
  ) as { operation: AuthoringOperation };
  const { content, selection } = operation.input;
  const short = structuredClone(operation);
  short.input.selection.modificationTarget = 'entryOrderValidity';
  const accepted = JSON.parse(
    readFileSync(
      join(captureRoot!, 'order-validity-pilot-live-20261119-133724', 'two-bars-response.json'),
      'utf8',
    ),
  );
  const patch = JSON.parse(accepted.text);
  const check = (value: unknown) =>
    validateAuthoringModification(content, short.input.selection, value);
  const baseline = structuredClone(content);
  for (const invalid of [
    { ...patch, templateId: 'stop' },
    { ...patch, templateId: 'exit' },
    { ...patch, templateId: 'missing' },
    { ...patch, requirementId: 'missing' },
    { ...patch, value: { kind: 'DAY' } },
    { ...patch, value: { kind: 'position' } },
    { ...patch, value: { kind: 'bars', bars: 0 } },
    { ...patch, order: { kind: 'market' } },
    { change: 'unsupported' },
  ])
    expect(() => check(invalid)).toThrow();
  const full = JSON.parse(
    readFileSync(join(captureRoot!, sample.dir, 'wire-output-2-1.json'), 'utf8'),
  );
  expect(authoringOperationSchema(short).safeParse(patch).success).toBe(true);
  expect(authoringOperationSchema(operation).safeParse(patch).success).toBe(false);
  expect(() => validateAuthoringModification(content, selection, patch)).toThrow();
  const proposal = authoringOperationSchema(operation).parse(full);
  expect(validateAuthoringModification(content, selection, proposal).definition).toEqual(
    check(patch).definition,
  );
  expect(() => check(proposal)).toThrow();
  expect(content).toEqual(baseline);
});
