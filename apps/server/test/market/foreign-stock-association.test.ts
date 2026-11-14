import { describe, expect, it, vi } from 'vitest';
import { InstrumentAssociationService } from '../../src/market/instruments/instrument-association.service.js';
import { disabledReasonForInstrument, isConfirmableInstrument } from '../../src/market/instruments/instrument-search.js';

function fixture(market: string, code: string, instrumentType = 'STOCK', existing?: Record<string, unknown>) {
  const instrument = { id: '11111111-1111-4111-8111-111111111111', market, canonicalCode: code,
    instrumentType, displayName: '受控证券', active: true };
  let asset: Record<string, unknown> | null = existing ?? null;
  let association: Record<string, unknown> | null = null;
  const tx = {
    asset: {
      findUnique: vi.fn(async () => asset),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { asset = data; return data; }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { asset = { ...asset, ...data }; return asset; }),
    },
    instrumentAssetAssociation: {
      findUnique: vi.fn(async () => association),
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        association = association ? { ...association, ...update } : create; return association;
      }),
    },
  };
  const prisma = { ...tx, instrument: { findUnique: vi.fn(async () => instrument) },
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  return { prisma, service: new InstrumentAssociationService(prisma as never), instrument };
}

describe('港美股票自动关联', () => {
  it.each([
    ['HK','00700','HKD'], ['US','AAPL','USD'], ['US','BRK.B','USD'], ['SH','600036','CNY'],
  ])('确认 %s 股票使用原生币种，之后可用于新增持仓', async (market, code, currency) => {
    const { service, instrument } = fixture(market, code);
    expect(isConfirmableInstrument('STOCK',market)).toBe(true);
    const result = await service.confirm(instrument.id);
    expect(result.asset).toMatchObject({ symbol: `${code}.${market}`, market, currency, assetType: 'stock', identityStatus: 'confirmed' });
    await expect(service.requireConfirmed(instrument.id)).resolves.toMatchObject({ symbol: `${code}.${market}`, assetType: 'stock' });
  });

  it.each(['ETF','INDEX','MUTUAL_FUND'])('不将本次境外股票授权扩展为 %s', async (type) => {
    const { service, prisma, instrument } = fixture('HK','00700',type);
    expect(disabledReasonForInstrument(type,'HK')).toBe('unsupported_instrument_type');
    expect(disabledReasonForInstrument(type,'US')).toBe('unsupported_instrument_type');
    await expect(service.confirm(instrument.id)).rejects.toThrow('类型');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('已有资产的币种与名称不会因目录关联被改写', async () => {
    const { service, instrument, prisma } = fixture('US','AAPL','STOCK',
      { symbol: 'AAPL.US', currency: 'CNY', name: '既有冻结名称', assetType: 'stock' });
    const result = await service.confirm(instrument.id);
    expect(result.asset).toMatchObject({ currency: 'CNY', name: '既有冻结名称', identityStatus: 'confirmed' });
    expect(prisma.asset.create).not.toHaveBeenCalled();
    expect(prisma.asset.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { identityStatus: 'confirmed', identitySource: 'catalog' },
    }));
  });
});
