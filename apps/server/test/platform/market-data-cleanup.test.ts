import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertMarketCleanupAuthorization,
  MARKET_CLEANUP_REDIS_PREFIXES,
  MARKET_CLEANUP_TABLES,
  marketCleanupConfirmation,
  marketCleanupSqlForTest,
  MarketDataCleanupService,
  parseMarketCleanupSnapshotRoot,
} from '../../src/platform/market-data-cleanup.js';

describe('market data cleanup safety gates', () => {
  it('只接受 development、allow-data-loss 和精确 database/owner/root 确认', () => {
    const expected = marketCleanupConfirmation(
      { databaseName: 'thesis_ledger_dev', ownerName: 'app' },
      resolve(process.cwd(), 'var', 'market-snapshot-test'),
    );
    expect(() => assertMarketCleanupAuthorization({
      nodeEnv: 'test', allowDataLoss: 'true', confirmation: expected, expectedConfirmation: expected,
    })).toThrow('仅允许 NODE_ENV=development');
    expect(() => assertMarketCleanupAuthorization({
      nodeEnv: 'development', allowDataLoss: 'false', confirmation: expected, expectedConfirmation: expected,
    })).toThrow('MARKET_CLEANUP_ALLOW_DATA_LOSS=true');
    expect(() => assertMarketCleanupAuthorization({
      nodeEnv: 'development', allowDataLoss: 'true', confirmation: expected.replace('owner=app', 'owner=other'), expectedConfirmation: expected,
    })).toThrow('必须精确匹配');
    expect(() => assertMarketCleanupAuthorization({
      nodeEnv: 'development', allowDataLoss: 'true', confirmation: expected, expectedConfirmation: expected,
    })).not.toThrow();
  });

  it('拒绝文件系统、home、cwd、仓库根和过宽目录作为快照根', () => {
    for (const value of ['/', homedir(), process.cwd(), resolve(process.cwd(), '..', '..')]) {
      expect(() => parseMarketCleanupSnapshotRoot(value)).toThrow('过宽');
    }
    expect(parseMarketCleanupSnapshotRoot(resolve(process.cwd(), 'var', 'backtest'))).toBe(
      resolve(process.cwd(), 'var', 'backtest'),
    );
    expect(() => parseMarketCleanupSnapshotRoot(resolve(process.cwd(), 'var'))).toThrow('过宽');
  });

  it('SQL 只包含行情及衍生物，且先解除 JournalEntry 风险关联', () => {
    expect(marketCleanupSqlForTest[0]).toContain('UPDATE "JournalEntry"');
    expect(marketCleanupSqlForTest[0]).toContain('"riskEventId" = NULL');
    expect(marketCleanupSqlForTest.indexOf('DELETE FROM "RiskRuleTriggerState"')).toBeLessThan(
      marketCleanupSqlForTest.indexOf('DELETE FROM "RiskEvent"'),
    );
    expect(marketCleanupSqlForTest.indexOf('DELETE FROM "AccountValuationPoint"')).toBeLessThan(
      marketCleanupSqlForTest.indexOf('DELETE FROM "PortfolioSnapshot"'),
    );
    expect(marketCleanupSqlForTest.at(-1)).toContain('DELETE FROM "MarketBar"');
    expect(MARKET_CLEANUP_TABLES).not.toContain('Account');
    expect(MARKET_CLEANUP_TABLES).not.toContain('Position');
    expect(MARKET_CLEANUP_TABLES).not.toContain('RiskRule');
    expect(marketCleanupSqlForTest.join('\n')).not.toContain('DROP ');
  });

  it('Redis 只扫描精确行情前缀并使用 UNLINK，不执行 FLUSHDB', async () => {
    const scans: string[] = [];
    const unlinked: string[][] = [];
    const client = {
      async scan(_cursor: string, _match: string, pattern: string) {
        scans.push(pattern);
        return ['0', [`${pattern.slice(0, -1)}fixture`]] as [string, string[]];
      },
      async unlink(...keys: string[]) {
        unlinked.push(keys);
        return keys.length;
      },
      async del() { return 0; },
    };
    const service = new MarketDataCleanupService({} as never);
    await service.clearRedisNamespaces(client);
    expect(scans).toEqual(MARKET_CLEANUP_REDIS_PREFIXES.map((prefix) => `${prefix}*`));
    expect(unlinked).toHaveLength(MARKET_CLEANUP_REDIS_PREFIXES.length);
    expect(scans.join('\n')).not.toContain('*:*');
  });
});
