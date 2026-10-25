import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
  type AiSdkGenerationRequest,
} from '../../src/ai/ai-sdk-generation.adapter.js';
import { StructuredLogger } from '../../src/platform/structured-logger.js';
import {
  currentAiTrace,
  currentAiTraceReference,
  withAiTraceReference,
} from '../../src/ai/trace/ai-trace-context.js';
import { createAiTraceReference } from '../../src/ai/trace/ai-trace-contract.js';
import { AiTraceFileStore, type AiTraceFiles } from '../../src/ai/trace/ai-trace-file-store.js';
import { fetchWithAiTrace } from '../../src/ai/trace/ai-trace-http.js';
import { readAiTraceCli } from '../../src/ai/trace/ai-trace-read.cli.js';
import { redactAiTrace } from '../../src/ai/trace/ai-trace-redaction.js';
import { traceFixture, traceSse } from './ai-trace.fixture.js';

describe('trace 的传输、隔离与只读存储边界', () => {
  let root = '';
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-trace-unit-'));
    vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  const request = (
    httpClient: typeof fetch,
    answer = '受控响应',
  ): AiSdkGenerationRequest<{ answer: string }> => ({
    requestId: randomUUID(),
    adapter: 'openai-compatible-chat',
    providerId: 'fixture',
    apiKey: 'sk-private-credential',
    baseURL: 'https://fixture.invalid/v1',
    model: 'fixture-model',
    messages: [{ role: 'user', content: `返回 JSON，标记 ${answer}` }],
    contract: { id: 'research', version: 'research-generation-v2' },
    schema: z.strictObject({ answer: z.string() }),
    mode: 'native_schema',
    transport: 'stream',
    timeout: { totalMs: 2000 },
    signal: new AbortController().signal,
    httpClient,
  });
  const finishBusiness = (f: ReturnType<typeof traceFixture>) =>
    f.store.failOwned(
      { runId: f.run.id, executionAttempt: 1 },
      { errorCode: 'controlled_done', errorSummary: '受控终态' },
    );

  it('传给消费者的状态、headers 和 UTF-8 响应字节完全不变，只有一次 transport 调用', async () => {
    const f = traceFixture(join(root, 'traces'));
    const raw = traceSse('{"answer":"原始上游中文🧪"}');
    const client = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        new Response(raw, {
          status: 201,
          headers: {
            'content-type': 'text/event-stream',
            'x-upstream-proof': 'untouched',
            'set-cookie': 'PRIVATE_COOKIE',
          },
        }),
      ),
    );
    await f.capture.runClaimed(f.run as never, async () => {
      const trace = currentAiTrace()!.trace;
      await trace.runNode(
        'sdk.generate',
        { fixture: true },
        async () => {
          const response = await fetchWithAiTrace(
            'https://fixture.invalid/path?secret=not-saved',
            {
              method: 'POST',
              body: '{"max_tokens":20000}',
              headers: { authorization: 'Bearer PRIVATE_KEY' },
            },
            client,
          );
          expect(response.status).toBe(201);
          expect(response.headers.get('x-upstream-proof')).toBe('untouched');
          expect(response.headers.get('set-cookie')).toBe('PRIVATE_COOKIE');
          expect(await response.text()).toBe(raw);
        },
        { sdkRequestId: 'recorded-request' },
      );
      await trace.completeSdkRequest('recorded-request');
      await finishBusiness(f);
    });
    expect(client).toHaveBeenCalledTimes(1);
    const found = await f.read();
    expect(JSON.stringify(found)).not.toMatch(
      /PRIVATE_KEY|PRIVATE_COOKIE|not-saved|PRIVATE_REASONING/u,
    );
    expect(JSON.stringify(found)).toContain('max_tokens');
    expect(found.manifest.captureStatus).toBe('complete');
  });

  it('SDK 使用显式 HTTP adapter，两个并发任务的输入、响应和引用各自隔离', async () => {
    const cases = ['甲方独有输入', '乙方独有输入'];
    const traces = await Promise.all(
      cases.map(async (answer, index) => {
        const f = traceFixture(join(root, `traces-${index}`));
        const client = vi.fn<typeof fetch>().mockImplementation(() =>
          Promise.resolve(
            new Response(traceSse(JSON.stringify({ answer })), {
              headers: { 'content-type': 'text/event-stream' },
            }),
          ),
        );
        await f.capture.runClaimed(f.run as never, async () => {
          const result = await new AiSdkGenerationAdapter().generate(request(client, answer));
          expect(result.output).toEqual({ answer });
          await finishBusiness(f);
        });
        expect(client).toHaveBeenCalledTimes(1);
        return f.read();
      }),
    );
    expect(JSON.stringify(traces[0])).toContain(cases[0]);
    expect(JSON.stringify(traces[0])).not.toContain(cases[1]);
    expect(JSON.stringify(traces[1])).toContain(cases[1]);
    expect(JSON.stringify(traces[1])).not.toContain(cases[0]);
    expect(traces[0]!.manifest.traceId).not.toBe(traces[1]!.manifest.traceId);
    expect(currentAiTrace()).toBeUndefined();
  });

  it('同一 SDK requestId 第二次发送在本地拒绝，不调用第二次 HTTP', async () => {
    const f = traceFixture(join(root, 'traces'));
    const client = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })),
      );
    await f.capture.runClaimed(f.run as never, async () => {
      const trace = currentAiTrace()!.trace;
      await trace.runNode(
        'sdk.generate',
        {},
        async () => {
          const response = await fetchWithAiTrace(
            'https://fixture.invalid',
            { body: '{}' },
            client,
          );
          await response.text();
          await expect(
            fetchWithAiTrace('https://fixture.invalid', { body: '{}' }, client),
          ).rejects.toMatchObject({ reason: 'duplicate_http_dispatch', requestDispatched: true });
        },
        { sdkRequestId: 'single-request' },
      );
      await trace.completeSdkRequest('single-request');
      await finishBusiness(f);
    });
    expect(client).toHaveBeenCalledTimes(1);
    expect((await f.read()).manifest.nativeFetches).toBe(1);
  });

  it('HTTP body 保存失败在派发前停止，返回 configuration_invalid/not_sent，trace 与调用方一致', async () => {
    const files = new AiTraceFileStore(join(root, 'traces'));
    const open = files.open.bind(files);
    vi.spyOn(files, 'open').mockImplementation(async (...args) => {
      const opened = await open(...args);
      const write = opened.writeArtifact.bind(opened);
      vi.spyOn(opened, 'writeArtifact').mockImplementation(
        (...input: Parameters<AiTraceFiles['writeArtifact']>) => {
          if (input[1] === 'request-body') return Promise.reject(new Error('受控保存失败'));
          return write(...input);
        },
      );
      return opened;
    });
    const f = traceFixture(join(root, 'traces'), true, files);
    const client = vi.fn<typeof fetch>();
    await f.capture.runClaimed(f.run as never, async () => {
      try {
        await new AiSdkGenerationAdapter().generate(request(client));
        throw new Error('应在派发前失败');
      } catch (error) {
        expect(error).toBeInstanceOf(AiSdkGenerationError);
        expect((error as AiSdkGenerationError).fact).toMatchObject({
          code: 'configuration_invalid',
          phase: 'preflight',
          externalResult: 'not_sent',
        });
      }
      await finishBusiness(f);
    });
    expect(client).not.toHaveBeenCalled();
    const found = await f.read();
    const output = found.manifest.nodes.find((node) => node.stage === 'sdk.generate')!.output!;
    expect(found.artifacts[output.file]!.value).toMatchObject({
      fact: { code: 'configuration_invalid', externalResult: 'not_sent' },
    });
  });

  it('脱敏保留 Token 上限和用量数值，移除凭据、cookie、reasoning 各种结构', () => {
    expect(
      redactAiTrace(
        {
          max_tokens: 20000,
          usage: { reasoning_tokens: 10 },
          'x-api-key': 'key',
          cookie: 'session',
          nested: { reasoning: { text: 'PRIVATE_REASONING' } },
          event: { type: 'response.reasoning_summary_text.delta', delta: 'PRIVATE_REASONING' },
          content: 'Bearer abc actual-key',
        },
        new Set(['actual-key']),
      ),
    ).toEqual({
      max_tokens: 20000,
      usage: { reasoning_tokens: 10 },
      'x-api-key': '[REDACTED]',
      cookie: '[REDACTED]',
      nested: { reasoning: { redacted: true, characters: null } },
      event: { type: 'response.reasoning_summary_text.delta', redacted: true },
      content: 'Bearer [REDACTED] [REDACTED]',
    });
  });

  it('创建引用上下文退出后清理，并发准备互不污染', async () => {
    const refs = [createAiTraceReference(), createAiTraceReference()];
    const values = await Promise.all(
      refs.map((ref) =>
        withAiTraceReference(ref, async () => {
          await Promise.resolve();
          return currentAiTraceReference();
        }),
      ),
    );
    expect(values).toEqual(refs);
    expect(currentAiTraceReference()).toBeUndefined();
  });

  it('Provider error.raw 中嵌套 JSON 凭据也被移除，无需脱敏的模型正文保持原字符串', () => {
    const raw = JSON.stringify({
      error: { api_key: 'UPSTREAM_PRIVATE', cookie: 'PRIVATE_SESSION' },
    });
    expect(JSON.stringify(redactAiTrace({ metadata: { raw } }, new Set()))).not.toMatch(
      /UPSTREAM_PRIVATE|PRIVATE_SESSION/u,
    );
    const content = '{ "answer": "原始正文", "count": 2 }';
    expect(redactAiTrace(content, new Set())).toBe(content);
  });

  const saved = async () => {
    const f = traceFixture(join(root, 'traces'));
    await f.capture.runClaimed(f.run as never, () => finishBusiness(f).then(() => undefined));
    return { f, found: await f.read() };
  };

  it('只读查看器校验 owner/run/attempt，并可按节点导出，不创建新文件', async () => {
    const { f, found } = await saved();
    await expect(
      f.files.read(f.reference, { ...f.identity, ownerId: randomUUID() }),
    ).rejects.toMatchObject({ reason: 'identity_mismatch' });
    await expect(
      f.files.read(f.reference, { ...f.identity, executionAttempt: 2 }),
    ).rejects.toThrow();
    const args = [
      '--root',
      f.files.root,
      '--trace',
      f.reference.traceId,
      '--run',
      f.run.id,
      '--owner',
      f.run.researchOwnerId,
      '--attempt',
      '1',
    ];
    expect(await readAiTraceCli(args)).toMatchObject({ manifest: found.manifest });
    const node = found.manifest.nodes.find(
      (candidate) => candidate.stage === 'business.persistence',
    )!;
    expect(await readAiTraceCli([...args, '--node', node.id])).toMatchObject({
      node,
      artifacts: expect.any(Object),
    });
    await expect(readAiTraceCli([...args, '--node', randomUUID()])).rejects.toThrow(
      'trace 节点不存在',
    );
    expect((await f.read()).manifest).toEqual(found.manifest);
  });

  it('拒绝 artifact 内容篡改和路径穿越', async () => {
    const { f, found } = await saved();
    const first = Object.values(found.artifacts)[0]!;
    await writeFile(first.path, 'tampered');
    await expect(f.read()).rejects.toMatchObject({ reason: 'artifact_integrity' });
    const path = join(found.directory, 'trace.json');
    const manifest = JSON.parse(await readFile(path, 'utf8')) as typeof found.manifest;
    manifest.artifacts[0]!.file = '../../../../outside.json';
    await writeFile(path, JSON.stringify(manifest));
    await expect(f.read()).rejects.toMatchObject({ reason: 'invalid_artifact' });
  });

  it('私有目录下的 symlink 不能用于越界读写', async () => {
    const files = new AiTraceFileStore(join(root, 'traces'));
    const f = traceFixture(join(root, 'traces'), true, files);
    const first = await saved();
    await symlink(root, join(files.root, f.reference.traceId));
    await expect(files.open(f.reference, f.identity)).rejects.toMatchObject({
      reason: 'invalid_directory',
    });
    const artifact = Object.values(first.found.artifacts)[0]!;
    await rm(artifact.path);
    const outside = join(root, 'outside.json');
    await writeFile(outside, '{}');
    await symlink(outside, artifact.path);
    await expect(first.f.read()).rejects.toMatchObject({ reason: 'artifact_limit' });
  });

  it('同一 attempt 不覆盖原 trace，新的 attempt 使用单独目录', async () => {
    const { f, found } = await saved();
    await expect(f.files.open(f.reference, f.identity)).rejects.toMatchObject({ code: 'EEXIST' });
    const next = await f.files.open(f.reference, { ...f.identity, executionAttempt: 2 });
    expect(next.directory).not.toBe(found.directory);
    expect((await f.read()).manifest).toEqual(found.manifest);
  });

  it('未完成的 manifest 反读为 incomplete，保留 running 事实且不回写原文件', async () => {
    const { f, found } = await saved();
    const path = join(found.directory, 'trace.json');
    const unfinished = JSON.stringify({
      ...found.manifest,
      status: 'running',
      completedAt: null,
      captureStatus: 'complete',
    });
    await writeFile(path, unfinished);
    const read = await f.read();
    expect(read.manifest).toMatchObject({
      status: 'running',
      completedAt: null,
      captureStatus: 'incomplete',
      issues: expect.arrayContaining(['trace_not_finalized']),
    });
    expect(await readFile(path, 'utf8')).toBe(unfinished);
  });

  it('有界私有 artifact 超限在模型派发前失败，并留下 incomplete 状态', async () => {
    const f = traceFixture(
      join(root, 'traces'),
      true,
      new AiTraceFileStore(join(root, 'traces'), { maxArtifactBytes: 32 }),
    );
    const work = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await f.capture.runClaimed(f.run as never, work);
    expect(work).not.toHaveBeenCalled();
    expect(f.run.errorCode).toBe('research_trace_unavailable');
    const found = await f.read();
    expect(found.manifest).toMatchObject({ nativeFetches: 0, captureStatus: 'incomplete' });
  });

  it('共享日志只输出 trace 索引与状态，日志故障不会改变原业务结果', async () => {
    const logger = vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => {
      throw new Error('共享日志不可用');
    });
    const { f } = await saved();
    expect(f.run.status).toBe('failed');
    const record = logger.mock.calls.at(-1)![0];
    expect(Object.keys(record).sort()).toEqual([
      'captureStatus',
      'executionAttempt',
      'nativeFetches',
      'operation',
      'runId',
      'status',
      'traceId',
    ]);
  });
});
