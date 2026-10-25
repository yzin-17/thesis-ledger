import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResearchController } from '../../src/research/research.controller.js';
import { AiResearchSubmissionV2 } from '../../src/ai/ai-research-submission-v2.js';
import { sealAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { createAiTraceReference } from '../../src/ai/trace/ai-trace-contract.js';
import { withAiTraceReference } from '../../src/ai/trace/ai-trace-context.js';
import { submissionV2Fixture } from './research-submission-v2.fixture.js';

afterEach(() => vi.unstubAllEnvs());

describe('显式 trace 创建与原有门禁', () => {
  const http = (header?: string | string[]) => {
    const request = Object.assign(new EventEmitter(), {
      query: {},
      headers: header === undefined ? {} : { 'x-thesis-ai-trace': header },
      aborted: false,
    });
    const response = Object.assign(new EventEmitter(), {
      writableEnded: false,
      destroyed: false,
      setHeader: vi.fn(),
    });
    return { request, response, principal: { id: randomUUID() } };
  };
  it('未选择 trace 时保留原提交签名，选中时仅传服务端生成的引用并回显 ID', async () => {
    const submit = vi.fn().mockResolvedValue({ reused: false, runId: randomUUID() });
    const controller = new ResearchController({ submit } as never);
    const off = http();
    await controller.submit(
      {},
      off.principal as never,
      off.request as never,
      off.response as never,
    );
    expect(submit.mock.calls[0]).toHaveLength(3);
    expect(off.response.setHeader).not.toHaveBeenCalled();
    const on = http('capture-v1');
    await controller.submit({}, on.principal as never, on.request as never, on.response as never);
    const reference = submit.mock.calls[1]![3] as ReturnType<typeof createAiTraceReference>;
    expect(reference).toMatchObject({
      version: 'ai-execution-trace-v1',
      traceId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    expect(on.response.setHeader).toHaveBeenCalledExactlyOnceWith(
      'X-Thesis-AI-Trace-Id',
      reference.traceId,
    );
    expect(on.request.listenerCount('aborted')).toBe(0);
    expect(on.response.listenerCount('close')).toBe(0);
  });
  it.each(['enabled', 'client-trace-id', ['capture-v1', 'capture-v1']])(
    '拒绝非法 header 值 %j，不进入准备或创建',
    async (header) => {
      const submit = vi.fn();
      const controller = new ResearchController({ submit } as never);
      const h = http(header);
      await expect(
        controller.submit({}, h.principal as never, h.request as never, h.response as never),
      ).rejects.toThrow('研究 trace 请求头无效');
      expect(submit).not.toHaveBeenCalled();
    },
  );
  it('复用旧任务或准备失败不回显未保存的新引用', async () => {
    const submit = vi.fn().mockResolvedValue({ reused: true });
    const controller = new ResearchController({ submit } as never);
    const h = http('capture-v1');
    await controller.submit({}, h.principal as never, h.request as never, h.response as never);
    expect(h.response.setHeader).not.toHaveBeenCalled();
    submit.mockRejectedValue(new Error('范围校验失败'));
    await expect(
      controller.submit({}, h.principal as never, h.request as never, h.response as never),
    ).rejects.toThrow('范围校验失败');
    expect(h.response.setHeader).not.toHaveBeenCalled();
  });

  const submission = () => {
    const frozen = sealAiFrozenResearchV2(submissionV2Fixture().frozen);
    let row: Record<string, unknown> | null = null;
    const create = vi.fn(({ data }: { data: Record<string, unknown> }) => {
      row = { id: randomUUID(), ...data };
      return Promise.resolve(row);
    });
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      aiRun: { findUnique: vi.fn(() => Promise.resolve(row)), create },
    };
    const prisma = {
      $transaction: (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction),
    };
    const access = {
      assertSubmission: vi.fn().mockResolvedValue(undefined),
      assertSnapshot: vi.fn().mockResolvedValue(undefined),
    };
    const providers = {
      strictReadyContract: () => ({
        provider: {
          id: 'fixture',
          metadata: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
        },
        execution: {
          adapter: 'openai-compatible-chat',
          mode: 'native_schema',
          readiness: { configurationFingerprint: 'fixture-fingerprint' },
        },
      }),
    };
    const routing = {
      read: () =>
        Promise.resolve({
          revision: frozen.researchSettingsRevision,
          researchDefault: { providerId: 'fixture', model: 'fixture-model' },
        }),
    };
    return {
      frozen,
      create,
      access,
      service: new AiResearchSubmissionV2(prisma as never, providers as never, routing as never),
    };
  };
  it('仅新任务保存轻量引用，重复提交保持原记录及摘要，不重新冻结', async () => {
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    vi.stubEnv('AI_RESEARCH_POLICY_JSON', undefined);
    const f = submission();
    const reference = createAiTraceReference();
    const owner = randomUUID();
    const first = await withAiTraceReference(reference, () =>
      f.service.start(owner, f.frozen, f.access),
    );
    expect(first.run.modelMetadata).toMatchObject({ diagnosticTrace: reference });
    const second = await withAiTraceReference(createAiTraceReference(), () =>
      f.service.start(owner, f.frozen, f.access),
    );
    expect(second).toMatchObject({ reused: true, run: first.run });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.access.assertSubmission).toHaveBeenCalled();
    expect(f.access.assertSnapshot).toHaveBeenCalled();
  });
  it('未选择 trace 时不保存引用，显式选择也不能绕过 V2 关闭', async () => {
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    vi.stubEnv('AI_RESEARCH_POLICY_JSON', undefined);
    const f = submission();
    const first = await f.service.start(randomUUID(), f.frozen, f.access);
    expect(first.run.modelMetadata).not.toHaveProperty('diagnosticTrace');
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'false');
    const blocked = submission();
    await expect(
      withAiTraceReference(createAiTraceReference(), () =>
        blocked.service.start(randomUUID(), blocked.frozen, blocked.access),
      ),
    ).rejects.toThrow();
    expect(blocked.create).not.toHaveBeenCalled();
  });
});
