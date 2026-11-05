import { NotFoundException } from '@nestjs/common';
import { aiContextSchema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';

/** 既有兼容入口的上下文存在性规则；V2 由独立范围与身份合同读取。 */
export async function assertLegacyAiContextAccess(prisma: PrismaService, raw: unknown) {
  const parsed = aiContextSchema.safeParse(raw);
  if (!parsed.success) return;
  const context = parsed.data;
  if (context.accountId && prisma.account?.findUnique) {
    const account = await prisma.account.findUnique({
      where: { id: context.accountId },
      select: { id: true, active: true },
    });
    if (!account || account.active === false) throw new NotFoundException('研究上下文已不可访问');
  }
  if (
    context.scope === 'position' &&
    context.accountId &&
    context.symbol &&
    prisma.position?.findUnique
  ) {
    const position = await prisma.position.findUnique({
      where: { accountId_symbol: { accountId: context.accountId, symbol: context.symbol } },
      select: { id: true },
    });
    if (!position) throw new NotFoundException('研究上下文已不可访问');
  }
  if (context.strategyVersionId && prisma.strategyVersion?.findUnique) {
    const version = await prisma.strategyVersion.findUnique({
      where: { id: context.strategyVersionId },
      select: { id: true },
    });
    if (!version) throw new NotFoundException('研究上下文已不可访问');
  }
}
