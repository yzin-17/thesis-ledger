import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  marketDataBarSeriesResponseV3Schema,
  marketRouteCompatibilityObservationV3Schema,
  marketRouteCompatibilityProofV3Schema,
  type MarketChartBarsRequestV3,
} from '@thesis-ledger/schemas';
import { selectChartWindowV3 } from '../../src/market/market-chart-selector-v3.js';
import { marketRouteContextV3 } from '../../src/market/market-window-selector-v3.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const setup = () => {
  const raw = fixture('market-route-compatibility-v3.synthetic.json');
  const proof = marketRouteCompatibilityProofV3Schema.parse(raw.proof);
  const observation = marketRouteCompatibilityObservationV3Schema.parse(raw.observation);
  const result = marketRouteContextV3({
    desired: fixture('market-route-v3.etf-qfq.json'),
    effective: fixture('market-control-v3.effective.etf-qfq.json'),
    catalog: fixture('market-route-catalog-v3.complete.json'),
    routeKey: proof.routeKey,
  });
  if (!result.ok) throw new Error(result.reason);
  const context = {
    ...result.context,
    targets: [proof.targets.primary, proof.targets.backup].map((target, routeIndex) => ({
      target,
      routeIndex,
      eligible: true,
      catalogReady: true,
    })),
  };
  const { coverageProof, ...base } = marketDataBarSeriesResponseV3Schema.parse(
    fixture('market-data-v3.response.etf-qfq.json'),
  );
  void coverageProof;
  const bars = base.bars.map((bar, index) => ({
    ...bar,
    timestamp: `2025-02-0${index + 3}T07:00:00.000Z`,
    availableAt: `2025-02-0${index + 3}T07:00:00.000Z`,
  }));
  const response = {
    ...base,
    purpose: 'interactive-chart' as const,
    symbol: proof.symbol,
    bars,
    routeKey: proof.routeKey,
    sourcePriceBasis: observation.sourceFacts.backup.priceBasis,
    inputFingerprint: observation.sourceFacts.backup.seriesFingerprint,
    coverage: {
      ...base.coverage,
      requestedStart: proof.window.start,
      requestedEnd: proof.window.end,
      actualStart: bars[0]!.timestamp,
      actualEnd: bars.at(-1)!.timestamp,
      latestCompleteTradingDate: '2025-02-05',
    },
    provenance: {
      ...proof.targets.backup,
      routeIndex: 1,
      effectivePolicyRevision: context.effectivePolicyRevision,
    },
  };
  const read = vi.fn(async (request: MarketChartBarsRequestV3) => {
    if (request.routeTarget.routeIndex === 0) throw new Error('主源故障');
    return { ...response, requestId: request.requestId };
  });
  const input = {
    request: {
      contractVersion: 3 as const,
      purpose: 'interactive-chart' as const,
      requestId: 'chart-proof-test',
      symbol: proof.symbol,
      routeKey: proof.routeKey,
      ...proof.window,
    },
    context,
    compatibility: { proof, observation },
    read,
    now: () => raw.now as string,
  };
  return { input, response, read, proof, observation };
};

describe('图表 V3 兼容备用整窗选择', () => {
  it('同花顺与腾讯的同口径整窗回退无需人工等价证明', async () => {
    const { input, response } = setup();
    const targets = [
      { providerId: 'hithink', upstreamSource: 'fund-market-historical' },
      { providerId: 'tencent', upstreamSource: 'tencent' },
    ];
    input.context.targets = targets.map((target, routeIndex) => ({
      target, routeIndex, eligible: true, catalogReady: true,
    }));
    const resolveCompatibility = vi.fn().mockRejectedValue(new Error('不应读取人工证明'));
    const read = vi.fn(async (request: MarketChartBarsRequestV3) => {
      if (request.routeTarget.routeIndex === 0) throw new Error('主源故障');
      return { ...response, requestId: request.requestId,
        provenance: { ...response.provenance, ...targets[1] } };
    });
    const result = await selectChartWindowV3({ ...input, read, resolveCompatibility });
    expect(result.provenance).toMatchObject({ ...targets[1], routeIndex: 1 });
    expect(result.bars).toEqual(response.bars);
    expect(read).toHaveBeenCalledTimes(2);
    expect(resolveCompatibility).not.toHaveBeenCalled();
    read.mockImplementation(async (request) => {
      if (request.routeTarget.routeIndex === 0) throw new Error('主源故障');
      return { ...response, requestId: request.requestId,
        routeKey: { ...response.routeKey, adjustment: 'hfq' },
        provenance: { ...response.provenance, ...targets[1] } };
    });
    await expect(selectChartWindowV3({ ...input, read, resolveCompatibility })).rejects.toThrow();
  });

  it('按需解析证明并在备用返回后再次核对', async () => {
    const { input } = setup();
    const resolveCompatibility = vi.fn().mockResolvedValue(input.compatibility);
    await selectChartWindowV3({ ...input, resolveCompatibility });
    expect(resolveCompatibility).toHaveBeenCalledTimes(2);
  });
  it('备用调用期间撤销证明时拒绝晚到结果', async () => {
    const { input } = setup();
    const resolveCompatibility = vi
      .fn()
      .mockResolvedValueOnce(input.compatibility)
      .mockResolvedValue(null);
    await expect(selectChartWindowV3({ ...input, resolveCompatibility })).rejects.toThrow('已撤销');
  });
  it('主源成功不读取证明包', async () => {
    const { input, read, response } = setup();
    read.mockResolvedValueOnce({
      ...response,
      requestId: input.request.requestId,
      provenance: {
        ...input.compatibility.proof.targets.primary,
        routeIndex: 0,
        effectivePolicyRevision: input.context.effectivePolicyRevision,
      },
    });
    const resolveCompatibility = vi.fn().mockRejectedValue(new Error('unavailable'));
    await selectChartWindowV3({ ...input, resolveCompatibility });
    expect(resolveCompatibility).not.toHaveBeenCalled();
  });
  it('主源失败后返回完整备用窗口和实际来源，最多两个精确目标', async () => {
    const { input, read } = setup();
    const result = await selectChartWindowV3(input);
    expect(result.bars).toHaveLength(3);
    expect(result.provenance).toMatchObject({
      ...input.compatibility.proof.targets.backup,
      routeIndex: 1,
    });
    expect(read.mock.calls.map(([request]) => request.routeTarget.routeIndex)).toEqual([0, 1]);
  });
  it('主源成功不读取备用', async () => {
    const { input, read, response } = setup();
    read.mockResolvedValueOnce({
      ...response,
      requestId: input.request.requestId,
      provenance: {
        ...input.compatibility.proof.targets.primary,
        routeIndex: 0,
        effectivePolicyRevision: input.context.effectivePolicyRevision,
      },
    });
    await selectChartWindowV3(input);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('没有证明保留主源错误且不请求备用', async () => {
    const { input, read } = setup();
    const { compatibility, ...without } = input;
    void compatibility;
    await expect(selectChartWindowV3(without)).rejects.toThrow('主源故障');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('主源返回新策略修订时立即终止，不沿用旧上下文读取备用', async () => {
    const { input, read, response } = setup();
    read.mockResolvedValueOnce({
      ...response,
      requestId: input.request.requestId,
      provenance: {
        ...input.compatibility.proof.targets.primary,
        routeIndex: 0,
        effectivePolicyRevision: input.context.effectivePolicyRevision + 1,
      },
    });
    await expect(selectChartWindowV3(input)).rejects.toThrow('修订已改变');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('备用未准入时不调用备用', async () => {
    const { input, read } = setup();
    input.context.targets[1]!.eligible = false;
    await expect(selectChartWindowV3(input)).rejects.toThrow('主源故障');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each(['window', 'target', 'expired', 'observation'] as const)(
    '拒绝 %s 不匹配且不调用备用',
    async (kind) => {
      const { input, read } = setup();
      if (kind === 'window') input.request.start = '2025-02-02';
      if (kind === 'target')
        input.context.targets[1]!.target = { providerId: 'other', upstreamSource: 'other' };
      if (kind === 'expired') input.now = () => '2027-01-01T00:00:00Z';
      if (kind === 'observation') input.compatibility.observation.symbol = 'OTHER';
      await expect(selectChartWindowV3(input)).rejects.toThrow('备用基准不可用');
      expect(read).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['fingerprint', 'basis', 'revision'] as const)('拒绝备用实际 %s 漂移', async (kind) => {
    const { input, response } = setup();
    if (kind === 'fingerprint') response.inputFingerprint = 'd'.repeat(64);
    if (kind === 'basis')
      response.sourcePriceBasis = { ...response.sourcePriceBasis, methodVersion: 'changed' };
    if (kind === 'revision') response.provenance.effectivePolicyRevision += 1;
    await expect(selectChartWindowV3(input)).rejects.toThrow();
  });
  it('证明在请求过程中到期也拒绝结果', async () => {
    const { input } = setup();
    input.now = vi
      .fn()
      .mockReturnValueOnce('2026-02-01T00:00:00Z')
      .mockReturnValueOnce('2026-02-01T00:00:00Z')
      .mockReturnValue('2027-01-01T00:00:00Z');
    await expect(selectChartWindowV3(input)).rejects.toThrow('expired');
  });
  it('转换证明不被当作已转换的价格', async () => {
    const { input, proof, read } = setup();
    proof.verification = {
      kind: 'verified-conversion',
      algorithmId: 'test',
      algorithmVersion: '1',
      dimensions: ['price'],
      inputFingerprint: proof.sourceFacts.backup.seriesFingerprint,
      outputFingerprint: proof.sourceFacts.primary.seriesFingerprint,
      evidence: proof.verification.evidence,
    };
    await expect(selectChartWindowV3(input)).rejects.toThrow('可执行的等价证明');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
