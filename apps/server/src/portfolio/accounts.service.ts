import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { accountInputSchema } from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';
import { projectCashBalances } from '../ledger/cash-projection.js';

export type AccountContainerType = 'securities' | 'fund' | 'cash';
export type AccountMode = 'actual' | 'shadow';
export type HeldAssetType = 'stock' | 'etf' | 'fund';

const hasCashBalance = (balances: Map<string, Prisma.Decimal>) =>
  [...balances.values()].some((value) => Math.abs(value.toNumber()) > 0.00000001);

export const assertAccountCanHoldAsset = (
  account: { type: string; mode?: string; currency?: string },
  assetType: string,
) => {
  if (account.type === 'cash') throw new BadRequestException('现金账户只能录入现金余额');
  if (account.type === 'securities' && !['stock', 'etf'].includes(assetType))
    throw new BadRequestException('证券账户只支持 A 股股票和交易所 ETF');
  if (account.type === 'fund' && assetType !== 'fund')
    throw new BadRequestException('基金账户只支持场外基金');
};

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.account.findMany({
      ...(includeInactive ? {} : { where: { active: true } }),
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(input: unknown) {
    const data = accountInputSchema.parse(input);
    return this.prisma.account.create({
      data: {
        name: data.name,
        ...(data.institution === undefined ? {} : { institution: data.institution }),
        type: data.type,
        mode: data.mode,
        currency: data.currency,
      },
    });
  }

  async update(id: string, input: unknown) {
    const data = accountInputSchema.partial().parse(input);
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { positions: true },
    });
    if (!account) throw new NotFoundException('账户不存在');
    const ledgerCount =
      typeof (this.prisma.ledgerEvent as { count?: unknown }).count === 'function'
        ? await this.prisma.ledgerEvent.count({ where: { accountId: id } })
        : 0;
    const typeChanged = data.type !== undefined && data.type !== account.type;
    const modeChanged = data.mode !== undefined && data.mode !== account.mode;
    const currencyChanged = data.currency !== undefined && data.currency !== account.currency;
    if ((typeChanged || modeChanged || currencyChanged) && ledgerCount > 0)
      throw new BadRequestException('账户已有 Ledger 事件，类型、模式和币种已锁定');
    if (currencyChanged) {
      if (account.positions.some((position) => Number(position.quantity) > 0))
        throw new BadRequestException('账户仍有持仓，清空后才能修改本位币');
      const ledgerEvents =
        typeof (this.prisma.ledgerEvent as { findMany?: unknown } | undefined)?.findMany ===
        'function'
          ? await this.prisma.ledgerEvent.findMany({ where: { accountId: id } })
          : [];
      const balances = projectCashBalances(ledgerEvents);
      if (hasCashBalance(balances.get(id) ?? new Map<string, Prisma.Decimal>()))
        throw new BadRequestException('账户仍有现金余额，清空后才能修改本位币');
    }
    const update: Prisma.AccountUpdateInput = {
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.institution === undefined ? {} : { institution: data.institution }),
      ...(data.type === undefined ? {} : { type: data.type }),
      ...(data.mode === undefined ? {} : { mode: data.mode }),
      ...(data.currency === undefined ? {} : { currency: data.currency }),
    };
    return this.prisma.account.update({ where: { id }, data: update });
  }

  async deactivate(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { positions: true },
    });
    if (!account) throw new NotFoundException('账户不存在');
    if (
      account.positions.some(
        (position) => position.quantity === undefined || Number(position.quantity) > 0,
      )
    )
      throw new BadRequestException('账户仍有持仓，只能先清空持仓再停用');
    const ledgerEvents =
      typeof (this.prisma.ledgerEvent as { findMany?: unknown } | undefined)?.findMany ===
      'function'
        ? await this.prisma.ledgerEvent.findMany({ where: { accountId: id } })
        : [];
    const balances = projectCashBalances(ledgerEvents);
    if (hasCashBalance(balances.get(id) ?? new Map<string, Prisma.Decimal>()))
      throw new BadRequestException('账户仍有现金余额，只能先清空现金再停用');
    return this.prisma.account.update({ where: { id }, data: { active: false } });
  }

  async reactivate(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('账户不存在');
    return this.prisma.account.update({ where: { id }, data: { active: true } });
  }
}
