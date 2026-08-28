import { Injectable } from '@nestjs/common';
import { projectAverageCost } from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import { toDomainEvents } from '../ledger/ledger-legacy-adapter.js';

export interface IntegrityIssue {
  code: string;
  severity: 'warning' | 'error';
  entity: string;
  message: string;
  suggestion: string;
}

const POSITION_EPSILON = 1e-8;

@Injectable()
export class IntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const accounts = await this.prisma.account.findMany({
      include: {
        ledger: true,
        positions: true,
        snapshots: true,
        trades: { select: { symbol: true, lifecycle: true, remainingQuantity: true } },
      },
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
        projected = projectAverageCost(toDomainEvents(account.ledger));
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
      if (Array.isArray(account.trades)) {
        const activeTradeQuantities = new Map<string, number>();
        for (const trade of account.trades) {
          if (trade.lifecycle !== 'ACTIVE') continue;
          activeTradeQuantities.set(
            trade.symbol,
            (activeTradeQuantities.get(trade.symbol) ?? 0) + Number(trade.remainingQuantity),
          );
        }
        const symbols = new Set([...activeTradeQuantities.keys(), ...actual.keys()]);
        for (const symbol of symbols) {
          const expectedQuantity = activeTradeQuantities.get(symbol) ?? 0;
          const storedQuantity = Number(actual.get(symbol)?.quantity ?? 0);
          if (Math.abs(storedQuantity - expectedQuantity) <= 1e-6) continue;
          issues.push({
            code: 'position_trade_quantity_mismatch',
            severity: 'error',
            entity: `${account.id}:${symbol}`,
            message: 'Position 数量与 ACTIVE Trade 剩余数量不一致',
            suggestion: '在确认 Ledger 正确后重建 Trade 与 Position 核心投影',
          });
        }
      }
      const expected = new Map(
        projected
          .filter((position) => Math.abs(position.quantity) > POSITION_EPSILON)
          .map((position) => [position.symbol, position]),
      );
      for (const position of expected.values()) {
        const stored = actual.get(position.symbol);
        if (
          !stored ||
          Math.abs(Number(stored.quantity) - position.quantity) > 1e-6 ||
          Math.abs(Number(stored.costPrice) - position.averageCost) > 1e-4
        )
          issues.push({
            code: 'position_projection_mismatch',
            severity: 'error',
            entity: `${account.id}:${position.symbol}`,
            message: 'Position 与 Ledger AVG 投影不一致',
            suggestion: '在确认 Ledger 正确后执行只读预览，再运行 Position rebuild',
          });
      }
      for (const position of account.positions) {
        if (
          Math.abs(Number(position.quantity)) > POSITION_EPSILON &&
          !expected.has(position.symbol)
        )
          issues.push({
            code: 'position_without_ledger_projection',
            severity: 'error',
            entity: `${account.id}:${position.symbol}`,
            message: 'DB Position 存在，但 Ledger 没有对应的非零投影',
            suggestion: '检查遗留 Position 或缺失 Ledger 事件，再执行 Position rebuild',
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
