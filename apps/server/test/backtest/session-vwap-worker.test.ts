import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { fixedSessionPlan, sessionVwapSnapshot } from './session-vwap-snapshot.fixture.js';
import { sessionVwapPlanConforms } from './session-vwap-model.fixture.js';

it.each([true, false])(
  '实际冻结 Worker 区分累计与滚动（累计=%s）并重复回放',
  async (cumulative) => {
    const root = mkdtempSync(join(tmpdir(), 'session-worker-'));
    try {
      expect(
        sessionVwapPlanConforms(
          cumulative ? 'session-vwap' : 'rolling-vwap',
          fixedSessionPlan(cumulative),
        ),
      ).toBe(true);
      const fixture = await sessionVwapSnapshot(root, fixedSessionPlan(cumulative));
      const result = await fixture.run();
      // 无平仓且收盘权益不变，夏普及平仓统计按既有口径不可用；不能伪造完整指标。
      expect(result.completeness).toBe('partial');
      expect(result.benchmarkCompatibility?.status).toBe('compatible');
      expect(result.benchmark?.totalReturn?.status).toBe('available');
      for (const metric of Object.values(result.metrics)) {
        if (metric.status === 'unavailable')
          expect(['ZERO_VOLATILITY', 'NO_CLOSED_TRADES']).toContain(metric.reason);
      }
      expect(await fixture.run()).toEqual(result);
      const execution = fixture.execute();
      expect(execution.fills).toHaveLength(cumulative ? 1 : 0);
      if (cumulative) {
        // 10:01完成后发信号；同刻10:01开盘已发生，严格后续10:02开盘成交。
        expect(execution.fills[0]).toMatchObject({
          side: 'buy',
          occurredAt: '2026-05-18T02:02:00.000Z',
        });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  120000,
);

it.each([true, false])(
  '三版研究坐标的累计／滚动配置原样冻结（累计=%s）',
  async (cumulative) => {
    const root = mkdtempSync(join(tmpdir(), 'session-worker-v3-'));
    try {
      const strategy = fixedSessionPlan(cumulative);
      strategy.schemaVersion = 'strategy-definition-v1';
      for (const source of strategy.signalSources) source.priceCoordinate = 'research';
      const before = structuredClone(strategy);
      const fixture = await sessionVwapSnapshot(root, strategy);
      expect(fixture.fixture.input.strategy).toEqual(before);
      expect(fixture.fixture.input.runConfig.executionPriceProtocol.priceBasis.adjustment).toBe(
        'hfq',
      );
      expect(fixture.execute().fills).toHaveLength(cumulative ? 1 : 0);
      const result = await fixture.run();
      expect(await fixture.run()).toEqual(result);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  120000,
);
