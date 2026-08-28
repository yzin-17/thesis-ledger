import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { loadConfig } from './config.js';

type Status = 'healthy' | 'degraded' | 'down';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly dsa: DsaClient,
  ) {}
  async check() {
    const config = loadConfig();
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
      this.dsa.health(),
      this.dsa.capabilities(),
    ]);
    const dsaCapabilities =
      checks[3].status === 'fulfilled' ? checks[3].value.capabilities : undefined;
    const fundNavAvailable =
      dsaCapabilities !== undefined &&
      Object.prototype.hasOwnProperty.call(dsaCapabilities, 'fund-nav');
    const dependencies = {
      database: state(checks[0]),
      redis: state(checks[1]),
      dsa: state(checks[2]) === 'healthy' && fundNavAvailable ? 'healthy' : 'down',
    } as const;
    const failed = Object.values(dependencies).filter((value) => value === 'down').length;
    const status: Status = failed === 0 ? 'healthy' : failed === 3 ? 'down' : 'degraded';
    return {
      status,
      service: 'thesis-ledger',
      version: '0.1.0',
      contractVersion: 1,
      schemaVersion: '20260818000000_market_data_provider_v12',
      capabilities: {
        accountModel: 'container-v1',
        fundNav: fundNavAvailable,
        modes: ['actual', 'shadow'],
        projectionReadMode: config.projectionReadMode,
        projectionSwitchStage: config.projectionSwitchStage,
      },
      dependencies,
      checkedAt: new Date().toISOString(),
    };
  }
}

const state = (result: PromiseSettledResult<unknown>): Status =>
  result.status === 'fulfilled' ? 'healthy' : 'down';
