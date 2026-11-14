import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  MarketBarReader,
  MarketBarUnavailableError,
  type MarketBarWindowReadInputV3,
  type MarketBarWindowReadResultV3,
} from './market-bar-reader.js';

type CachedRead = { result?: MarketBarWindowReadResultV3; reason?: string };

/** 后台窗口经现有来源控制读取；精确窗口的成功与失败均有跨进程请求窗口。 */
@Injectable()
export class MarketBackgroundBarReader {
  constructor(
    private readonly bars: MarketBarReader,
    private readonly redis: RedisService,
    private readonly db: PrismaService,
  ) {}

  async read(input: MarketBarWindowReadInputV3): Promise<MarketBarWindowReadResultV3> {
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const revision = await this.policyRevision();
    const scopeKey = redisKey('cache', `background-bar:${fingerprint}`);
    const key = `${scopeKey}:${revision}`;
    const cached = await this.redis.client.get(key);
    if (cached) return this.unwrap(JSON.parse(cached) as CachedRead);
    if ((await this.redis.client.set(`${scopeKey}:attempt`, '1', 'EX', 600, 'NX')) !== 'OK')
      throw new MarketBarUnavailableError(
        '日线正在后台获取，等待请求窗口后重试',
        'market_data_pending',
      );
    let value: CachedRead;
    try {
      value = { result: await this.bars.readV3(input) };
    } catch {
      value = { reason: '日线来源请求失败，等待后台重试' };
    }
    if ((await this.policyRevision()) !== revision)
      throw new MarketBarUnavailableError(
        '行情来源设置已变化，等待后台按新设置重试',
        'market_control_changed',
      );
    await this.redis.client.set(key, JSON.stringify(value), 'EX', 600);
    return this.unwrap(value);
  }

  private unwrap(value: CachedRead): MarketBarWindowReadResultV3 {
    if (value.result) return value.result;
    throw new MarketBarUnavailableError(
      value.reason ?? '日线来源暂不可用',
      'daily_bars_unavailable',
    );
  }

  private async policyRevision() {
    const policy = await this.db.desiredProviderPolicy.findUnique({
      where: { consumer: 'thesis-ledger' },
      select: { enabled: true, revision: true, syncState: true },
    });
    if (!policy)
      throw new MarketBarUnavailableError('行情来源设置尚未就绪', 'market_control_unconfigured');
    if (!policy.enabled)
      throw new MarketBarUnavailableError('行情获取已关闭', 'market_control_disabled');
    if (policy.syncState !== 'applied')
      throw new MarketBarUnavailableError(
        '行情来源设置尚未生效，等待同步',
        'market_control_pending',
      );
    return policy.revision;
  }
}
