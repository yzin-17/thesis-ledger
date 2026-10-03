import { describe, expect, it, vi } from 'vitest';
import * as navPreparation from '../../src/backtest/backtest-nav-preparation.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import { prepareNavRunConfigV3 } from '../../src/backtest/backtest-nav-preparation.js';
import {
  BacktestNavPreparationRepository,
  navPreparationReceiptContentChecksum,
  validateNavPreparationReceipt,
} from '../../src/backtest/backtest-nav-preparation-repository.js';
import { replayNavPreparationEvidence } from '../../src/backtest/backtest-nav-preparation-receipt.js';
import { navPreparationFixture } from './nav-preparation.fixtures.js';

async function createPreparedReceipt() {
  const fixture = navPreparationFixture();
  const evidence = await prepareNavRunConfigV3(fixture.options);
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
  const repository = new BacktestNavPreparationRepository({
    navBacktestPreparation: { create },
  } as unknown as PrismaService);
  return { fixture, request: fixture.request, evidence, create, repository };
}

function rowFrom(data: Record<string, unknown>) {
  return {
    strategyVersionId: data.strategyVersionId as string,
    preparationHash: data.preparationHash as string,
    contentChecksum: data.contentChecksum as string,
    request: data.request,
    evidence: data.evidence,
    expiresAt: data.expiresAt as Date,
  };
}

describe('NAV 准备收据仓储', () => {
  it('校验证据后仅创建不可覆盖收据，并可从完整原文重放', async () => {
    const { request, evidence, create, repository } = await createPreparedReceipt();
    const saved = await repository.save(request, evidence);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      strategyVersionId: evidence.binding.strategyVersionId,
      preparationHash: evidence.binding.preparationHash,
      contentChecksum: navPreparationReceiptContentChecksum(request, evidence),
      request,
      evidence,
      expiresAt: new Date('2026-09-30T15:17:00.000Z'),
    });
    expect(saved).toEqual({
      preparationId: create.mock.calls[0]![0].data.id,
      preparationHash: evidence.binding.preparationHash,
      expiresAt: '2026-09-30T15:17:00.000Z',
    });
    const persisted = rowFrom(create.mock.calls[0]![0].data);
    await expect(
      validateNavPreparationReceipt(persisted, () => Date.parse('2026-09-30T15:01:00.000Z')),
    ).resolves.toEqual(evidence);
  });

  it.each(['facts', 'context', 'route', 'request', 'preparation-hash'])(
    '在数据库内容校验和被重算后仍拒绝被替换的 %s',
    async (field) => {
      const { request, evidence, repository, create } = await createPreparedReceipt();
      await repository.save(request, evidence);
      const row = rowFrom(create.mock.calls[0]![0].data);
      if (field === 'preparation-hash') {
        row.preparationHash = 'f'.repeat(64);
      } else if (field === 'request') {
        row.request = structuredClone(request);
        (row.request as Record<string, unknown>).requestId = 'replacement';
      } else {
        row.evidence = structuredClone(evidence);
        const altered = row.evidence as Record<string, unknown>;
        if (field === 'facts') {
          (altered.facts as Array<Record<string, unknown>>)[0]!.nav = '999.00000000';
        } else if (field === 'context') {
          (
            (altered.context as Record<string, unknown>).calendar as Record<string, unknown>
          ).valuationDates = [];
        } else {
          const selection = altered.selection as Record<string, unknown>;
          const routeState = selection.routeState as Record<string, unknown>;
          (routeState.targets as Array<Record<string, unknown>>)[0]!.providerId = 'replacement';
        }
      }
      if (field !== 'preparation-hash') {
        row.contentChecksum = navPreparationReceiptContentChecksum(row.request, row.evidence);
      }
      await expect(
        validateNavPreparationReceipt(row, () => Date.parse('2026-09-30T15:01:00.000Z')),
      ).rejects.toMatchObject({ statusCode: 422, code: 'NAV_PREPARATION_RECEIPT_INVALID' });
    },
  );

  it('拒绝超出 15 分钟或已经过期的有效期', async () => {
    const { request, evidence, repository, create } = await createPreparedReceipt();
    await repository.save(request, evidence);
    const saved = rowFrom(create.mock.calls[0]![0].data);
    const extended = { ...saved, expiresAt: new Date('2026-09-30T15:18:00.000Z') };
    await expect(
      validateNavPreparationReceipt(extended, () => Date.parse('2026-09-30T15:01:00.000Z')),
    ).rejects.toMatchObject({ statusCode: 422, code: 'NAV_PREPARATION_RECEIPT_INVALID' });
    await expect(
      validateNavPreparationReceipt(saved, () => Date.parse('2026-09-30T15:17:00.000Z')),
    ).rejects.toMatchObject({ statusCode: 409, code: 'NAV_PREPARATION_RECEIPT_CONFLICT' });
  });

  it('数据库创建错误原样返回，不降级为校验失败', async () => {
    const { request, evidence } = await createPreparedReceipt();
    const databaseError = new Error('database unavailable');
    const create = vi.fn().mockRejectedValue(databaseError);
    const repository = new BacktestNavPreparationRepository({
      navBacktestPreparation: { create },
    } as unknown as PrismaService);
    await expect(repository.save(request, evidence)).rejects.toBe(databaseError);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('未知准备程序错误保持原样透传', async () => {
    const fixture = navPreparationFixture();
    const evidence = await prepareNavRunConfigV3(fixture.options);
    const programError = new Error('unexpected preparation failure');
    const replaySpy = vi
      .spyOn(navPreparation, 'prepareNavRunConfigV3')
      .mockRejectedValueOnce(programError);
    try {
      await expect(replayNavPreparationEvidence(fixture.request, evidence)).rejects.toBe(
        programError,
      );
    } finally {
      replaySpy.mockRestore();
    }
  });
});
