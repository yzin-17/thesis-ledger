import { Redis } from 'ioredis';
import { redisKey } from '../platform/redis.service.js';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) process.exit(1);

const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
try {
  await redis.connect();
  const heartbeat = await redis.get(redisKey('queue', 'backtest-worker-heartbeat'));
  if (!heartbeat || Date.now() - Date.parse(heartbeat) > 45_000) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await redis.quit().catch(() => undefined);
}
