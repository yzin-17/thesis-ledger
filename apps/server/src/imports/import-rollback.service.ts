import { BadRequestException, ConflictException, Injectable, Optional } from '@nestjs/common';
import { appendLedgerEvent, LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../platform/prisma.service.js';

@Injectable()
export class ImportRollbackService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ledger?: LedgerService,
  ) {}

  async rollback(id: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const draft = await transaction.importDraft.findUnique({ where: { id } });
      if (!draft || draft.status !== 'committed')
        throw new BadRequestException('只能回滚已提交的导入');
      const before = (Array.isArray(draft.beforeState) ? draft.beforeState : []) as Array<{
        symbol?: unknown;
        quantity?: unknown;
        costPrice?: unknown;
      }>;
      const rows = (Array.isArray(draft.rows) ? draft.rows : []) as unknown[];
      const submittedSymbols = new Set(
        rows
          .filter((row): row is Record<string, unknown> =>
            Boolean(row && typeof row === 'object' && !Array.isArray(row)),
          )
          .map((row) => (typeof row.symbol === 'string' ? row.symbol : ''))
          .filter(Boolean),
      );
      if (submittedSymbols.size > 0 && draft.committedAt) {
        const laterEvent = await transaction.ledgerEvent.findFirst({
          where: {
            accountId: draft.accountId,
            symbol: { in: [...submittedSymbols] },
            createdAt: { gt: draft.committedAt },
          },
          orderBy: { createdAt: 'asc' },
        });
        if (laterEvent)
          throw new ConflictException(
            `导入提交后 ${laterEvent.symbol ?? '相关标的'} 已有新的 Ledger 事件，不能自动回滚`,
          );
      }
      for (const symbol of submittedSymbols) {
        await appendLedgerEvent(transaction, {
          version: 1,
          id: crypto.randomUUID(),
          accountId: draft.accountId,
          type: 'ADJUSTMENT',
          occurredAt: new Date().toISOString(),
          symbol,
          currency: 'CNY',
          source: 'screenshot:rollback',
          externalUid: `screenshot:${draft.id}:rollback:${symbol}`,
          correctionOf: draft.id,
          note: '回滚截图导入',
          metadata: { kind: 'rollback', importDraftId: draft.id, quantity: 0, costPrice: 0 },
        });
      }
      for (const item of before) {
        if (typeof item.symbol !== 'string' || !submittedSymbols.has(item.symbol)) continue;
        await appendLedgerEvent(transaction, {
          version: 1,
          id: crypto.randomUUID(),
          accountId: draft.accountId,
          type: 'ADJUSTMENT',
          occurredAt: new Date().toISOString(),
          symbol: item.symbol,
          quantity: Number(item.quantity),
          price: Number(item.costPrice),
          currency: 'CNY',
          source: 'screenshot:rollback',
          externalUid: `screenshot:${draft.id}:rollback:before:${item.symbol}`,
          correctionOf: draft.id,
          note: '恢复截图导入前持仓',
          metadata: {
            kind: 'rollback',
            importDraftId: draft.id,
            quantity: Number(item.quantity),
            costPrice: Number(item.costPrice),
          },
        });
      }
      return transaction.importDraft.update({
        where: { id },
        data: { status: 'cancelled', rolledBackAt: new Date() },
      });
    });
    if (this.ledger) await this.ledger.rebuild(result.accountId);
    return result;
  }
}
