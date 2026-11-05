import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { StructuredLogger } from '../../src/platform/structured-logger.js';
import { AiResearchSdkExecution } from '../../src/ai/ai-research-sdk-execution.js';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
} from '../../src/ai/ai-sdk-generation.adapter.js';
import { AiTraceFileStore, type AiTraceFiles } from '../../src/ai/trace/ai-trace-file-store.js';
import { traceAiOperation } from '../../src/ai/trace/ai-trace-context.js';
import { traceContent, traceFixture, traceSse } from './ai-trace.fixture.js';
import { submissionV2Fixture } from './research-submission-v2.fixture.js';
import { sealAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const upstreamError = {
  error: { code: 502, message: 'Provider returned error', metadata: { raw: '受控上游错误' } },
};

describe('正式 trace 的受控 HTTP → SDK → 业务链', () => {
  let root = '';
  let origin = '';
  let calls = 0;
  let requestBody = '';
  let mode: 'success' | 'schema' | 'http' | 'sse' | 'disconnect' | 'hang' = 'success';
  const server = createServer(async (request, response) => {
    calls++;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
    requestBody = Buffer.concat(chunks).toString('utf8');
    if (mode === 'disconnect') {
      response.destroy();
      return;
    }
    response.writeHead(mode === 'http' ? 502 : 200, {
      'content-type': mode === 'http' ? 'application/json' : 'text/event-stream',
      'set-cookie': 'SECRET_COOKIE=value',
    });
    if (mode === 'hang') {
      response.write(': waiting\n\n');
      return;
    }
    if (mode === 'http') {
      response.end(JSON.stringify(upstreamError));
      return;
    }
    if (mode === 'sse') {
      response.end(`data: ${JSON.stringify(upstreamError)}\n\ndata: [DONE]\n\n`);
      return;
    }
    // 多字节字符被拆开，验证取证不会改变 SDK 实际收到的字节。
    const wire = Buffer.from(
      traceSse(mode === 'schema' ? '{"answer":"字段不符合合同"}' : traceContent),
    );
    for (let offset = 0; offset < wire.length; offset += 7)
      response.write(wire.subarray(offset, offset + 7));
    response.end();
  });
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('受控服务启动失败');
    origin = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-trace-test-'));
    calls = 0;
    requestBody = '';
    mode = 'success';
    vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });
  afterAll(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  });

  const business = async (
    selected = true,
    options: { rejectBusiness?: boolean; files?: AiTraceFileStore; v2?: boolean } = {},
  ) => {
    const f = traceFixture(join(root, 'traces'), selected, options.files);
    if (options.v2) {
      f.run.modelMetadata.sdkExecution.contract = researchGenerationV2Contract.ref;
      Object.assign(f.run.modelMetadata, {
        frozenResearch: sealAiFrozenResearchV2(submissionV2Fixture().frozen),
        researchRoutes: [
          {
            provider: 'fixture',
            model: 'fixture-model',
            configurationFingerprint: 'fixture-fingerprint',
            adapter: 'openai-compatible-chat',
            mode: 'native_schema',
          },
        ],
      });
    }
    const registry = {
      defaultModel: () => 'fixture-model',
      readyContractCandidates: () => [
        {
          provider: {
            id: 'fixture',
            models: ['fixture-model'],
            metadata: {
              health: 'healthy',
              costPer1kInput: 0,
              costPer1kOutput: 0,
              costCurrency: 'USD',
            },
            sdkRuntime: () => ({
              baseURL: origin + '/v1',
              apiKey: 'sk-trace-secret',
              timeoutMs: 2000,
            }),
          },
          execution: {
            adapter: 'openai-compatible-chat',
            mode: 'native_schema',
            readiness: { configurationFingerprint: 'fixture-fingerprint' },
          },
        },
      ],
    };
    const service = new AiResearchSdkExecution(
      registry as never,
      new AiSdkGenerationAdapter(),
      f.store,
    );
    const common = {
      ownership: { runId: f.run.id, executionAttempt: 1 },
      run: f.run,
      messages: [{ role: 'user', content: '返回 JSON 研究结果。PRIVATE_PROMPT' }],
      startedAt: Date.now(),
      signal: new AbortController().signal,
    };
    const buildResult = (output: unknown) => {
      if (options.rejectBusiness) throw new Error('受控业务校验失败');
      return { inference: output, version: options.v2 ? 2 : 1 };
    };
    await f.capture.runClaimed(f.run as never, () =>
      service.execute(
        options.v2
          ? { ...common, contractVersion: 'research-generation-v2', buildResult }
          : { ...common, buildResult },
      ),
    );
    return f;
  };
  const artifact = (
    found: Awaited<ReturnType<ReturnType<typeof traceFixture>['read']>>,
    stage: string,
    direction: 'input' | 'output',
  ) => {
    const node = found.manifest.nodes.find((value) => value.stage === stage && value[direction]);
    if (!node?.[direction]) throw new Error(`缺少 ${stage} ${direction}`);
    return found.artifacts[node[direction].file]!.value;
  };

  it('成功时保存各节点 I/O，SDK 与业务消费同一次原响应，凭据和 reasoning 不落盘', async () => {
    const f = await business();
    const found = await f.read();
    expect(calls).toBe(1);
    expect(f.run.status).toBe('succeeded');
    expect(found.manifest).toMatchObject({
      status: 'succeeded',
      captureStatus: 'complete',
      nativeFetches: 1,
      issues: [],
    });
    expect(
      found.manifest.nodes.filter((node) => node.status !== 'skipped').map((node) => node.stage),
    ).toEqual(
      expect.arrayContaining([
        'business.execution',
        'sdk.generate',
        'http.request',
        'upstream.response',
        'business.result',
        'business.persistence',
        'business.final_state',
      ]),
    );
    expect(artifact(found, 'http.request', 'output')).toMatchObject({
      status: 200,
      serializedBody: { bytes: Buffer.byteLength(requestBody), sha256: digest(requestBody) },
    });
    expect(artifact(found, 'upstream.response', 'output')).toMatchObject({
      status: 200,
      completion: 'eof',
      rawBody: {
        bytes: Buffer.byteLength(traceSse()),
        sha256: digest(traceSse()),
        truncated: false,
      },
    });
    expect(
      Object.values(found.artifacts).find((value) => value.path.endsWith('-assistant-content.txt'))
        ?.value,
    ).toBe(traceContent);
    expect(artifact(found, 'sdk.generate', 'output')).toMatchObject({
      output: JSON.parse(traceContent) as unknown,
    });
    expect(artifact(found, 'business.final_state', 'output')).toMatchObject({
      status: 'succeeded',
      result: { version: 1 },
    });
    expect(artifact(found, 'business.execution', 'output')).toMatchObject({
      status: 'succeeded',
      result: { version: 1 },
    });
    const saved = JSON.stringify(found);
    expect(saved).toContain('PRIVATE_PROMPT');
    expect(saved).not.toMatch(/sk-trace-secret|PRIVATE_REASONING|SECRET_COOKIE/u);
    expect((await stat(found.directory)).mode & 0o777).toBe(0o700);
    for (const value of Object.values(found.artifacts))
      expect((await stat(value.path)).mode & 0o777).toBe(0o600);
    const sdk = found.manifest.nodes.find((node) => node.stage === 'sdk.generate')!;
    const http = found.manifest.nodes.find((node) => node.stage === 'http.request')!;
    expect(http.parentId).toBe(sdk.id);
  });

  it('合法 JSON 被 SDK Schema 拒绝时，上游全文与独立校验路径仍可反读，业务保持失败', async () => {
    mode = 'schema';
    const f = await business();
    const found = await f.read();
    expect(calls).toBe(1);
    expect(f.run).toMatchObject({
      status: 'failed',
      errorCode: 'research_schema_invalid',
      result: null,
    });
    expect(
      Object.values(found.artifacts).find((value) => value.path.endsWith('-assistant-content.txt'))
        ?.value,
    ).toBe('{"answer":"字段不符合合同"}');
    expect(artifact(found, 'sdk.generate', 'output')).toMatchObject({
      fact: { code: 'schema_invalid' },
      sdkOutputText: '{"answer":"字段不符合合同"}',
      independentContractCheck: {
        source: 'independent_check_after_sdk_error',
        jsonStatus: 'valid',
        schemaAccepted: false,
        issues: expect.arrayContaining([expect.objectContaining({ path: ['conclusion'] })]),
      },
    });
    expect(found.manifest.nodes.find((node) => node.stage === 'business.result')).toMatchObject({
      status: 'skipped',
      reason: 'not_reached',
    });
    expect(found.manifest).toMatchObject({ status: 'failed', captureStatus: 'complete' });
  });

  it.each(['http', 'sse'] as const)(
    '分清 %s 的 HTTP 状态与上游错误正文，不以 SDK 包装替代原响应',
    async (failure) => {
      mode = failure;
      const f = await business();
      const found = await f.read();
      expect(calls).toBe(1);
      expect(f.run.status).toBe('failed');
      expect(artifact(found, 'upstream.response', 'output')).toMatchObject({
        status: failure === 'http' ? 502 : 200,
        upstreamErrors: [upstreamError.error],
      });
      expect(found.manifest.nodes.find((node) => node.stage === 'sdk.generate')?.status).toBe(
        'failed',
      );
    },
  );

  it('当前完整 V2 Schema 失败也通过正式业务执行与 StateStore 留下上游文本及字段路径', async () => {
    mode = 'schema';
    const f = await business(true, { v2: true });
    const found = await f.read();
    expect(calls).toBe(1);
    expect(f.run).toMatchObject({
      status: 'failed',
      errorCode: 'research_schema_invalid',
      result: null,
    });
    expect(artifact(found, 'sdk.generate', 'input')).toMatchObject({
      contract: researchGenerationV2Contract.ref,
      schema: { source: 'zod_input_schema', jsonSchema: expect.any(Object) },
    });
    expect(artifact(found, 'sdk.generate', 'output')).toMatchObject({
      sdkOutputText: '{"answer":"字段不符合合同"}',
      independentContractCheck: {
        schemaAccepted: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ['version'] }),
          expect.objectContaining({ path: ['rationale'] }),
        ]),
      },
    });
    expect(found.manifest).toMatchObject({
      status: 'failed',
      captureStatus: 'complete',
      nativeFetches: 1,
    });
  });

  it('业务校验失败保留 SDK 成功和上游正文，最终状态不被 trace 改写', async () => {
    const f = await business(true, { rejectBusiness: true });
    const found = await f.read();
    expect(calls).toBe(1);
    expect(f.run).toMatchObject({
      status: 'failed',
      errorCode: 'research_business_invalid',
      result: null,
    });
    expect(found.manifest.nodes.find((node) => node.stage === 'sdk.generate')?.status).toBe(
      'succeeded',
    );
    expect(found.manifest.nodes.find((node) => node.stage === 'business.result')?.status).toBe(
      'failed',
    );
  });

  it('没有 HTTP 响应时留存请求错误，响应阶段明确未到达', async () => {
    mode = 'disconnect';
    const f = await business();
    const found = await f.read();
    expect(calls).toBe(1);
    expect(f.run.status).toBe('failed');
    expect(found.manifest.nodes.find((node) => node.stage === 'http.request')?.status).toBe(
      'failed',
    );
    expect(found.manifest.nodes.find((node) => node.stage === 'upstream.response')?.status).toBe(
      'skipped',
    );
  });

  it('默认关闭不创建私有目录，不增加状态读取，原业务仍只发送一次', async () => {
    const f = await business(false);
    expect(f.run.status).toBe('succeeded');
    expect(calls).toBe(1);
    expect(f.database.aiRun.findFirst).not.toHaveBeenCalled();
    await expect(stat(join(root, 'traces'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('派发前存储失败不调用 HTTP，并收敛到原所有权失败终态', async () => {
    const files = new AiTraceFileStore(join(root, 'traces'));
    vi.spyOn(files, 'open').mockRejectedValue(new Error('disk unavailable'));
    const f = await business(true, { files });
    expect(calls).toBe(0);
    expect(f.run).toMatchObject({
      status: 'failed',
      errorCode: 'research_trace_unavailable',
      result: null,
    });
  });

  it('派发后取证写入失败不覆盖 SDK 成功或业务终态，manifest 标记 incomplete', async () => {
    const files = new AiTraceFileStore(join(root, 'traces'));
    const open = files.open.bind(files);
    vi.spyOn(files, 'open').mockImplementation(async (...args) => {
      const directory = await open(...args);
      const write = directory.writeArtifact.bind(directory);
      vi.spyOn(directory, 'writeArtifact').mockImplementation(
        (...input: Parameters<AiTraceFiles['writeArtifact']>) => {
          if (input[1] === 'response-body') throw new Error('受控磁盘写入故障');
          return write(...input);
        },
      );
      return directory;
    });
    const f = await business(true, { files });
    const found = await f.read();
    expect(calls).toBe(1);
    expect(f.run.status).toBe('succeeded');
    expect(found.manifest).toMatchObject({ status: 'succeeded', captureStatus: 'incomplete' });
    expect(found.manifest.issues).toContain('response_artifact_failed');
    expect(
      Object.values(found.artifacts).find((value) => value.path.endsWith('-assistant-content.txt'))
        ?.value,
    ).toBe(traceContent);
  });

  it('SDK 取消不留下继续读取上游的 clone；取消事实与业务失败可反读', async () => {
    mode = 'hang';
    const f = traceFixture(join(root, 'traces'));
    const controller = new AbortController();
    await f.capture.runClaimed(f.run as never, async () => {
      const timeout = setTimeout(() => controller.abort(), 150);
      try {
        await new AiSdkGenerationAdapter().generate({
          requestId: randomUUID(),
          adapter: 'openai-compatible-chat',
          providerId: 'fixture',
          apiKey: 'sk-trace-secret',
          baseURL: origin + '/v1',
          model: 'fixture-model',
          messages: [{ role: 'user', content: '返回 JSON' }],
          contract: { id: 'research', version: 'research-generation-v2' },
          schema: z.object({ answer: z.string() }),
          mode: 'native_schema',
          transport: 'stream',
          timeout: { totalMs: 2000 },
          signal: controller.signal,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AiSdkGenerationError);
        expect((error as AiSdkGenerationError).fact.code).toBe('cancelled');
        await f.store.failOwned(
          { runId: f.run.id, executionAttempt: 1 },
          { errorCode: 'research_cancelled', errorSummary: '受控取消' },
        );
      } finally {
        clearTimeout(timeout);
      }
    });
    const found = await f.read();
    expect(calls).toBe(1);
    expect(found.manifest).toMatchObject({ status: 'failed', captureStatus: 'incomplete' });
    expect(
      found.manifest.issues.some((reason) =>
        /response_(?:read_error|cancelled|not_consumed)/u.test(reason),
      ),
    ).toBe(true);
  });

  it('结算拒绝旧 attempt 时原 CAS false 不变，最终读取不伪造终态', async () => {
    const f = traceFixture(join(root, 'traces'));
    await f.capture.runClaimed(f.run as never, async () => {
      const saved = await f.store.failOwned(
        { runId: f.run.id, executionAttempt: 2 },
        { errorCode: 'forged', errorSummary: '旧 attempt' },
      );
      expect(saved).toBe(false);
      await traceAiOperation('business.result', { output: '无模型的受控结果' }, async () => null);
    });
    const found = await f.read();
    expect(calls).toBe(0);
    expect(f.run.status).toBe('running');
    expect(found.manifest).toMatchObject({
      status: 'incomplete',
      captureStatus: 'incomplete',
      issues: ['terminal_state_not_observed'],
    });
  });
});
