import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeToolSafely, executeAuditedTool } from '../../src/ai/tool-runtime.js';
import { createAiTimeoutPolicy } from '../../src/ai/timeout/ai-timeout-policy.js';
import type { AiTool } from '../../src/ai/contracts.js';

const allowed = new Set(['market:read'] as const);
afterEach(() => vi.useRealTimers());
describe('工具期限与取消', () => {
  it('收尾已占满余量时不启动工具或伪造阶段样本', async () => {
    const execute = vi.fn(async () => ({})),
      onObservation = vi.fn();
    expect(
      await executeToolSafely(
        { name: 'read', permission: 'market:read', execute },
        {},
        allowed,
        undefined,
        { taskDeadlineAt: Date.now() + 5000, onObservation },
      ),
    ).toMatchObject({ status: 'unavailable', errorCode: 'task_budget_exhausted' });
    expect(execute).not.toHaveBeenCalled();
    expect(onObservation).not.toHaveBeenCalled();
  });
  it('缺省20秒，下传取消并记录阶段，无法凭abort声明外部停止', async () => {
    vi.useFakeTimers();
    let received: AbortSignal | undefined;
    const tool: AiTool = {
      name: 'read',
      permission: 'market:read',
      execute: async (_input, signal) => {
        received = signal;
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        );
      },
    };
    const result = executeToolSafely(tool, {}, allowed);
    await vi.advanceTimersByTimeAsync(19999);
    expect(received?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({
      status: 'unavailable',
      errorCode: 'tool_timeout',
      cancellationRequested: true,
      stopConfirmed: false,
      timeout: { limitMs: 20000, stage: 'tool' },
    });
    expect(received?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('任务余量优先，非合作工具迟到返回也不会变成功', async () => {
    vi.useFakeTimers();
    let finish: ((value: unknown) => void) | undefined;
    const tool: AiTool = {
      name: 'read',
      permission: 'market:read',
      execute: async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    const result = executeToolSafely(tool, {}, allowed, undefined, {
      policy: createAiTimeoutPolicy('research'),
      taskDeadlineAt: Date.now() + 5010,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toMatchObject({
      status: 'unavailable',
      errorCode: 'task_budget_exhausted',
    });
    finish?.('late');
    await Promise.resolve();
    expect(await result).toMatchObject({ status: 'unavailable' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('父取消传至工具，拒绝迟到成功并保存安全审计', async () => {
    const parent = new AbortController();
    let received: AbortSignal | undefined;
    const tool: AiTool = {
      name: 'read',
      permission: 'market:read',
      execute: async (_input, signal) => {
        received = signal;
        return new Promise(() => undefined);
      },
    };
    const recorder = {
      recordToolCall: vi.fn(async (input: { outputSummary?: string }) => {
        void input;
        return { id: 'audit' };
      }),
    };
    const result = executeAuditedTool(recorder, 'run', tool, {}, allowed, undefined, {
      signal: parent.signal,
    });
    await Promise.resolve();
    parent.abort(new DOMException('cancelled', 'AbortError'));
    expect(await result).toMatchObject({
      status: 'unavailable',
      errorCode: 'cancelled',
      toolCallId: 'audit',
    });
    expect(received?.aborted).toBe(true);
    expect(
      JSON.parse(recorder.recordToolCall.mock.calls[0]?.[0].outputSummary ?? '{}'),
    ).toMatchObject({ errorCode: 'cancelled', stopConfirmed: false });
  });
  it('已知慢工具可覆盖，正常工具不创建模型空闲计时', async () => {
    vi.useFakeTimers();
    const tool: AiTool = {
      name: 'slow-read',
      permission: 'market:read',
      timeoutMs: 30000,
      execute: async () => new Promise((resolve) => setTimeout(() => resolve({ value: 1 }), 21000)),
    };
    const result = executeToolSafely(tool, {}, allowed);
    await vi.advanceTimersByTimeAsync(21000);
    expect(await result).toMatchObject({ status: 'ok', data: { value: 1 } });
    expect(vi.getTimerCount()).toBe(0);
  });
});
