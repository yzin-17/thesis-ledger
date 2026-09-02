import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeAllocationTargets } from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import { performanceAccountWhere } from './performance-account-scope.js';
import { PerformanceLayerService } from './performance-layer.service.js';
import type { PerformanceFxOptions, PortfolioMode } from './performance-types.js';

@Injectable()
export class PerformanceTargetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly layers: PerformanceLayerService,
  ) {}

  async saveTargets(
    scope: 'account' | 'portfolio',
    targets: Record<string, number>,
    accountId?: string,
  ) {
    const normalizedTargetResult = normalizeAllocationTargets(targets);
    if (normalizedTargetResult.unknown.length > 0)
      throw new BadRequestException(
        `无法识别配置类别: ${normalizedTargetResult.unknown.join('、')}`,
      );
    const normalizedTargets = normalizedTargetResult.targets;
    const values = Object.values(normalizedTargets);
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0))
      throw new BadRequestException('目标权重必须是非负有限数字');
    if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-8)
      throw new BadRequestException('目标权重之和必须为 100%');
    await this.prisma.targetAllocation.updateMany({
      where: { scope, accountId: accountId ?? null, active: true },
      data: { active: false },
    });
    const latest = await this.prisma.targetAllocation.findFirst({
      where: { scope, accountId: accountId ?? null },
      orderBy: { version: 'desc' },
    });
    return this.prisma.targetAllocation.create({
      data: {
        scope,
        ...(accountId === undefined ? {} : { accountId }),
        version: (latest?.version ?? 0) + 1,
        targets: normalizedTargets,
        active: true,
      },
    });
  }

  async targets(
    scope: 'account' | 'portfolio',
    accountId?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    const explicitTarget = await this.prisma.targetAllocation.findFirst({
      where: { scope, accountId: accountId ?? null, active: true },
      orderBy: { version: 'desc' },
    });
    if (explicitTarget) return { ...explicitTarget, source: 'explicit' as const };
    if (scope === 'account') {
      return { scope, accountId: accountId ?? null, targets: {}, source: 'none' as const };
    }

    const accounts = await this.prisma.account.findMany({
      where: performanceAccountWhere(mode),
      select: { id: true },
    });
    const accountIds = accounts.map((account) => account.id);
    if (accountIds.length === 0) {
      return { scope, accountId: null, targets: {}, source: 'none' as const };
    }

    const storedTargets = await this.prisma.targetAllocation.findMany({
      where: { scope: 'account', accountId: { in: accountIds }, active: true },
      orderBy: [{ accountId: 'asc' }, { version: 'desc' }],
    });
    const latestTargetsByAccount = new Map<string, (typeof storedTargets)[number]>();
    for (const target of storedTargets) {
      if (target.accountId && !latestTargetsByAccount.has(target.accountId))
        latestTargetsByAccount.set(target.accountId, target);
    }
    if (latestTargetsByAccount.size === 0) {
      return { scope, accountId: null, targets: {}, source: 'none' as const };
    }

    const currentLayers = await this.layers.layers(undefined, undefined, mode, options);
    if (!currentLayers.portfolio) {
      return {
        scope,
        accountId: null,
        targets: {},
        source: 'none' as const,
        aggregationUnavailableReason: 'mixed-currency' as const,
      };
    }
    const accountValues = new Map(
      currentLayers.account.map((account) => [
        account.accountId,
        Math.max(0, (account.marketValue ?? 0) + (account.cashValue ?? 0)),
      ]),
    );
    const weightedTargets: Array<{
      accountId: string;
      accountValue: number;
      targets: Record<string, number>;
    }> = [];
    for (const [targetAccountId, target] of latestTargetsByAccount) {
      const rawTargets =
        target.targets && typeof target.targets === 'object' && !Array.isArray(target.targets)
          ? (target.targets as Record<string, number>)
          : {};
      const normalized = normalizeAllocationTargets(rawTargets);
      if (normalized.unknown.length > 0 || Object.keys(normalized.targets).length === 0) continue;
      weightedTargets.push({
        accountId: targetAccountId,
        accountValue: accountValues.get(targetAccountId) ?? 0,
        targets: normalized.targets,
      });
    }
    if (weightedTargets.length === 0) {
      return { scope, accountId: null, targets: {}, source: 'none' as const };
    }

    const totalAccountValue = weightedTargets.reduce((sum, target) => sum + target.accountValue, 0);
    const equalAccountWeight = 1 / weightedTargets.length;
    const aggregatedTargets: Record<string, number> = {};
    for (const target of weightedTargets) {
      const accountWeight =
        totalAccountValue > 0 ? target.accountValue / totalAccountValue : equalAccountWeight;
      for (const [category, targetWeight] of Object.entries(target.targets)) {
        aggregatedTargets[category] =
          (aggregatedTargets[category] ?? 0) + targetWeight * accountWeight;
      }
    }
    const aggregateTotal = Object.values(aggregatedTargets).reduce(
      (sum, targetWeight) => sum + targetWeight,
      0,
    );
    if (aggregateTotal > 0) {
      for (const category of Object.keys(aggregatedTargets))
        aggregatedTargets[category] = (aggregatedTargets[category] ?? 0) / aggregateTotal;
    }
    return {
      scope,
      accountId: null,
      targets: aggregatedTargets,
      source: 'account-aggregate' as const,
      aggregatedAccountCount: weightedTargets.length,
    };
  }
}
