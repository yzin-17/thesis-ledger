import { describe, expect, it } from 'vitest';
import {
  aiResearchDisplayProjectionSchema,
  aiResearchListQuerySchema,
  aiResearchPageStateSchema,
  classifyAiResearchTask,
  resolveAiResearchResultStatus,
} from '../src/index.js';

const runId = '11111111-1111-4111-8111-111111111111';
const callId = '22222222-2222-4222-8222-222222222222';
const time = '2026-09-18T08:00:00Z';

const validResult = {
  version: 1 as const,
  provider: 'fixture',
  conclusion: '估值偏高，需关注现金流兑现。',
  evidence: [
    {
      claim: '估值事实',
      citations: [
        {
          toolCallId: callId,
          tool: 'valuation',
          sourceId: '600519.SH',
          provider: 'fixture',
          observedAt: time,
        },
      ],
    },
  ],
  risks: ['政策变化无法预测'],
  unknowns: ['未来事件存在一般不确定性'],
  signals: [],
  disclaimer: '仅供研究参考。',
  createdAt: time,
};

describe('研究助手展示契约', () => {
  it('固定新列表查询的缺省值并拒绝非法输入，旧列表调用无需套用该模式', () => {
    expect(aiResearchListQuerySchema.parse({ view: 'research' })).toEqual({
      view: 'research',
      limit: 50,
      source: 'all',
      includeInternal: false,
      sort: 'updated_desc',
    });
    expect(() => aiResearchListQuerySchema.parse({ view: 'research', limit: 101 })).toThrow();
    expect(() =>
      aiResearchListQuerySchema.parse({ view: 'research', status: 'unknown' }),
    ).toThrow();
    expect(() => aiResearchListQuerySchema.parse({ view: 'legacy' })).toThrow();
  });

  it('固定 URL 页面状态，详情和阅读模式必须携带精确任务 ID', () => {
    expect(aiResearchPageStateSchema.parse({})).toMatchObject({
      mode: 'list',
      selectedRunId: null,
      status: 'all',
      source: 'all',
    });
    expect(() => aiResearchPageStateSchema.parse({ mode: 'drawer' })).toThrow();
    expect(
      aiResearchPageStateSchema.parse({ mode: 'reading', selectedRunId: runId }).selectedRunId,
    ).toBe(runId);
  });

  it('只用已核验实验关系识别内部任务，不因缺少关系推断手动来源', () => {
    expect(
      classifyAiResearchTask({
        promptVersion: 'strategy-optimization-v1',
        context: { scope: 'strategy', strategyVersionId: 'version-1' },
        optimizationExperimentId: 'experiment-1',
        experimentRelation: 'verified',
      }),
    ).toBe('experiment_internal');
    expect(
      classifyAiResearchTask({
        promptVersion: 'strategy-optimization-v1',
        context: { scope: 'strategy', strategyVersionId: 'version-1' },
        optimizationExperimentId: 'wrong-experiment',
        experimentRelation: 'conflict',
      }),
    ).toBe('unknown');
    expect(
      classifyAiResearchTask({
        promptVersion: 'research-v1',
        context: { scope: 'strategy', strategyVersionId: 'version-1' },
        experimentRelation: 'missing',
      }),
    ).toBe('research');
    expect(
      classifyAiResearchTask({
        promptVersion: 'legacy-v0',
        context: { scope: 'portfolio' },
        experimentRelation: 'missing',
      }),
    ).toBe('unknown');
  });

  it('把普通风险和 unknowns 保留为正文，不凭文本猜测数据缺口', () => {
    expect(
      resolveAiResearchResultStatus({
        executionStatus: 'succeeded',
        taskKind: 'research',
        result: validResult,
        toolCallOwnership: 'verified',
        ownedToolCallIds: [callId],
      }),
    ).toMatchObject({
      primaryStatus: 'completed',
      resultAvailability: 'available',
      verificationReason: null,
    });
  });

  it('只根据明确结构化依据降级为结果有缺口', () => {
    expect(
      resolveAiResearchResultStatus({
        executionStatus: 'succeeded',
        taskKind: 'research',
        result: validResult,
        toolCallOwnership: 'verified',
        ownedToolCallIds: [callId],
        dataGaps: [{ code: 'MARKET_DATA_UNAVAILABLE', summary: '本研究依赖的行情读取失败' }],
      }),
    ).toMatchObject({
      primaryStatus: 'result_gap',
      resultAvailability: 'gap',
      verificationReason: '本研究依赖的行情读取失败',
    });
  });

  it.each([
    ['缺失结果', null, 'missing'],
    ['无效结果', { conclusion: '仍可安全读取的文本' }, 'invalid'],
  ])('%s 与一般待核验状态分离', (_label, result, availability) => {
    expect(
      resolveAiResearchResultStatus({
        executionStatus: 'succeeded',
        taskKind: 'research',
        result,
        toolCallOwnership: 'verified',
        ownedToolCallIds: [],
      }).resultAvailability,
    ).toBe(availability);
  });

  it('兼容缺少 toolCallId 的旧记录，但拒绝已经提供的错误关联 ID', () => {
    const legacy = {
      ...validResult,
      evidence: [
        {
          claim: '历史事实',
          citations: [
            {
              tool: 'valuation',
              sourceId: '600519.SH',
              provider: 'fixture',
              observedAt: time,
            },
          ],
        },
      ],
    };
    expect(
      resolveAiResearchResultStatus({
        executionStatus: 'succeeded',
        taskKind: 'research',
        result: legacy,
        toolCallOwnership: 'verified',
        ownedToolCallIds: [],
      }).primaryStatus,
    ).toBe('completed');
    expect(
      resolveAiResearchResultStatus({
        executionStatus: 'succeeded',
        taskKind: 'research',
        result: validResult,
        toolCallOwnership: 'verified',
        ownedToolCallIds: [],
      }),
    ).toMatchObject({ primaryStatus: 'result_unavailable', resultAvailability: 'invalid' });
  });

  it('引用归属事实未加载时保留待核验，不冒充结果缺失', () => {
    expect(
      resolveAiResearchResultStatus({
        executionStatus: 'succeeded',
        taskKind: 'research',
        result: validResult,
        toolCallOwnership: 'unavailable',
      }),
    ).toMatchObject({
      primaryStatus: 'pending_verification',
      resultAvailability: 'pending_verification',
    });
  });

  it('实验内部与未知类型不套用通用研究契约，未知执行状态保持只读', () => {
    expect(
      resolveAiResearchResultStatus({
        executionStatus: 'succeeded',
        taskKind: 'experiment_internal',
        result: validResult,
        toolCallOwnership: 'verified',
      }).resultAvailability,
    ).toBe('unsupported');
    expect(
      resolveAiResearchResultStatus({
        executionStatus: 'future-state',
        taskKind: 'unknown',
        result: validResult,
        toolCallOwnership: 'unavailable',
      }).primaryStatus,
    ).toBe('unrecognized');
  });

  it('展示投影只接受安全公开字段和明确版本，不接收原始模型元数据', () => {
    const projection = {
      id: runId,
      question: '当前主要风险？',
      taskKind: 'research',
      object: { type: 'position', label: '持仓', name: '贵州茅台', code: '600519.SH' },
      source: { type: 'position', label: '持仓研究', name: '贵州茅台' },
      executionStatus: 'succeeded',
      primaryStatus: 'completed',
      resultAvailability: 'available',
      summary: '估值偏高。',
      verificationReason: null,
      dataVersion: 'run:2026-09-18T08:00:00.000Z:tool:2',
      updatedAt: time,
      capabilities: {
        canRead: true,
        canReload: true,
        canRetry: false,
        canCancel: false,
        canOpenSource: true,
      },
    };
    expect(aiResearchDisplayProjectionSchema.parse(projection)).toEqual(projection);
    expect(
      aiResearchDisplayProjectionSchema.safeParse({
        ...projection,
        modelMetadata: { secret: true },
      }).success,
    ).toBe(false);
  });
});
