import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

await prisma.asset.upsert({
  where: { symbol: '600519.SH' },
  update: {},
  create: {
    symbol: '600519.SH',
    name: '贵州茅台',
    market: 'SH',
    assetType: 'stock',
    currency: 'CNY',
    sector: '食品饮料',
  },
});
await prisma.asset.upsert({
  where: { symbol: '510300.SH' },
  update: {},
  create: {
    symbol: '510300.SH',
    name: '沪深300ETF',
    market: 'SH',
    assetType: 'etf',
    currency: 'CNY',
  },
});
await prisma.account.upsert({
  where: { name_source: { name: '演示账户', source: 'manual' } },
  update: {},
  create: { name: '演示账户', source: 'manual', type: 'securities', currency: 'CNY' },
});

await prisma.$disconnect();
