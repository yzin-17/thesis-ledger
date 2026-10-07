import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { discoverDatabaseStructure } from '../../src/platform/database-structure.js';

const container = process.env.C03_STRATEGY_TEST_CONTAINER;
const isolatedDescribe = container ? describe : describe.skip;
const expectedContainer = 'tl-c03-strategy-contract-20261001';

function execute(sql: string) {
  if (container !== expectedContainer) throw new Error('只允许独立 C03 测试容器');
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'c03_strategy_fixture',
      '-Atq',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
}

isolatedDescribe('隔离 PostgreSQL 策略合同显式声明', () => {
  beforeAll(async () => {
    expect(execute('SELECT current_database(), current_user')).toBe(
      'c03_strategy_fixture|postgres',
    );
    const input = await discoverDatabaseStructure();
    const migration = input.migrations.at(-1);
    expect(migration?.name).toBe('20261001120000_require_explicit_strategy_contract');
    execute(
      input.migrations
        .slice(0, -1)
        .map((item) => item.sql)
        .join('\n'),
    );
    execute(`INSERT INTO "Strategy" (id, name, "updatedAt") VALUES ('11111111-1111-4111-8111-111111111111', '历史策略', NOW());
      INSERT INTO "StrategyVersion" (id, "strategyId", version, schema) VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 1, '{"schemaVersion":"1"}');`);
    execute(migration?.sql ?? '');
  });

  it('移除两个默认值并原样保留旧记录', () => {
    expect(
      execute(
        `SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('Strategy', 'StrategyVersion') AND column_name='schemaVersion' AND column_default IS NULL`,
      ),
    ).toBe('2');
    expect(
      execute(
        `SELECT s."schemaVersion", v."schemaVersion", v.schema->>'schemaVersion' FROM "Strategy" s JOIN "StrategyVersion" v ON v."strategyId"=s.id`,
      ),
    ).toBe('1|1|1');
  });

  it('未声明版本的创建在写入前拒绝', () => {
    expect(() =>
      execute(
        `INSERT INTO "Strategy" (id, name, "updatedAt") VALUES (gen_random_uuid(), '缺少版本', NOW())`,
      ),
    ).toThrow();
    expect(() =>
      execute(
        `INSERT INTO "StrategyVersion" (id, "strategyId", version, schema) VALUES (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 2, '{}')`,
      ),
    ).toThrow();
    expect(execute('SELECT count(*) FROM "Strategy"')).toBe('1');
    expect(execute('SELECT count(*) FROM "StrategyVersion"')).toBe('1');
  });

  it('当前显式 AST2 可以创建策略与不可变版本', () => {
    execute(`INSERT INTO "Strategy" (id, name, "schemaVersion", "updatedAt") VALUES ('33333333-3333-4333-8333-333333333333', '当前策略', 2, NOW());
      INSERT INTO "StrategyVersion" (id, "strategyId", version, "schemaVersion", schema) VALUES (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', 1, 2, '{"schemaVersion":"2"}');`);
    expect(
      execute(
        `SELECT s."schemaVersion", v."schemaVersion" FROM "Strategy" s JOIN "StrategyVersion" v ON v."strategyId"=s.id WHERE s.id='33333333-3333-4333-8333-333333333333'`,
      ),
    ).toBe('2|2');
  });
});
