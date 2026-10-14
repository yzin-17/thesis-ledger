import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backtestNavPreparationRequestV3Schema } from '@thesis-ledger/schemas';
import { prepareNavRunConfigV3 } from '../../src/backtest/backtest-nav-preparation.js';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { navPreparationFixture as fixture } from './nav-preparation.fixtures.js';

describe('NAV 准备合同与完整输入核验', () => {
  it('冻结在采集后，绑定全部内容并可经现行 Store 冻结读回', async () => {
    const f = fixture();
    const result = await prepareNavRunConfigV3(f.options);
    expect(result.scope).toBe('nav-input-plan');
    expect(result.runConfig.dataAsOf).toBe('2026-09-30T15:02:00Z');
    expect(result.selection.request.dataAsOf).toBe('2026-09-30T15:03:00.000Z');
    expect(result.context.responseRaw).toBe(f.source.response.responseRaw);
    expect(result.plan.expectedValuationDates).toEqual(['2026-09-07', '2026-09-08']);
    expect(result.plan.priceInputs.map((input) => input.purpose)).toEqual([
      'execution',
      'signal',
      'benchmark',
    ]);
    expect(result.plan.periodEnd.tailTradingDays).toBe(1);
    expect(result.binding.strategyContentHash).toBe(hashCanonicalManifest(f.strategy));
    expect(result.binding.intentHash).toBe(hashCanonicalManifest(f.request));
    expect(result.binding.runConfigChecksum).toBe(hashCanonicalManifest(result.runConfig));
    expect(result.binding.inputPlanHash).toBe(hashCanonicalManifest(result.plan));
    expect(result.binding.sourceRequestHash).toBe(hashCanonicalManifest(result.selection.request));
    expect(result.binding.sourceResponseHash).toBe(
      hashCanonicalManifest(result.selection.response),
    );
    expect(result.binding.routeStateHash).toBe(hashCanonicalManifest(result.selection.routeState));
    expect(result.binding.admissionHash).toBe(
      hashCanonicalManifest(result.selection.response.admission),
    );
    const { preparationHash, ...binding } = result.binding;
    expect(preparationHash).toBe(hashCanonicalManifest(binding));
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.read.mock.calls[0]![0]).toMatchObject({ warmupPeriods: 1, tailTradingDays: 1 });
    const directory = await mkdtemp(join(tmpdir(), 'nav-preparation-test-'));
    try {
      const store = new LocalNavSnapshotStore(directory);
      const response = result.selection.response;
      const manifest = await store.freeze({
        runId: 'nav-preparation',
        strategyVersionId: f.request.strategyVersionId,
        facts: result.facts,
        context: result.context,
        source: {
          ...response.source,
          routeKey: response.routeKey,
          target: {
            providerId: response.routeTarget.providerId,
            upstreamSource: response.routeTarget.upstreamSource,
          },
          policyRevision: response.effectivePolicyRevision,
        },
      });
      const replay = await store.replay('nav-preparation');
      expect(replay.manifest).toEqual(manifest);
      expect(replay.context).toEqual(result.context);
      expect(replay.plan).toEqual(result.plan);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each(['fund', 'decision', 'qdii', 'model', 'mode', 'caller-time', 'cash', 'range', 'strict'])(
    '意图拒绝 %s',
    (mode) => {
      const f = fixture();
      const input: Record<string, unknown> = structuredClone(f.request);
      if (mode === 'fund')
        input.calendarDecisionRaw = f.request.calendarDecisionRaw.replace('161725', '000001');
      if (mode === 'decision') input.domesticRuleDecisionRaw = null;
      if (mode === 'qdii') input.fundType = 'qdii';
      if (mode === 'model') f.request.runConfig.executionModel.scope.symbol = '000001.OF';
      if (mode === 'mode') input.freezeTimePolicy = 'requested-time';
      if (mode === 'caller-time')
        input.runConfig = { ...f.request.runConfig, dataAsOf: '2026-10-01T00:00:00Z' };
      if (mode === 'cash') input.runConfig = { ...f.request.runConfig, baseCurrency: 'USD' };
      if (mode === 'range') input.runConfig = { ...f.request.runConfig, endDate: '2026-09-07' };
      if (mode === 'strict') input.visibilityMode = 'strict-publication';
      expect(
        backtestNavPreparationRequestV3Schema.safeParse(mode === 'model' ? f.request : input)
          .success,
      ).toBe(false);
    },
  );
  it.each(['strategy', 'signal', 'fees', 'future-decision', 'budget'])(
    '在来源调用前拒绝 %s',
    async (mode) => {
      const f = fixture();
      if (mode === 'strategy') f.strategy.executionInstrument.symbol = '000001.OF';
      if (mode === 'signal') f.strategy.signalSources[0]!.asset.symbol = '000001.OF';
      if (mode === 'fees') f.strategy.cost.commissionRate = '0.01';
      if (mode === 'future-decision')
        f.request.calendarDecisionRaw = f.request.calendarDecisionRaw.replace('14:00', '16:00');
      if (mode === 'budget') f.options.acquisitionTimeoutMs = 0;
      await expect(prepareNavRunConfigV3(f.options)).rejects.toBeDefined();
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it.each([
    'clock-back',
    'timeout',
    'future-source',
    'future-fact',
    'expired',
    'missing',
    'records',
    'rule',
    'warmup',
    'tail',
    'disclosure',
  ])('来源成功后仍拒绝 %s', async (mode) => {
    const f = fixture();
    if (mode === 'clock-back') f.times[1] = '2026-09-30T14:59:00Z';
    if (mode === 'timeout') f.times[1] = '2026-09-30T15:04:00Z';
    if (mode === 'future-source')
      f.source.response.source.capturedAt = '2026-09-30T15:02:00.000001Z';
    if (mode === 'future-fact')
      f.source.response.facts[0]!.availableAt = '2026-09-30T15:02:00.000001Z';
    if (mode === 'expired') f.source.response.admission.validUntil = '2026-09-30T15:02:00Z';
    if (mode === 'missing') f.source.response.facts.pop();
    if (mode === 'records')
      f.source.response.publicationRecords[1] = f.source.response.publicationRecords[0]!;
    if (mode === 'rule') f.source.response.ruleRaw = '{}';
    if (mode === 'warmup') f.source.response.calendar.valuationDates.shift();
    if (mode === 'tail') f.source.response.calendar.tradingDates.pop();
    if (mode === 'disclosure') f.source.response.calendar.disclosureWorkDates = ['2026-09-07'];
    await expect(prepareNavRunConfigV3(f.options)).rejects.toBeDefined();
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it('来源失败只调用一次', async () => {
    const f = fixture();
    f.read.mockRejectedValueOnce(new Error('来源不可用'));
    await expect(prepareNavRunConfigV3(f.options)).rejects.toThrow('来源不可用');
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it('返回错配请求身份时拒绝', async () => {
    const f = fixture();
    f.source.response.requestId = 'other';
    await expect(prepareNavRunConfigV3(f.options)).rejects.toBeDefined();
  });
});
