import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { MarketDataBarRouteKeyV3 } from '@thesis-ledger/schemas';
import { MarketModule } from '../../src/market/market.module.js';
import { MarketBarReader } from '../../src/market/market-bar-reader.js';
import {
  MarketBarWindowReaderV3,
  type MarketBarWindowReadInputV3,
  type MarketBarWindowReadResultV3,
} from '../../src/market/market-bar-reader-v3.js';
import { MarketWindowEvidenceV3Repository } from '../../src/market/market-window-evidence-v3.repository.js';

const routeKey: MarketDataBarRouteKeyV3 = {
  kind: 'bar',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
};

const input: MarketBarWindowReadInputV3 = {
  market: 'CN',
  symbol: '159516.SZ',
  routeKey,
  window: { start: '2026-05-16', end: '2026-08-09' },
};

const unavailableResult: MarketBarWindowReadResultV3 = {
  status: 'unavailable',
  selection: { status: 'unavailable', reason: 'policy_mismatch' },
};

describe('MarketBarReader V3 wiring', () => {
  it('delegates V3 reads directly to the window reader', async () => {
    const windowReader = {
      read: vi.fn(async () => unavailableResult),
    };
    const reader = new MarketBarReader(
      windowReader as unknown as MarketBarWindowReaderV3,
      {} as never,
    );

    const result = await reader.readV3(input);

    expect(result).toBe(unavailableResult);
    expect(windowReader.read).toHaveBeenCalledOnce();
    expect(windowReader.read).toHaveBeenCalledWith(input);
  });

  it('registers the V3 reader and exact-window evidence repository in MarketModule', () => {
    const providers = Reflect.getMetadata('providers', MarketModule) as unknown[];

    expect(providers).toContain(MarketBarWindowReaderV3);
    expect(providers).toContain(MarketWindowEvidenceV3Repository);
  });
});
