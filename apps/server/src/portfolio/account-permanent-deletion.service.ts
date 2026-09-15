import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../platform/prisma.service.js';

type CountDelegate = {
  count(args: { where: { accountId: string } }): Promise<number>;
};

type LockedAccountRow = { id: string };
type RawCountRow = { count: bigint | number | string };

const accountIdSchema = z.uuid();

const accountRelationChecks = [
  ['accountLedgerState', '账户存在账本状态记录，无法永久删除'],
  ['accountCostStrategyVersion', '账户存在成本策略版本记录，无法永久删除'],
  ['position', '账户存在持仓记录，无法永久删除'],
  ['trade', '账户存在交易记录，无法永久删除'],
  ['cashBalance', '账户存在现金余额记录，无法永久删除'],
  ['cashSettlement', '账户存在现金结算记录，无法永久删除'],
  ['importDraft', '账户存在导入草稿记录，无法永久删除'],
  ['baselineObservationBatch', '账户存在基线观察批次记录，无法永久删除'],
  ['ledgerEvent', '账户存在 Ledger 事件记录，无法永久删除'],
  ['portfolioSnapshot', '账户存在组合快照记录，无法永久删除'],
  ['accountValuationPoint', '账户存在估值点记录，无法永久删除'],
  ['riskRule', '账户存在风险规则记录，无法永久删除'],
  ['riskPositionState', '账户存在风险持仓状态记录，无法永久删除'],
  ['riskEvent', '账户存在风险事件记录，无法永久删除'],
  ['tradePlan', '账户存在交易计划记录，无法永久删除'],
  ['recurringCashDepositPlan', '账户存在现金定投计划记录，无法永久删除'],
  ['recurringCashDepositOccurrence', '账户存在现金定投发生记录，无法永久删除'],
  ['recurringFundInvestmentPlan', '账户存在基金定投计划记录，无法永久删除'],
  ['recurringFundInvestmentOccurrence', '账户存在基金定投发生记录，无法永久删除'],
  ['targetAllocation', '账户存在目标配置记录，无法永久删除'],
  ['journalEntry', '账户存在 Journal 记录，无法永久删除'],
  ['journalReviewSnapshot', '账户存在 Journal Review 快照记录，无法永久删除'],
  ['aiDecisionLog', '账户存在 AI 决策日志记录，无法永久删除'],
] as const;

const accountInUse = (message: string) =>
  new ConflictException({ errorCode: 'ACCOUNT_IN_USE', message });

const isForeignKeyConflict = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2003';
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2003'
  );
};

const countValue = (value: unknown, label: string) => {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error(`账户关联检查返回无效数量: ${label}`);
  return count;
};

@Injectable()
export class AccountPermanentDeletionService {
  constructor(private readonly prisma: PrismaService) {}

  async delete(id: string): Promise<void> {
    if (!accountIdSchema.safeParse(id).success) throw new NotFoundException('账户不存在');

    try {
      await (this.prisma as unknown as Pick<PrismaClient, '$transaction'>).$transaction(
        async (transaction) => {
          const locked = await transaction.$queryRaw<LockedAccountRow[]>(Prisma.sql`
            SELECT "id"
            FROM "Account"
            WHERE "id" = ${id}::uuid
            FOR UPDATE
          `);
          if (locked.length === 0) throw new NotFoundException('账户不存在');

          const delegates = transaction as unknown as Record<string, unknown>;
          for (const [delegateName, message] of accountRelationChecks) {
            const delegate = delegates[delegateName] as CountDelegate | undefined;
            if (!delegate || typeof delegate.count !== 'function')
              throw new Error(`无法检查账户关联: ${delegateName}`);
            const count = countValue(
              await delegate.count({ where: { accountId: id } }),
              delegateName,
            );
            if (count > 0) throw accountInUse(message);
          }

          const strategyApplications = await transaction.$queryRaw<RawCountRow[]>(Prisma.sql`
            SELECT COUNT(*)::bigint AS "count"
            FROM "StrategyRiskApplication"
            WHERE "accountId" = ${id}::uuid
          `);
          if (strategyApplications.length !== 1)
            throw new Error('策略风险应用关联检查返回无效结果');
          if (countValue(strategyApplications[0]?.count, 'StrategyRiskApplication') > 0)
            throw accountInUse('账户存在策略风险应用记录，无法永久删除');

          await transaction.account.delete({ where: { id } });
        },
      );
    } catch (error) {
      if (isForeignKeyConflict(error)) throw accountInUse('账户存在关联记录，无法永久删除');
      throw error;
    }
  }
}
