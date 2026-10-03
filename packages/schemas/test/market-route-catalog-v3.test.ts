import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketRouteCatalogCapabilitiesV3,
  marketRouteCatalogGetEndpointV3,
  marketRouteCatalogV3Schema,
} from '../src/market-route-catalog-v3.js';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as unknown;

describe('Market Route Capability Catalog Control Wire V3', () => {
  it('冻结独立 Control GET 端点与完整精确能力目录', () => {
    const catalog = marketRouteCatalogV3Schema.parse(
      fixture('market-route-catalog-v3.complete.json'),
    );

    expect(marketRouteCatalogGetEndpointV3).toBe(
      '/api/v3/thesis-ledger/control/routes/capabilities?contractVersion=3',
    );
    expect(catalog).toMatchObject({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      catalogRevision: 7,
      integrity: 'complete',
    });
    expect(catalog.entries[0]).toMatchObject({
      key: { kind: 'bar', assetType: 'ETF', capability: 'DAILY_BAR', adjustment: 'qfq' },
      target: { providerId: 'hithink', upstreamSource: 'hithink-financial-api' },
      state: 'ready',
    });
    expect(marketRouteCatalogCapabilitiesV3(catalog)).toEqual(catalog.entries);
  });

  it('缺失或不完整目录不提供任何 ready 能力', () => {
    const partial = marketRouteCatalogV3Schema.parse(
      fixture('market-route-catalog-v3.partial.json'),
    );

    expect(partial.entries[0]?.state).toBe('ready');
    expect(marketRouteCatalogCapabilitiesV3(partial)).toEqual([]);
    expect(marketRouteCatalogCapabilitiesV3(undefined)).toEqual([]);
    expect(marketRouteCatalogCapabilitiesV3(null)).toEqual([]);
    expect(marketRouteCatalogV3Schema.safeParse(undefined).success).toBe(false);
  });

  it('拒绝重复精确行、冲突状态和重复目标字段', () => {
    const catalog = marketRouteCatalogV3Schema.parse(fixture('market-route-catalog-v3.complete.json'));
    const firstEntry = catalog.entries[0];

    expect(
      marketRouteCatalogV3Schema.safeParse({ ...catalog, entries: [firstEntry, firstEntry] })
        .success,
    ).toBe(false);
    expect(
      marketRouteCatalogV3Schema.safeParse({
        ...catalog,
        entries: [firstEntry, { ...firstEntry, state: 'not_admitted' }],
      }).success,
    ).toBe(false);
    expect(
      marketRouteCatalogV3Schema.safeParse({
        ...catalog,
        entries: [{ ...firstEntry, target: { ...firstEntry.target, accountId: 'account-1' } }],
      }).success,
    ).toBe(false);
  });

  it('拒绝错误版本、错误 consumer、错误状态和额外 envelope 字段', () => {
    const catalog = marketRouteCatalogV3Schema.parse(fixture('market-route-catalog-v3.complete.json'));

    for (const candidate of [
      { ...catalog, contractVersion: 2 },
      { ...catalog, consumer: 'market-data' },
      { ...catalog, deprecatedManifest: { dailyBar: true } },
      {
        ...catalog,
        entries: [{ ...catalog.entries[0], state: 'supported' }],
      },
    ]) {
      expect(marketRouteCatalogV3Schema.safeParse(candidate).success).toBe(false);
    }
  });
});
