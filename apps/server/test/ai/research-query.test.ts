import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AiController } from '../../src/ai/ai.controller.js';
import { AiRunService } from '../../src/ai/ai.service.js';

const runId = '11111111-1111-4111-8111-111111111111';
const toolCallId = '21111111-1111-4111-8111-111111111111';
const updatedAt = new Date('2026-09-18T08:00:00.000Z');

const result = {
  version: 1,
  provider: 'fixture',
  conclusion: '组合集中度偏高。',
  evidence: [
    {
      claim: '集中度事实',
      citations: [
        {
          toolCallId,
          tool: 'portfolio',
          sourceId: 'portfolio',
          provider: 'fixture',
          observedAt: '2026-09-18T07:59:00Z',
        },
      ],
    },
  ],
  risks: [],
  unknowns: [],
  signals: [],
  disclaimer: '仅供研究参考。',
  createdAt: '2026-09-18T08:00:00Z',
};

const row = {
  id: runId,
  provider: 'fixture',
  model: 'research-fixture',
  promptVersion: 'research-v1',
  status: 'succeeded',
  question: '当前组合有哪些风险？',
  inputTokens: 10,
  outputTokens: 20,
  cost: new Prisma.Decimal(0),
  result,
  context: { scope: 'portfolio' },
  modelMetadata: { fallbackErrors: ['provider-a unavailable'], secret: 'must-not-leak' },
  errorCode: null,
  errorSummary: null,
  durationMs: 1200,
  startedAt: updatedAt,
  completedAt: updatedAt,
  retryOfRunId: null,
  createdAt: updatedAt,
  updatedAt,
  relationExperimentId: null,
};

const fixture = (rows = [row]) => {
  const queryRaw = vi.fn(async (query: Prisma.Sql) => {
    void query;
    return rows;
  });
  const aiToolCallFindMany = vi.fn(async () => [{ id: toolCallId, aiRunId: runId }]);
  const service = new AiRunService({
    $queryRaw: queryRaw,
    aiToolCall: { findMany: aiToolCallFindMany },
    account: { findMany: vi.fn(async () => []) },
    asset: { findMany: vi.fn(async () => []) },
    strategyVersion: { findMany: vi.fn(async () => []) },
  } as never);
  return { service, queryRaw, aiToolCallFindMany };
};

describe('研究助手只读查询', () => {
  it('新查询模式按 updatedAt + id 排序，在服务端应用搜索和范围条件', async () => {
    const { service, queryRaw } = fixture();
    const page = await service.listResearchPage({
      view: 'research',
      search: '组合风险',
      status: 'succeeded',
    });

    expect(page).toMatchObject({ hasMore: false, nextCursor: null });
    const query = queryRaw.mock.calls[0]?.[0] as Prisma.Sql;
    expect(query.sql).toContain('r."question" ILIKE');
    expect(query.sql).toContain('NOT');
    expect(query.sql).toContain('ORDER BY r."updatedAt" DESC, r."id" DESC');
    expect(query.values).toContain('%组合风险%');
    expect(query.values).toContain('succeeded');
  });

  it('列表批量核验引用并返回安全展示投影，不返回完整结果或原始元数据', async () => {
    const { service, aiToolCallFindMany } = fixture();
    const page = await service.listResearchPage({ view: 'research' });

    expect(aiToolCallFindMany).toHaveBeenCalledTimes(1);
    expect(page.items[0]).toMatchObject({
      id: runId,
      display: {
        primaryStatus: 'completed',
        resultAvailability: 'available',
        summary: '组合集中度偏高。',
        source: { type: 'portfolio', label: '组合研究' },
      },
    });
    expect(page.items[0]).not.toHaveProperty('result');
    expect(page.items[0]).not.toHaveProperty('modelMetadata');
    expect(page.items[0]).toMatchObject({ execution: null, usageCompleteness: 'legacy_unknown' });
    expect(page.items[0]).toHaveProperty('fallbackSummary', 'provider-a unavailable');
  });

  it('当前页从 1 条增加到多条时，引用关联仍只执行一次批量查询', async () => {
    const one = fixture([row]);
    await one.service.listResearchPage({ view: 'research' });
    expect(one.aiToolCallFindMany).toHaveBeenCalledTimes(1);

    const manyRows = [
      row,
      { ...row, id: '12111111-1111-4111-8111-111111111111' },
      { ...row, id: '13111111-1111-4111-8111-111111111111' },
    ];
    const many = fixture(manyRows);
    await many.service.listResearchPage({ view: 'research' });
    expect(many.aiToolCallFindMany).toHaveBeenCalledTimes(1);
    expect(many.aiToolCallFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          aiRunId: {
            in: manyRows.map((item) => item.id),
          },
        },
      }),
    );
  });

  it('详情复用同一展示事实，同时保留完整公开结果', async () => {
    const { service } = fixture();
    const detail = await service.researchDetail(runId);

    expect(detail).toMatchObject({
      id: runId,
      result,
      execution: null,
      usageCompleteness: 'legacy_unknown',
      display: { primaryStatus: 'completed', dataVersion: expect.any(String) },
    });
    expect(detail).not.toHaveProperty('modelMetadata');
  });

  it('Controller 仅在显式 research view 下启用新语义并严格解析布尔范围', () => {
    const runs = {
      listResearchPage: vi.fn(),
      listPage: vi.fn(),
      list: vi.fn(),
    };
    const controller = new AiController(runs as never);

    controller.history('50', 'succeeded', undefined, 'research', '风险', 'strategy', 'true');
    expect(runs.listResearchPage).toHaveBeenCalledWith(
      expect.objectContaining({
        view: 'research',
        limit: '50',
        includeInternal: true,
        source: 'strategy',
      }),
    );
    expect(runs.listPage).not.toHaveBeenCalled();
    expect(() =>
      controller.history('50', undefined, undefined, 'research', undefined, undefined, 'yes'),
    ).toThrow();

    controller.history('20', 'failed');
    expect(runs.listPage).toHaveBeenCalledWith(20, 'failed', undefined);
  });

  it('详情 research view 在进入 SQL 查询前拒绝非法 ID', () => {
    const runs = { researchDetail: vi.fn(), resume: vi.fn() };
    const controller = new AiController(runs as never);
    expect(() => controller.resume('not-a-uuid', 'research')).toThrow();
    expect(runs.researchDetail).not.toHaveBeenCalled();
    controller.resume(runId, 'research');
    expect(runs.researchDetail).toHaveBeenCalledWith(runId);
  });
});
