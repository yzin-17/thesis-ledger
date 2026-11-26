import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { jsonSchema, Output, streamText } from 'ai';
import {
  AUTHORING_LIMITS,
  aiGenerationContracts,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { z } from 'zod';
import { it, expect } from 'vitest';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import {
  dailyModelCases,
  dailyModelExecutionIssues,
  dailyModelSnapshot,
} from '../backtest/daily-order-model.fixture.js';
import {
  prepareValidityPilot,
  validityPilotSchema,
  validityPilotSystem,
  type PilotOperation,
} from './order-validity-pilot.fixture.js';

const directory = process.env.BACKTEST_PLAN_ACCEPTANCE_DIR;
const enabled = directory && process.env.BACKTEST_PLAN_SCENARIO === 'order-validity-pilot';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const cases = [
  { id: 'day', dir: 'backtest-daily-orders-remaining20-20261118/schema-modification', n: 3 },
  { id: 'two-bars', dir: 'whole-order-model-20261118/modify', n: 2 },
] as const;

it.skipIf(!enabled)(
  '短输出真实首次对照，两侧均合格后隔离保存与冻结回放',
  async () => {
    const dir = resolve(directory!);
    const root = resolve(process.cwd(), '../../var/acceptance');
    const write = (file: string, data: unknown) =>
      writeFileSync(join(dir, file + '.json'), JSON.stringify(data, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
    const dbUrl = new URL(process.env.AI_PROVIDER_DATABASE_URL!);
    expect([dbUrl.hostname, dbUrl.pathname]).toEqual([
      '127.0.0.1',
      '/ai_provider_concurrency_fixture',
    ]);
    const providerRow = read(join(dir, 'provider.json'));
    const settings = providerRow.settings;
    const [model] = settings.models;
    expect(settings).toMatchObject({
      authMode: 'none',
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
      models: [model],
    });
    expect(settings.modelPricing[model]).toMatchObject({ costPer1kInput: 0, costPer1kOutput: 0 });
    const ref = aiGenerationContracts.authoringModification.ref;
    const route = settings.executionRoutes.find(
      (item: { contract: { id: string }; model: string }) =>
        item.model === model && item.contract.id === ref.id,
    );
    expect(route).toMatchObject({ contract: ref, mode: 'native_schema' });
    const samples = cases.map((sample) => {
      const src = join(root, sample.dir);
      const archived = read(join(src, 'provider.json')).settings;
      for (const k of [
        'baseUrl',
        'models',
        'modelDefaults',
        'modelReasoning',
        'authMode',
        'upstreamFormat',
        'chatImplementation',
        'modelPricing',
      ])
        expect(settings[k]).toEqual(archived[k]);
      expect(route).toEqual(
        archived.executionRoutes.find(
          (r: { model: string; contract: { id: string } }) =>
            r.model === model && r.contract.id === ref.id,
        ),
      );
      const { operation } = read(join(src, sample.id + '-input.json')) as {
        operation: PilotOperation;
      };
      const request = read(join(src, 'request-' + sample.n + '.json'));
      expect([request.mode, request.contract, request.maxOutputTokens]).toEqual([
        'native_schema',
        ref,
        AUTHORING_LIMITS.outputTokens,
      ]);
      const user = request.messages.filter((m: { role: string }) => m.role === 'user');
      expect(user).toHaveLength(1);
      expect(JSON.parse(user[0].content)).toMatchObject({
        baseline: JSON.parse(operation.input.content.definitionText),
        intent: operation.input.selection.intent,
        revision: operation.revision,
        modificationTarget: 'execution',
      });
      const accepted = read(join(src, sample.id + '.json'));
      expect(accepted).toMatchObject({
        category: 'passed',
        replayEqual: true,
        intentIssues: [],
        executionIssues: [],
      });
      const offline = read(join(root, 'order-validity-pilot-20261119-h2lrcs', sample.id + '.json'));
      const original = read(join(src, 'response-' + sample.n + '.json'));
      return {
        ...sample,
        src,
        operation,
        user: user[0].content as string,
        accepted,
        offline,
        original,
      };
    });
    const schema = z.toJSONSchema(validityPilotSchema, {
      target: 'draft-7',
      io: 'input',
    }) as Parameters<typeof jsonSchema>[0];
    const sent = new Set<string>();
    async function generate(slot: string, system: string, user: string, expectedHash?: string) {
      const start = performance.now();
      let firstTextMs: number | null = null,
        text = '';
      const requestId = randomUUID();
      const provider = createOpenAICompatible({
        name: 'compatible',
        baseURL: settings.baseUrl,
        includeUsage: true,
        supportsStructuredOutputs: true,
        fetch: async (url, init) => {
          expect(String(url)).toBe(settings.baseUrl.replace(/\/$/, '') + '/chat/completions');
          expect(typeof init?.body).toBe('string');
          const raw = init!.body as string;
          if (expectedHash) expect(digest(raw)).toBe(expectedHash);
          expect(JSON.parse(raw)).toMatchObject({
            model,
            stream: true,
            max_tokens: AUTHORING_LIMITS.outputTokens,
            response_format: { json_schema: { strict: true, schema } },
          });
          if (sent.has(slot) || sent.size >= 3) throw Error('请求次数已用完');
          sent.add(slot);
          write(slot + '-request', {
            requestId,
            at: new Date().toISOString(),
            body: JSON.parse(raw),
            bytes: Buffer.byteLength(raw),
            sha256: digest(raw),
          });
          console.log('发送', slot);
          return fetch(url, { ...init, redirect: 'error' });
        },
      });
      try {
        const result = streamText({
          model: provider(model),
          instructions: system,
          messages: [{ role: 'user', content: user }],
          output: Output.object({ schema: jsonSchema(schema) }),
          maxOutputTokens: AUTHORING_LIMITS.outputTokens,
          maxRetries: 0,
          timeout: { totalMs: AUTHORING_LIMITS.deadlineMs, firstChunkMs: 90000, chunkMs: 45000 },
        });
        for await (const part of result.fullStream) {
          if (part.type === 'error') throw part.error;
          if (part.type === 'text-delta' && part.text) {
            firstTextMs ??= performance.now() - start;
            text += part.text;
          }
        }
        const elapsedMs = performance.now() - start;
        const usage = await result.totalUsage;
        const finish = await result.finishReason;
        write(slot + '-response', {
          text,
          firstTextMs,
          elapsedMs,
          finish,
          actualModel: (await result.response).modelId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          outputTokenDetails: usage.outputTokenDetails,
        });
        expect(finish).toBe('stop');
        const raw = JSON.parse(text);
        expect(await result.output).toEqual(raw);
        return validityPilotSchema.parse(raw);
      } catch (error) {
        write(slot + '-error', {
          error: String(error),
          text,
          elapsedMs: performance.now() - start,
          firstTextMs,
        });
        throw error;
      }
    }
    const probe = {
      change: 'validity',
      templateId: 'format-check',
      requirementId: 'probe',
      value: { kind: 'bars', bars: 5 },
    };
    expect(
      await generate('probe', '只输出用户给出的 JSON 对象，保留原值。', JSON.stringify(probe)),
    ).toEqual(probe);
    const correct: { id: string; definition: BacktestStrategy }[] = [];
    for (const s of samples) {
      try {
        const raw = await generate(
          s.id,
          validityPilotSystem,
          s.user,
          s.offline.pilot.requestSha256,
        );
        const p = await prepareValidityPilot(s.operation, s.operation.revision, raw);
        if (!p) throw Error('模型返回 unsupported');
        expect(p.templateId).toBe(s.offline.target);
        expect(p.checked.definition).toEqual(s.accepted.configuration);
        expect(p.checked.differences).toEqual(s.accepted.differences);
        expect(raw).toEqual(s.offline.shortResponse);
        write(s.id + '-check', {
          correct: true,
          definition: p.checked.definition,
          templateId: p.templateId,
          path: p.path,
          differences: p.checked.differences,
          coverage: p.checked.coverage,
          originalUsage: s.original.usage,
          originalFirstTextMs: s.original.timeToFirstTextMs,
        });
        correct.push({ id: s.id, definition: p.checked.definition });
      } catch (error) {
        write(s.id + '-check', { correct: false, error: String(error) });
      }
      console.log(
        '首次判定',
        s.id,
        correct.some((x) => x.id === s.id),
      );
    }
    write('pair', {
      outbound: [...sent],
      correct: correct.map((x) => x.id),
      bothCorrect: correct.length === 2,
    });
    expect(correct).toHaveLength(2);
    const db = new PrismaService({ datasourceUrl: dbUrl.href });
    try {
      for (const [i, row] of correct.entries()) {
        const s = samples[i]!;
        const saved = await db.$transaction((tx) =>
          new StrategyCreationService().createInTransaction(tx, {
            ownerId: null,
            name: '短输出隔离验收 ' + row.id,
            definition: row.definition,
            source: { kind: 'manual' },
          }),
        );
        const version = await db.strategyVersion.findUniqueOrThrow({
          where: { id: saved.versions[0]!.id },
        });
        expect(version.schema).toEqual(row.definition);
        const rootPath = join(dir, row.id + '-snapshot');
        mkdirSync(rootPath, { mode: 0o700 });
        const sample = dailyModelCases.find((v) => v.id === row.id)!;
        const f = await dailyModelSnapshot(rootPath, sample, version.schema as BacktestStrategy);
        const result = await f.run();
        expect(await f.run()).toEqual(result);
        expect(result).toEqual(s.accepted.result);
        expect(f.execute()).toEqual(s.accepted.execution);
        expect(dailyModelExecutionIssues(sample, result.simulationFills)).toEqual([]);
        const readback = backtestStrategyPlanReadback(row.definition);
        expect(readback).toEqual(s.accepted.readback);
        write(row.id + '-replay', {
          savedVersionId: version.id,
          result,
          execution: f.execute(),
          readback,
          replayEqual: true,
        });
      }
    } finally {
      await db.$disconnect();
    }
  },
  900000,
);
