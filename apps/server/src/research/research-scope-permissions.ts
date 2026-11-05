import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  aiContextSchema,
  type ResearchScopeSnapshotV2,
  type ResearchSubmissionV2,
} from '@thesis-ledger/schemas';
import type { AiResearchSubmissionV2Access } from '../ai/ai-research-submission-v2.store.js';
import { localIdentityPrincipal } from '../identity/local-workspace.js';

function ledgerAccess(ownerId: string) {
  if (localIdentityPrincipal()?.id !== ownerId)
    throw new ForbiddenException('当前身份没有共享账本研究读取权限');
}
async function strategyAccess(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  versionId: string,
) {
  const version = await transaction.strategyVersion.findFirst({
    where: { id: versionId, strategy: { OR: [{ ownerId: null }, { ownerId }] } },
    select: { id: true },
  });
  if (!version) throw new NotFoundException('策略版本不存在或不可访问');
}
function portfolioIdentity(portfolioId: string | null | undefined) {
  if (portfolioId != null) throw new BadRequestException('组合标识不存在，当前仅支持工作区组合');
}
export class ResearchScopePermissions implements AiResearchSubmissionV2Access {
  allowedScopes(ownerId: string): ResearchSubmissionV2['scope']['scope'][] {
    if (localIdentityPrincipal()?.id === ownerId)
      return ['instrument', 'portfolio', 'account', 'position', 'strategy'];
    return ['instrument', 'strategy'];
  }
  async assertLegacy(transaction: Prisma.TransactionClient, ownerId: string, raw: unknown) {
    const context = aiContextSchema.safeParse(raw);
    if (context.success && context.data.scope === 'strategy' && context.data.strategyVersionId)
      return strategyAccess(transaction, ownerId, context.data.strategyVersionId);
    ledgerAccess(ownerId);
    if (!context.success || !context.data.accountId) return;
    const account = await transaction.account.findFirst({
      where: { id: context.data.accountId, active: true },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('历史研究上下文不可访问');
    if (context.data.scope === 'position' && context.data.symbol) {
      const position = await transaction.position.findUnique({
        where: { accountId_symbol: { accountId: account.id, symbol: context.data.symbol } },
        select: { id: true },
      });
      if (!position) throw new NotFoundException('历史研究上下文不可访问');
    }
  }
  async assertSubmission(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    input: ResearchSubmissionV2,
  ) {
    const selection = input.scope;
    if (selection.scope === 'instrument') return;
    if (selection.scope === 'strategy')
      return strategyAccess(transaction, ownerId, selection.strategyVersionId);
    ledgerAccess(ownerId);
    if (selection.scope === 'portfolio') {
      portfolioIdentity(selection.portfolioId);
      return;
    }
    const count = await transaction.account.count({
      where: { id: selection.accountId, mode: input.mode },
    });
    if (count !== 1) throw new NotFoundException('账户不存在或与提交模式不一致');
  }
  async assertSnapshot(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    snapshot: ResearchScopeSnapshotV2,
  ) {
    if (snapshot.scope === 'instrument') return;
    if (snapshot.scope === 'strategy')
      return strategyAccess(transaction, ownerId, snapshot.strategyVersionId);
    ledgerAccess(ownerId);
    let ids: string[];
    if (snapshot.scope === 'portfolio') {
      portfolioIdentity(snapshot.portfolioId);
      ids = snapshot.accountIds;
    } else ids = [snapshot.accountId];
    const count = await transaction.account.count({
      where: { id: { in: ids }, mode: snapshot.mode },
    });
    if (count !== ids.length) throw new ForbiddenException('冻结账户范围当前不可访问');
  }
}
