import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';

export const visibleStrategyOwners = (ownerId?: string | null) => ({
  OR: [{ ownerId: null }, ...(ownerId ? [{ ownerId }] : [])],
});

@Injectable()
export class StrategyAccessService {
  constructor(private readonly database: PrismaService) {}
  async strategy(id: string, ownerId: string | null) {
    const record = await this.database.strategy.findFirst({
      where: { id, ...visibleStrategyOwners(ownerId) },
      select: { id: true },
    });
    if (!record) throw new NotFoundException('策略不存在或不可访问');
  }
  async version(id: string, ownerId: string | null) {
    const record = await this.database.strategyVersion.findFirst({
      where: { id, strategy: visibleStrategyOwners(ownerId) },
      select: { id: true },
    });
    if (!record) throw new NotFoundException('版本不存在或不可访问');
  }
  async run(id: string, ownerId: string | null) {
    const record = await this.database.backtestJob.findFirst({
      where: { id, strategyVersion: { strategy: visibleStrategyOwners(ownerId) } },
      select: { id: true },
    });
    if (!record) throw new NotFoundException('回测不存在或不可访问');
  }
  async canReadRun(id: string, ownerId: string | null) {
    return (
      (await this.database.backtestJob.count({
        where: { id, strategyVersion: { strategy: visibleStrategyOwners(ownerId) } },
      })) > 0
    );
  }
}
