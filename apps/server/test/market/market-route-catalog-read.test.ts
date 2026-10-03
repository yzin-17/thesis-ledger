import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import type { MarketRouteCatalogV3 } from '@thesis-ledger/schemas';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import { MarketDataController } from '../../src/market/market-data.controller.js';
import { MarketControlService } from '../../src/market/market-control.service.js';

const routeKey: MarketRouteCatalogV3['entries'][number]['key'] = {
  kind: 'bar',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
};

const readyEntry: MarketRouteCatalogV3['entries'][number] = {
  key: routeKey,
  target: { providerId: 'hithink', upstreamSource: 'hithink-financial-api' },
  state: 'ready',
};

const catalog = (
  integrity: MarketRouteCatalogV3['integrity'],
  entries: MarketRouteCatalogV3['entries'] = [readyEntry],
): MarketRouteCatalogV3 => ({
  contractVersion: 3,
  consumer: 'thesis-ledger',
  catalogRevision: 12,
  generatedAt: '2026-09-25T04:00:00.000Z',
  integrity,
  entries,
});

describe('MarketRouteCatalogReadV3', () => {
  it('publishes a stable no-store GET route and requires contractVersion 3', async () => {
    const control = { routeCapabilitiesV3: vi.fn(async () => ({ status: 'complete' })) };
    const controller = new MarketDataController(control as never, {} as never, {} as never);
    const handler = MarketDataController.prototype.routeCapabilities;

    expect(Reflect.getMetadata('path', MarketDataController)).toBe('api/market-data');
    expect(Reflect.getMetadata('path', handler)).toBe('routes/capabilities');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.GET);
    await expect(controller.routeCapabilities('3')).resolves.toEqual({ status: 'complete' });
    expect(control.routeCapabilitiesV3).toHaveBeenCalledOnce();

    expect(() => controller.routeCapabilities()).toThrow('contractVersion 必须为 3');
    expect(() => controller.routeCapabilities('2')).toThrow('contractVersion 必须为 3');
    expect(control.routeCapabilitiesV3).toHaveBeenCalledOnce();
  });

  it('returns exact entries only for a strictly valid complete catalog without touching policy state', async () => {
    const prisma = {
      desiredProviderPolicy: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    };
    const dsa = { marketRouteCatalogV3: vi.fn(async () => catalog('complete')) };
    const service = new MarketControlService(prisma as never, dsa as never);

    await expect(service.routeCapabilitiesV3()).resolves.toEqual({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      status: 'complete',
      catalogRevision: 12,
      generatedAt: '2026-09-25T04:00:00.000Z',
      entries: [readyEntry],
      reason: null,
    });
    expect(dsa.marketRouteCatalogV3).toHaveBeenCalledOnce();
    expect(prisma.desiredProviderPolicy.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks partial catalogs explicitly and hides any ready rows they contain', async () => {
    const dsa = { marketRouteCatalogV3: vi.fn(async () => catalog('partial')) };
    const result = await new MarketControlService({} as never, dsa as never).routeCapabilitiesV3();

    expect(result).toMatchObject({
      status: 'partial',
      catalogRevision: 12,
      generatedAt: '2026-09-25T04:00:00.000Z',
      entries: [],
      reason: 'catalog_partial',
    });
  });

  it('maps unavailable failures to safe reasons and never returns DSA exception text', async () => {
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => {
        throw new DsaError('sensitive transport details', 'unauthorized');
      }),
    };
    const result = await new MarketControlService({} as never, dsa as never).routeCapabilitiesV3();

    expect(result).toEqual({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      status: 'unavailable',
      catalogRevision: null,
      generatedAt: null,
      entries: [],
      reason: 'control_unauthorized',
    });
    expect(JSON.stringify(result)).not.toContain('sensitive transport details');
  });

  it('fails closed when the DSA client returns an invalid catalog shape', async () => {
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => ({
        ...catalog('complete'),
        entries: [],
        extra: true,
      })),
    };
    const result = await new MarketControlService({} as never, dsa as never).routeCapabilitiesV3();

    expect(result).toMatchObject({
      status: 'unavailable',
      entries: [],
      reason: 'invalid_response',
    });
  });
});
