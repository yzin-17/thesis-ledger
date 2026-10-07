import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  marketRouteCatalogV3Schema,
} from '@thesis-ledger/schemas';
import { MarketRouteRevisionService } from '../../src/market/market-route-revision.service.js';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const harness = () => {
  const desired = desiredProviderPolicyV3Schema.parse(fixture('market-route-v3.etf-qfq.json'));
  const effective = effectiveProviderPolicyV3Schema.parse(
    fixture('market-control-v3.effective.etf-qfq.json'),
  );
  const catalog = marketRouteCatalogV3Schema.parse(
    fixture('market-route-catalog-v3.complete.json'),
  );
  const control = {
    getPolicy: vi.fn(() =>
      Promise.resolve({ ...desired, syncState: 'applied', effectiveStale: false }),
    ),
  };
  const dsa = {
    effectiveControlPolicyV3: vi.fn(() => Promise.resolve({ projection: { effective } })),
    marketRouteCatalogV3: vi.fn(() => Promise.resolve(catalog)),
  };
  const service = new MarketRouteRevisionService(control as never, dsa as never);
  return { desired, effective, catalog, control, dsa, service, key: desired.routes[0]!.key };
};

describe('当前Market路由修订读取', () => {
  it('两次稳定读取后返回精确目标序列，不读取价格', async () => {
    const h = harness();
    const result = await h.service.readCurrent(h.key as never);
    expect(result).toMatchObject({
      desiredRevision: h.desired.revision,
      effectiveRevision: h.effective.revision,
      catalogRevision: h.catalog.catalogRevision,
    });
    expect(result.targetSources).toEqual(
      h.desired.routes[0]!.targets.map((target, routeIndex) => ({ ...target, routeIndex })),
    );
    expect(h.control.getPolicy).toHaveBeenCalledTimes(2);
  });
  it('读取过程中Catalog变化时拒绝', async () => {
    const h = harness();
    h.dsa.marketRouteCatalogV3
      .mockResolvedValueOnce(h.catalog)
      .mockResolvedValue({ ...h.catalog, catalogRevision: h.catalog.catalogRevision + 1 });
    await expect(h.service.readCurrent(h.key as never)).rejects.toThrow('修订变化');
  });
  it('未应用或过期的Desired不得被当作当前路由', async () => {
    const h = harness();
    h.control.getPolicy.mockResolvedValue({
      ...h.desired,
      syncState: 'applied',
      effectiveStale: true,
    });
    await expect(h.service.readCurrent(h.key as never)).rejects.toThrow();
  });
  it('查询失败不能冒充未变化', async () => {
    const h = harness();
    h.dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('offline'));
    await expect(h.service.readCurrent(h.key as never)).rejects.toThrow('offline');
  });
  it('Effective落后于Desired时拒绝', async () => {
    const h = harness();
    h.effective.sourceDesiredRevision += 1;
    await expect(h.service.readCurrent(h.key as never)).rejects.toThrow();
  });
});
