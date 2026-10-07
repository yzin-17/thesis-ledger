import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  marketRouteCatalogV3Schema,
  marketRouteCompatibilityProofV3Schema,
  marketRouteCompatibilityObservationV3Schema,
} from '@thesis-ledger/schemas';
import { resolveChartWindowOptions } from '../../src/market/market-chart-window-options.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const setup = () => {
  const desired = desiredProviderPolicyV3Schema.parse(fixture('market-route-v3.etf-qfq.json'));
  const effective = effectiveProviderPolicyV3Schema.parse(
    fixture('market-control-v3.effective.etf-qfq.json'),
  );
  const catalog = marketRouteCatalogV3Schema.parse(
    fixture('market-route-catalog-v3.complete.json'),
  );
  const backup = { providerId: 'synthetic-b', upstreamSource: 'synthetic-source' };
  desired.routes[0]!.targets.push(backup);
  effective.routes[0]!.targets[0]!.eligible = false;
  effective.routes[0]!.targets[0]!.reason = 'credential_missing';
  effective.routes[0]!.targets.push({ ...backup, routeIndex: 1, eligible: true, reason: null });
  catalog.entries.push({ key: desired.routes[0]!.key, target: backup, state: 'ready' });
  const raw = fixture('market-route-compatibility-v3.synthetic.json');
  const compatibility = {
    proof: marketRouteCompatibilityProofV3Schema.parse(raw.proof),
    observation: marketRouteCompatibilityObservationV3Schema.parse(raw.observation),
  };
  const proofs = { findExact: vi.fn().mockResolvedValue(compatibility) };
  return {
    identity: { symbol: '159516.SZ', assetType: 'ETF' as const },
    desired,
    effective,
    catalog,
    window: { start: '2026-05-18', end: '2026-05-20' },
    proofs,
  };
};
describe('图表备用可用性绑定获取窗口', () => {
  it('基础价格备用可用时无需精确窗口证明', async () => {
    const input = setup();
    const targets = [
      { providerId: 'hithink', upstreamSource: 'fund-market-historical' },
      { providerId: 'tencent', upstreamSource: 'tencent' },
    ];
    input.desired.routes[0]!.targets = targets;
    input.effective.routes[0]!.targets = targets.map((target, routeIndex) => ({
      ...target, routeIndex, eligible: routeIndex === 1,
      reason: routeIndex === 0 ? 'credential_missing' : null,
    }));
    input.catalog.entries.push(...targets.map((target) => ({
      key: input.desired.routes[0]!.key, target, state: 'ready' as const,
    })));
    input.proofs.findExact.mockRejectedValue(new Error('不应读取人工证明'));
    expect((await resolveChartWindowOptions(input)).options[1]).toMatchObject({
      available: true, availableVia: 'backup', reason: null,
    });
    expect(input.proofs.findExact).not.toHaveBeenCalled();
  });

  it('主源不可用但精确证明查询成功时返回窗口内备用可用', async () => {
    const input = setup();
    const result = await resolveChartWindowOptions(input);
    expect(result.window).toEqual(input.window);
    expect(result.options[1]).toEqual({
      adjustment: 'qfq',
      available: true,
      availableVia: 'backup',
      reason: null,
    });
    expect(input.proofs.findExact).toHaveBeenCalledWith(
      expect.objectContaining({
        window: input.window,
        symbol: input.identity.symbol,
        desiredRevision: 1,
        effectivePolicyRevision: 1,
        catalogRevision: 7,
        targets: {
          primary: input.desired.routes[0]!.targets[0],
          backup: input.desired.routes[0]!.targets[1],
        },
      }),
    );
  });
  it('缺少该窗口证明时不凭目录 ready 开放备用', async () => {
    const input = setup();
    input.proofs.findExact.mockResolvedValue(null);
    expect((await resolveChartWindowOptions(input)).options[1]).toMatchObject({
      available: false,
      reason: 'basis_incompatible',
    });
  });
  it('主源就绪不读取证明，查询不触发行情', async () => {
    const input = setup();
    input.effective.routes[0]!.targets[0]!.eligible = true;
    input.effective.routes[0]!.targets[0]!.reason = null;
    expect((await resolveChartWindowOptions(input)).options[1]!.available).toBe(true);
    expect(input.proofs.findExact).not.toHaveBeenCalled();
  });
  it('备用未准入或目录不完整时保持关闭', async () => {
    const input = setup();
    input.effective.routes[0]!.targets[1]!.eligible = false;
    input.effective.routes[0]!.targets[1]!.reason = 'not_admitted';
    expect((await resolveChartWindowOptions(input)).options[1]!.available).toBe(false);
    input.catalog.integrity = 'partial';
    expect(
      (await resolveChartWindowOptions(input)).options.every((option) => !option.available),
    ).toBe(true);
    expect(input.proofs.findExact).not.toHaveBeenCalled();
  });
  it('窗口变化重新精确查找且不继承旧可用性', async () => {
    const input = setup();
    await resolveChartWindowOptions(input);
    input.window = { ...input.window, start: '2026-05-01' };
    input.proofs.findExact.mockResolvedValue(null);
    expect((await resolveChartWindowOptions(input)).options[1]!.available).toBe(false);
    expect(input.proofs.findExact).toHaveBeenLastCalledWith(
      expect.objectContaining({ window: input.window }),
    );
  });
  it('非法窗口在读取证明前拒绝', async () => {
    const input = setup();
    input.window.start = '2026-02-30';
    await expect(resolveChartWindowOptions(input)).rejects.toThrow();
    expect(input.proofs.findExact).not.toHaveBeenCalled();
  });
});
