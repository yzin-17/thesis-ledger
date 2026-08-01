import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { accountInputSchema } from '@investment-os/schemas';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.account.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
  }
  async create(input: unknown) {
    const data = accountInputSchema.parse(input);
    const existing = await this.prisma.account.findUnique({
      where: { name_source: { name: data.name, source: data.source } },
    });
    if (existing) throw new ConflictException('同一来源下账户名称已存在');
    return this.prisma.account.create({
      data: {
        name: data.name,
        source: data.source,
        type: data.type,
        currency: data.currency,
        ...(data.broker === undefined ? {} : { broker: data.broker }),
      },
    });
  }
  async update(id: string, input: unknown) {
    const data = accountInputSchema.partial().parse(input);
    const update: Prisma.AccountUpdateInput = {
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.source === undefined ? {} : { source: data.source }),
      ...(data.type === undefined ? {} : { type: data.type }),
      ...(data.currency === undefined ? {} : { currency: data.currency }),
      ...(data.broker === undefined ? {} : { broker: data.broker }),
    };
    return this.prisma.account.update({ where: { id }, data: update });
  }
  async deactivate(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { positions: true },
    });
    if (!account) throw new NotFoundException('账户不存在');
    if (account.positions.length > 0)
      throw new BadRequestException('账户仍有持仓，只能先清空持仓再停用');
    return this.prisma.account.update({ where: { id }, data: { active: false } });
  }
}
