import type { Prisma } from '@prisma/client';
import type { AiExecutionSummary } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import { projectResearchReport } from '../../src/ai/ai-research-report-projection.js';
import { comparisonReport } from './research-comparison.fixture.js';

const contract = { id: 'research', version: 'research-generation-v2' } as const;
const time = '2026-10-23T01:00:00.000Z';
const cost = {
  status: 'estimated',
  amount: '0',
  currency: 'USD',
  source: 'fixture',
  pricingVersion: 'fixture-v1',
} as const;

function routedReport(change?: (execution: AiExecutionSummary) => void) {
  const fixture = comparisonReport({
    result: (result) => {
      result.model.modelId = 'resolved/model';
    },
  });
  fixture.row.model = 'router/auto';
  fixture.row.executionAttempt = 1;
  const execution: AiExecutionSummary = {
    version: 'sdk-execution-v1',
    contract,
    frozenPolicy: null,
    deadlineAt: null,
    generationStatus: 'complete',
    usageCompleteness: 'reported',
    continuationBlockedReason: null,
    requests: [
      {
        requestId: '10000000-0000-4000-8000-000000000010',
        sequence: 1,
        state: 'completed',
        reservation: {
          aiCalls: 1,
          inputTokens: 10,
          outputTokens: 10,
          cost,
          provider: fixture.row.provider!,
          model: fixture.row.model,
          configurationFingerprint: 'fixture-configuration',
        },
        preparedAt: time,
        dispatchingAt: time,
        dispatchExecutionAttempt: 1,
        completedAt: time,
        outcome: {
          status: 'complete',
          contract,
          finishReason: 'stop',
          schemaAccepted: true,
          actualModel: 'resolved/model',
        },
        error: null,
        usageRevisions: [
          {
            revision: 1,
            usage: { status: 'reported', inputTokens: 10, outputTokens: 10 },
            cost,
            recordedAt: time,
          },
        ],
        settledRevision: 1,
      },
    ],
  };
  change?.(execution);
  fixture.row.modelMetadata = JSON.parse(
    JSON.stringify({ ...(fixture.row.modelMetadata as object), sdkExecution: execution }),
  ) as Prisma.JsonObject;
  return fixture;
}

async function read(fixture: ReturnType<typeof comparisonReport>) {
  const transaction = {
    aiToolCall: { findMany: vi.fn().mockResolvedValue(fixture.calls) },
  } as unknown as Prisma.TransactionClient;
  return projectResearchReport(transaction, fixture.row, fixture.source.detail.historicalScope);
}

describe('V2 研究报告的请求模型与实际模型绑定', () => {
  it('保留原请求模型与结果模型相同且没有 SDK 审计的兼容路径', async () => {
    expect((await read(comparisonReport())).detail.availability).toBe('available');
  });

  it('凭同 Provider、同 attempt、同请求预留及精确实际模型的成功 SDK 审计读取路由模型', async () => {
    const fixture = routedReport();
    const original = structuredClone(fixture.row);
    const projected = await read(fixture);
    expect(projected.detail.availability).toBe('available');
    expect(projected.detail.result).toEqual(fixture.row.result);
    expect(fixture.row).toEqual(original);
  });

  it('没有 SDK 审计时仍拒绝不同的实际模型', async () => {
    const fixture = routedReport();
    delete (fixture.row.modelMetadata as Prisma.JsonObject).sdkExecution;
    expect((await read(fixture)).detail.availability).toBe('invalid');
  });

  it('报告模型篡改成任意值或原请求模型时，不以一次成功审计放行', async () => {
    for (const model of ['forged', 'router/auto']) {
      const fixture = routedReport();
      (fixture.row.result as { model: { modelId: string } }).model.modelId = model;
      const projected = await read(fixture);
      expect(projected.detail).toMatchObject({
        availability: 'invalid',
        result: null,
        summary: null,
      });
      expect(projected.calls).toEqual([]);
    }
  });

  it('旧 SDK 完成事实缺少实际模型时，仅兼容请求模型报告', async () => {
    const fixture = routedReport((execution) => {
      delete execution.requests[0]!.outcome!.actualModel;
    });
    expect((await read(fixture)).detail.availability).toBe('invalid');
    (fixture.row.result as { model: { modelId: string } }).model.modelId = 'router/auto';
    expect((await read(fixture)).detail.availability).toBe('available');
  });

  it('最后请求不匹配时，不借更早成功请求放行', async () => {
    const fixture = routedReport((execution) => {
      const latest = structuredClone(execution.requests[0]!);
      latest.requestId = '10000000-0000-4000-8000-000000000011';
      latest.sequence = 2;
      latest.outcome!.actualModel = 'other/model';
      execution.requests.push(latest);
    });
    expect((await read(fixture)).detail.availability).toBe('invalid');
  });

  const invalidAudits: [string, (execution: AiExecutionSummary) => void][] = [
    [
      '缺实际模型',
      (execution) => {
        delete execution.requests[0]!.outcome!.actualModel;
      },
    ],
    [
      '错误实际模型',
      (execution) => {
        execution.requests[0]!.outcome!.actualModel = 'other/model';
      },
    ],
    [
      '尚未完成',
      (execution) => {
        execution.generationStatus = 'pending';
      },
    ],
    [
      '未派发',
      (execution) => {
        execution.requests[0]!.dispatchingAt = null;
      },
    ],
    [
      '未完成请求',
      (execution) => {
        execution.requests[0]!.completedAt = null;
      },
    ],
    [
      '错误执行 attempt',
      (execution) => {
        execution.requests[0]!.dispatchExecutionAttempt = 2;
      },
    ],
    [
      '错误预留模型',
      (execution) => {
        execution.requests[0]!.reservation.model = 'other/route';
      },
    ],
    [
      '错误预留 Provider',
      (execution) => {
        execution.requests[0]!.reservation.provider = 'other';
      },
    ],
    [
      '缺配置摘要',
      (execution) => {
        delete execution.requests[0]!.reservation.configurationFingerprint;
      },
    ],
    [
      '结构未通过',
      (execution) => {
        execution.requests[0]!.outcome!.schemaAccepted = false;
      },
    ],
  ];
  it.each(invalidAudits)('拒绝%s的路由模型审计', async (_label, change) => {
    expect((await read(routedReport(change))).detail.availability).toBe('invalid');
  });

  it('SDK 审计也不允许跨 Provider 结果', async () => {
    const fixture = routedReport();
    fixture.row.provider = 'other';
    expect((await read(fixture)).detail.availability).toBe('invalid');
  });

  it('仍拒绝冻结 Tool 摘要损坏', async () => {
    const fixture = routedReport();
    fixture.calls[0]!.inputSummary = '{}';
    expect((await read(fixture)).detail.availability).toBe('invalid');
  });

  it('仍拒绝任务问题与冻结提交不一致', async () => {
    const fixture = routedReport();
    fixture.row.question = '不同的研究问题';
    expect((await read(fixture)).detail.availability).toBe('invalid');
  });
});
