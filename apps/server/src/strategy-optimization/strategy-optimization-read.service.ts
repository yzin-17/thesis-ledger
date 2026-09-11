import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { describeStrategyParameters } from './strategy-optimization-parameters.js';

@Injectable()
export class StrategyOptimizationReadService {
  constructor(private readonly prisma: PrismaService) {}

  async parameters(strategyVersionId: string) {
    const version = await this.prisma.strategyVersion.findUnique({ where: { id: strategyVersionId } });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2 || version.version <= 0)
      throw new BadRequestException('只有正式 V2 策略版本可以配置优化参数');
    return describeStrategyParameters(strategySchemaV2.parse(version.schema) as StrategySchemaV2);
  }
}
