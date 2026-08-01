import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { loadConfig } from './config.js';

export const redisKey = (area: 'cache' | 'queue' | 'lock' | 'pubsub', key: string) =>
  `investment-os:${area}:v1:${key}`;

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(loadConfig().redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  async ping() {
    if (this.client.status === 'wait') await this.client.connect();
    return this.client.ping();
  }
  async clearTestNamespace(runId: string) {
    const pattern = redisKey('cache', `test:${runId}:*`);
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await this.client.del(...keys);
    } while (cursor !== '0');
  }
  async onModuleDestroy() {
    if (this.client.status !== 'end') await this.client.quit();
  }
}
