import { Injectable } from '@nestjs/common';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { PrismaService } from './prisma.service.js';
import { RedisService, redisKey } from './redis.service.js';

/** 只允许删除这些明确的行情/衍生数据表；账户、交易、策略和风险规则不在此列表。 */
export const MARKET_CLEANUP_TABLES = [
  'JournalEntry.riskEventId（仅置空）',
  'RiskRuleTriggerState',
  'RiskEvent',
  'RiskPositionState',
  'AccountValuationPoint',
  'PortfolioSnapshot',
  'BacktestJob',
  'BackfillJob',
  'MarketBarSeriesCoverage',
  'MarketBarSeriesFact',
  'MarketBar',
] as const;

/** Redis 只清理行情模块自己的前缀，禁止使用 FLUSHDB。 */
export const MARKET_CLEANUP_REDIS_PREFIXES = [
  redisKey('cache', 'bars:'),
  redisKey('cache', 'bars-v2:'),
  redisKey('cache', 'indicator:'),
  redisKey('cache', 'market-indicators-v2:'),
  redisKey('lock', 'market-bars-v2:'),
  redisKey('lock', 'market-circuit-v2:'),
  redisKey('cache', 'market-circuit-v2:'),
] as const;

const CLEANUP_SQL = [
  'UPDATE "JournalEntry" SET "riskEventId" = NULL WHERE "riskEventId" IS NOT NULL',
  'DELETE FROM "RiskRuleTriggerState"',
  'DELETE FROM "RiskEvent"',
  'DELETE FROM "RiskPositionState"',
  'DELETE FROM "AccountValuationPoint"',
  'DELETE FROM "PortfolioSnapshot"',
  'DELETE FROM "BacktestJob"',
  `DO $$ BEGIN
     IF to_regclass('public."BackfillJob"') IS NOT NULL THEN
       EXECUTE 'DELETE FROM "BackfillJob"';
     END IF;
   END $$`,
  'DELETE FROM "MarketBarSeriesCoverage"',
  'DELETE FROM "MarketBarSeriesFact"',
  `DO $$ BEGIN
     IF to_regclass('public."MarketBar"') IS NOT NULL THEN
       EXECUTE 'DELETE FROM "MarketBar"';
     END IF;
   END $$`,
] as const;

type DatabaseIdentity = { databaseName: string; ownerName: string };
type TableCount = { table: string; count: string };
export type MarketCleanupPreflight = {
  databaseName: string;
  ownerName: string;
  snapshotRoot: string;
  tableCounts: readonly TableCount[];
  redisPrefixes: readonly string[];
  confirmation: string;
  irreversibleImpact: readonly string[];
};

type RedisCleanupClient = {
  scan(cursor: string, ...args: string[]): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
  unlink?: (...keys: string[]) => Promise<number>;
};

const defaultSnapshotRoot = () => resolve(process.cwd(), 'var/backtest');

/** 解析并限制快照根目录，避免把仓库、home 或系统目录当作清理目标。 */
export const parseMarketCleanupSnapshotRoot = (value = process.env.BACKTEST_SNAPSHOT_ROOT) => {
  if (value !== undefined && value.trim() === '') throw new Error('BACKTEST_SNAPSHOT_ROOT 不能为空');
  const candidate = resolve(value ?? defaultSnapshotRoot());
  const filesystemRoot = parse(candidate).root;
  const currentDirectory = resolve(process.cwd());
  const repositoryRoot = resolve(currentDirectory, '..', '..');
  const protectedRoots = [filesystemRoot, resolve(homedir()), currentDirectory, repositoryRoot];
  if (protectedRoots.some((protectedRoot) => candidate === protectedRoot)) {
    throw new Error(`拒绝过宽的 BACKTEST_SNAPSHOT_ROOT: ${candidate}`);
  }
  const relativeToHome = relative(resolve(homedir()), candidate);
  if (relativeToHome === '..' || relativeToHome.startsWith(`..${sep}`)) {
    // 非 home 路径不受 home 的子路径规则影响。
  } else if (relativeToHome === '') {
    throw new Error(`拒绝过宽的 BACKTEST_SNAPSHOT_ROOT: ${candidate}`);
  }
  const baseName = parse(candidate).base.toLowerCase();
  if (['data', 'var', 'tmp', 'snapshots', 'workspace', 'repo'].includes(baseName)) {
    throw new Error(`拒绝过宽的 BACKTEST_SNAPSHOT_ROOT: ${candidate}`);
  }
  if (!isAbsolute(candidate)) throw new Error('BACKTEST_SNAPSHOT_ROOT 必须解析为绝对路径');
  return candidate;
};

export const marketCleanupConfirmation = (identity: DatabaseIdentity, snapshotRoot: string) =>
  `database=${identity.databaseName};owner=${identity.ownerName};snapshotRoot=${snapshotRoot}`;

export const assertMarketCleanupAuthorization = ({
  nodeEnv,
  allowDataLoss,
  confirmation,
  expectedConfirmation,
}: {
  nodeEnv: string | undefined;
  allowDataLoss: string | undefined;
  confirmation: string | undefined;
  expectedConfirmation: string;
}) => {
  if (nodeEnv !== 'development') throw new Error('行情清理仅允许 NODE_ENV=development');
  if (allowDataLoss !== 'true') throw new Error('MARKET_CLEANUP_ALLOW_DATA_LOSS=true 是行情清理的必需确认');
  if (confirmation !== expectedConfirmation) {
    throw new Error(`MARKET_CLEANUP_CONFIRM 必须精确匹配 ${expectedConfirmation}`);
  }
};

const queryCount = async (prisma: PrismaService, table: string): Promise<TableCount> => {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT CASE WHEN to_regclass('public."${table}"') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM "${table}") END AS "count"`,
  );
  return { table, count: String(rows[0]?.count ?? 0) };
};

@Injectable()
export class MarketDataCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis?: RedisService,
  ) {}

  private async readDatabaseIdentity(): Promise<DatabaseIdentity> {
    const rows = await this.prisma.$queryRawUnsafe<DatabaseIdentity[]>(
      'SELECT current_database() AS "databaseName", current_user AS "ownerName"',
    );
    const identity = rows[0];
    if (!identity?.databaseName || !identity.ownerName) throw new Error('无法读取当前数据库和 owner');
    return identity;
  }

  async preflight(snapshotRoot = parseMarketCleanupSnapshotRoot()): Promise<MarketCleanupPreflight> {
    const identity = await this.readDatabaseIdentity();
    const tableCounts = await Promise.all(
      MARKET_CLEANUP_TABLES.map((label) => queryCount(this.prisma, label.split('.')[0] ?? label)),
    );
    return {
      ...identity,
      snapshotRoot,
      tableCounts,
      redisPrefixes: MARKET_CLEANUP_REDIS_PREFIXES,
      confirmation: marketCleanupConfirmation(identity, snapshotRoot),
      irreversibleImpact: [
        '不可恢复地删除行情 bars、覆盖记录、风险运行状态、估值点、组合快照、回测/回填任务及本地行情快照内容。',
        'JournalEntry 本体保留，但其 riskEventId 关联会被置空。',
        '账户、交易、持仓、策略、RiskRule/RiskRuleAudit、StrategyRiskApplication/Audit 保留。',
        '不删除 PostgreSQL/Redis Docker volume。',
      ],
    };
  }

  async execute(preflight: MarketCleanupPreflight): Promise<void> {
    assertMarketCleanupAuthorization({
      nodeEnv: process.env.NODE_ENV,
      allowDataLoss: process.env.MARKET_CLEANUP_ALLOW_DATA_LOSS,
      confirmation: process.env.MARKET_CLEANUP_CONFIRM,
      expectedConfirmation: preflight.confirmation,
    });
    const configuredSnapshotRoot = parseMarketCleanupSnapshotRoot();
    if (configuredSnapshotRoot !== preflight.snapshotRoot) throw new Error('快照根目录确认值发生变化，拒绝执行');
    const snapshotRoot = configuredSnapshotRoot;
    const identity = await this.readDatabaseIdentity();
    const expectedConfirmation = marketCleanupConfirmation(identity, snapshotRoot);
    if (
      preflight.databaseName !== identity.databaseName ||
      preflight.ownerName !== identity.ownerName ||
      preflight.confirmation !== expectedConfirmation
    ) throw new Error('预检目标与当前 database/owner/snapshot root 不一致，拒绝执行');
    if (process.env.MARKET_CLEANUP_CONFIRM !== expectedConfirmation) {
      throw new Error(`MARKET_CLEANUP_CONFIRM 必须精确匹配 ${expectedConfirmation}`);
    }
    await this.prisma.$transaction(async (transaction) => {
      for (const statement of CLEANUP_SQL) await transaction.$executeRawUnsafe(statement);
    });
    await this.clearRedisNamespaces(this.redis?.client as unknown as RedisCleanupClient | undefined);
    await mkdir(snapshotRoot, { recursive: true });
    for (const entry of await readdir(snapshotRoot)) {
      await rm(resolve(snapshotRoot, entry), { recursive: true, force: true });
    }
    await mkdir(snapshotRoot, { recursive: true });
  }

  async clearRedisNamespaces(client?: RedisCleanupClient): Promise<number> {
    if (!client) return 0;
    let removed = 0;
    for (const prefix of MARKET_CLEANUP_REDIS_PREFIXES) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', '100');
        cursor = nextCursor;
        if (keys.length === 0) continue;
        removed += client.unlink ? await client.unlink(...keys) : await client.del(...keys);
      } while (cursor !== '0');
    }
    return removed;
  }
}

export const formatMarketCleanupPreflight = (report: MarketCleanupPreflight) =>
  [
    `database=${report.databaseName}`,
    `current_user=${report.ownerName}`,
    `snapshotRoot=${report.snapshotRoot}`,
    `confirmation=${report.confirmation}`,
    'tables:',
    ...report.tableCounts.map((row) => `  ${row.table}: ${row.count}`),
    'redisPrefixes:',
    ...report.redisPrefixes.map((prefix) => `  ${prefix}*`),
    'irreversibleImpact:',
    ...report.irreversibleImpact.map((impact) => `  ${impact}`),
  ].join('\n');

export const marketCleanupSqlForTest = CLEANUP_SQL;
