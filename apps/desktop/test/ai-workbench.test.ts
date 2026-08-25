import { describe, expect, it, vi } from 'vitest';
import type { DesktopRequestClient } from '../src/features/shared/request.js';
import {
  createAiRun,
  fetchAiCapabilities,
  fetchAiRun,
  fetchAiRuns,
  fetchAiToolCalls,
} from '../src/features/ai/ai.api.js';
import { aiKeys, shouldPollAiRuns } from '../src/features/ai/ai.queries.js';

const clientFor = (response: unknown) => {
  const request = vi.fn(async <T>(path: string, init?: RequestInit) => {
    void path;
    void init;
    return response as T;
  });
  return { client: { request } as unknown as DesktopRequestClient, request };
};

describe('AI 研究工作台数据契约', () => {
  it('创建研究只提交问题、真实上下文、模板和重试关系', async () => {
    const { client, request } = clientFor({ id: 'run-2', status: 'queued' });
    await createAiRun(
      {
        question: '当前组合最主要的风险是什么？',
        context: { scope: 'portfolio', portfolioId: 'portfolio-1' },
        templateId: 'primary-risks',
        retryOfRunId: '11111111-1111-4111-8111-111111111111',
      },
      client,
    );
    expect(request).toHaveBeenCalledWith(
      '/ai/runs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          question: '当前组合最主要的风险是什么？',
          context: { scope: 'portfolio', portfolioId: 'portfolio-1' },
          templateId: 'primary-risks',
          retryOfRunId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
    );
    expect(request.mock.calls[0]?.[1]?.body).not.toEqual(expect.stringContaining('provider'));
  });

  it('列表筛选与详情 key 隔离，详情按任务 ID 请求', async () => {
    const list = clientFor([]);
    await fetchAiRuns({ status: 'failed', limit: 20 }, list.client);
    expect(list.request).toHaveBeenCalledWith('/ai/runs?limit=20&status=failed', undefined);
    const detail = clientFor({ id: 'run-1', toolCalls: [] });
    await fetchAiRun('run/1', detail.client);
    expect(detail.request).toHaveBeenCalledWith('/ai/runs/run%2F1', undefined);
    expect(aiKeys.runs({ status: 'failed' })).not.toEqual(aiKeys.runs({ status: 'succeeded' }));
    expect(aiKeys.run('run-1')).not.toEqual(aiKeys.run('run-2'));
  });

  it('只有非终态任务开启轮询', () => {
    expect(shouldPollAiRuns([{ status: 'queued' }])).toBe(true);
    expect(shouldPollAiRuns([{ status: 'running' }, { status: 'succeeded' }])).toBe(true);
    expect(
      shouldPollAiRuns([{ status: 'succeeded' }, { status: 'failed' }, { status: 'cancelled' }]),
    ).toBe(false);
    expect(shouldPollAiRuns([{ status: 'legacy-status' }])).toBe(false);
  });

  it('读取分页 envelope、能力预检和懒加载的 Tool 调用', async () => {
    const list = clientFor({ items: [], nextCursor: 'cursor-2', hasMore: true });
    await expect(
      fetchAiRuns({ status: 'running', limit: 2, cursor: 'cursor-1' }, list.client),
    ).resolves.toEqual({
      items: [],
      nextCursor: 'cursor-2',
      hasMore: true,
    });
    expect(list.request).toHaveBeenCalledWith(
      '/ai/runs?limit=2&status=running&cursor=cursor-1',
      undefined,
    );
    const capabilities = clientFor({
      canStart: true,
      providers: [],
      checkedAt: '2026-08-26T00:00:00Z',
    });
    await fetchAiCapabilities(capabilities.client);
    expect(capabilities.request).toHaveBeenCalledWith('/ai/runs/capabilities', undefined);
    const tools = clientFor({ items: [], nextCursor: null, hasMore: false });
    await fetchAiToolCalls('run/1', { limit: 10, cursor: 'tool-cursor' }, tools.client);
    expect(tools.request).toHaveBeenCalledWith(
      '/ai/runs/run%2F1/tool-calls?limit=10&cursor=tool-cursor',
      undefined,
    );
  });
});
