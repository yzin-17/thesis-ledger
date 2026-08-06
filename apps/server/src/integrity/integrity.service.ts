import { Injectable } from '@nestjs/common';
import { projectAverageCost, type LedgerEvent } from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';

export interface IntegrityIssue {
  code: string;
  severity: 'warning' | 'error';
  entity: string;
  message: string;
  suggestion: string;
}

@Injectable()
export class IntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const accounts = await this.prisma.account.findMany({
      include: { ledger: true, positions: true, snapshots: true },
    });
    const issues: IntegrityIssue[] = [];
    for (const account of accounts) {
      const seen = new Set<string>();
      for (const event of account.ledger) {
        if (event.externalId && seen.has(event.externalId))
          issues.push({
            code: 'duplicate_external_uid',
            severity: 'error',
            entity: event.id,
            message: `账户 ${account.id} 存在重复 externalUid ${event.externalId}`,
            suggestion: '检查导入来源并保留一条事实记录，其余通过受控修正处理',
          });
        if (event.externalId) seen.add(event.externalId);
      }
      let projected;
      try {
        projected = projectAverageCost(
          account.ledger.map((event): LedgerEvent => ({
            id: event.id,
            accountId: event.accountId,
            type: event.type as LedgerEvent['type'],
            occurredAt: event.occurredAt.toISOString(),
            ...(event.symbol === null ? {} : { symbol: event.symbol }),
            ...(event.quantity === null ? {} : { quantity: Number(event.quantity) }),
            ...(event.price === null ? {} : { price: Number(event.price) }),
            ...(event.fee === null ? {} : { fee: Number(event.fee) }),
            ...(event.tax === null ? {} : { tax: Number(event.tax) }),
            ...(event.metadata && typeof event.metadata === 'object'
              ? { metadata: event.metadata as Record<string, unknown> }
              : {}),
          })),
        );
      } catch (error) {
        issues.push({
          code: 'ledger_projection_failed',
          severity: 'error',
          entity: account.id,
          message: error instanceof Error ? error.message : 'Ledger 投影失败',
          suggestion: '检查事件顺序、超卖和公司行动参数',
        });
        continue;
      }
      const actual = new Map(account.positions.map((position) => [position.symbol, position]));
      for (const expected of projected) {
        const position = actual.get(expected.symbol);
        if (
          !position ||
          Math.abs(Number(position.quantity) - expected.quantity) > 1e-6 ||
          Math.abs(Number(position.costPrice) - expected.averageCost) > 1e-4
        )
          issues.push({
            code: 'position_projection_mismatch',
            severity: 'error',
            entity: `${account.id}:${expected.symbol}`,
            message: 'Position 与 Ledger AVG 投影不一致',
            suggestion: '在确认 Ledger 正确后执行只读预览，再运行 Position rebuild',
          });
      }
      for (const snapshot of account.snapshots)
        if (Number(snapshot.marketValue) < 0 || Number(snapshot.costValue) < 0)
          issues.push({
            code: 'invalid_snapshot_value',
            severity: 'error',
            entity: snapshot.id,
            message: 'Snapshot 包含负的市值或成本',
            suggestion: '从 Ledger 与对应时点 Market 数据重建该 Snapshot',
          });
    }
    return {
      checkedAt: new Date().toISOString(),
      accountCount: accounts.length,
      issueCount: issues.length,
      healthy: issues.every((issue) => issue.severity !== 'error'),
      issues,
    };
  }
}
