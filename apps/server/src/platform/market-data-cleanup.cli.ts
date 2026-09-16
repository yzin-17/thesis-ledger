import { MarketDataCleanupService, formatMarketCleanupPreflight } from './market-data-cleanup.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';

const main = async () => {
  const mode = process.env.MARKET_CLEANUP_MODE ?? 'check';
  if (mode !== 'check' && mode !== 'execute') throw new Error('MARKET_CLEANUP_MODE 必须是 check 或 execute');
  const prisma = new PrismaService();
  const redis = new RedisService();
  try {
    await prisma.$connect();
    const service = new MarketDataCleanupService(prisma, redis);
    const report = await service.preflight();
    process.stdout.write(`${formatMarketCleanupPreflight(report)}\n`);
    if (mode === 'execute') await service.execute(report);
  } finally {
    await prisma.$disconnect();
    await redis.onModuleDestroy();
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
