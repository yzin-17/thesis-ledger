import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { DsaClient } from '../market/dsa-client.js';

type Status = 'healthy' | 'degraded' | 'down';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly dsa: DsaClient,
  ) {}
  async check() {
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
      this.dsa.health(),
    ]);
    const dependencies = {
      database: state(checks[0]),
      redis: state(checks[1]),
      dsa: state(checks[2]),
    };
    const failed = Object.values(dependencies).filter((value) => value === 'down').length;
    const status: Status = failed === 0 ? 'healthy' : failed === 3 ? 'down' : 'degraded';
    return {
      status,
      service: 'thesis-ledger',
      version: '0.1.0',
      dependencies,
      checkedAt: new Date().toISOString(),
    };
  }
}

const state = (result: PromiseSettledResult<unknown>): Status =>
  result.status === 'fulfilled' ? 'healthy' : 'down';
