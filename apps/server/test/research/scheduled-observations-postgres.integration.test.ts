import { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { createObservationHttpFixture } from './research-observation-http.fixture.js';
import { observationMarketFixture } from './research-observation-market.fixture.js';
import { RiskMonitoringController } from '../../src/automation/risk-monitoring.controller.js';

describe.skipIf(!databaseUrl)('关闭客户端后的服务端接续', () => {
  it('登记、关页、并发、到期缺料、晚到证书和重启均沿用原报告', async () => {
    const db = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    vi.useFakeTimers({ toFake: ['Date'] });
    const time = (iso: string) => {
      vi.setSystemTime(new Date(iso));
      return new Date(iso);
    };
    time('2026-10-19T08:00:00Z');
    await assertIsolated(db);
    const http = await createObservationHttpFixture(db);
    try {
      const old = await http.seed();
      const fresh = await http.seed({ scheduled: true });
      const evaluation = async () =>
        (await (await http.get(fresh.id)).json()).items[0].current?.evaluation;
      const tick = () => http.scheduler().run(new Date());
      await Promise.all([tick(), tick()]);
      expect(await evaluation()).toMatchObject({
        status: 'not_due',
        window: { endSession: '2026-10-26' },
      });
      expect(http.retained).not.toHaveBeenCalled();
      time('2026-10-26T08:00:00Z');
      await tick();
      expect(await evaluation()).toMatchObject({
        status: 'insufficient_data',
        reasons: ['price_unavailable'],
      });
      time('2026-10-27T08:00:00Z');
      await tick();
      expect(http.retained).toHaveBeenCalledTimes(1);
      http.published.mockResolvedValue(new Date());
      http.retained.mockResolvedValue(observationMarketFixture().selected);
      time('2026-10-27T08:05:00Z');
      await Promise.all([tick(), tick()]);
      expect(await evaluation()).toMatchObject({
        status: 'completed',
        economic: { returnRate: '0.1' },
      });
      await tick();
      expect(http.prices).not.toHaveBeenCalled();
      expect(
        await db.researchObservationVersion.count({ where: { observation: { runId: fresh.id } } }),
      ).toBe(3);
      expect(await db.researchObservation.count({ where: { runId: old.id } })).toBe(0);
    } finally {
      await http.close();
      await db.$disconnect();
      vi.useRealTimers();
    }
  });

  it('不再创建默认收盘排程，兼容恢复原有自定义任务且不直接执行扫描', async () => {
    const db = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    try {
      await assertIsolated(db);
      const schedules = new RiskMonitoringController(db as never);
      expect(await schedules.status()).toEqual([]);
      await expect(schedules.enable({})).rejects.toThrow('自动参与');
      expect(await schedules.status()).toEqual([]);
      const row = await db.automationJob.create({ data: {
        name: '历史自定义扫描', type: 'risk-evaluation', cron: '0 14 * * 1-5', timezone: 'Asia/Shanghai',
        enabled: false, retryPolicy: { maxAttempts: 1, backoffMs: 1000 }, lockTtlMs: 300_000,
      } });
      await expect(schedules.enable({})).rejects.toThrow('自动参与');
      expect(await schedules.enable({ jobId: row.id })).toMatchObject([
        { enabled: true, cron: '0 14 * * 1-5', lastRun: null },
      ]);
    } finally {
      await db.$disconnect();
    }
  });
});
