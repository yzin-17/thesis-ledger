import { execFileSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const infraRoot = process.env.THESIS_LEDGER_INFRA_ROOT
  ? resolve(process.env.THESIS_LEDGER_INFRA_ROOT)
  : resolve(root, '../thesis-ledger-infra');
const migrationsRoot = resolve(root, 'apps/server/prisma/migrations');
const targetMigration = '20260826050000_migrate_legacy_ledger_v2';
const envFileFromInput = process.env.THESIS_LEDGER_INFRA_ENV_FILE;
const defaultEnvFile = resolve(infraRoot, '.env');
const envFile = envFileFromInput
  ? resolve(infraRoot, envFileFromInput)
  : await access(defaultEnvFile)
      .then(() => defaultEnvFile)
      .catch(() => resolve(infraRoot, '.env.example'));

const parseEnvFile = (contents) =>
  Object.fromEntries(
    contents
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator < 0) return [line, ''];
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).replace(/^(['"])(.*)\1$/u, '$2');
        return [key, value];
      }),
  );

const fileEnv = parseEnvFile(await readFile(envFile, 'utf8'));
const ownerUser = process.env.POSTGRES_OWNER_USER ?? fileEnv.POSTGRES_OWNER_USER ?? 'thesis_ledger';
const composeArgs = [
  'compose',
  '--project-name',
  'thesis-ledger-dev',
  '--env-file',
  envFile,
  '-f',
  resolve(infraRoot, 'compose.yml'),
  '-f',
  resolve(infraRoot, 'compose.dev.yml'),
];

const compose = (args, input) =>
  execFileSync('docker', [...composeArgs, ...args], {
    cwd: infraRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 50 * 1024 * 1024,
  }).trim();

const psql = (databaseName, sql) =>
  compose(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      ownerUser,
      '-d',
      databaseName,
    ],
    sql,
  );

const query = (databaseName, sql) =>
  compose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    ownerUser,
    '-d',
    databaseName,
    '-tAc',
    sql,
  ]);

const migrationNames = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const targetIndex = migrationNames.indexOf(targetMigration);
if (targetIndex < 0) throw new Error(`找不到目标迁移: ${targetMigration}`);

const preTargetSql = (
  await Promise.all(
    migrationNames
      .slice(0, targetIndex)
      .map(async (name) => readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8')),
  )
).join('\n');
const targetSql = await readFile(resolve(migrationsRoot, targetMigration, 'migration.sql'), 'utf8');
const postTargetMigrationNames = [
  '20260826060000_baseline_import_draft',
  '20260826070000_allow_unknown_ledger_time',
  '20260826080000_remove_legacy_correction_of',
  '20260826090000_store_projection_generation',
  '20260827010000_repair_baseline_observation_batch_refs',
  '20260827020000_import_draft_content_fingerprint',
  '20260827030000_persist_ledger_source_row_id',
  '20260827040000_materialize_core_projections',
  '20260828010000_journal_trade_projection',
  '20260828020000_harden_v2_projection_schema',
];
const postTargetSql = (
  await Promise.all(
    postTargetMigrationNames.map(async (name) => {
      if (!migrationNames.includes(name)) throw new Error(`找不到目标迁移后的迁移: ${name}`);
      return readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8');
    }),
  )
).join('\n');

const runSql = (databaseName, sql) => psql(databaseName, sql);
const createDatabase = (databaseName) =>
  compose(['exec', '-T', 'postgres', 'createdb', '-U', ownerUser, databaseName]);
const dropDatabase = (databaseName) =>
  compose(['exec', '-T', 'postgres', 'dropdb', '--if-exists', '-U', ownerUser, databaseName]);

const canonicalDecimal = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value);
  const [integerPart, fractionPart = ''] = text.split('.');
  const fraction = fractionPart.replace(/0+$/u, '');
  return fraction ? `${integerPart}.${fraction}` : integerPart;
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const runValidScenario = async () => {
  const databaseName = `thesis_ledger_legacy_fee_${Date.now()}`;
  let created = false;
  try {
    createDatabase(databaseName);
    created = true;
    runSql(databaseName, preTargetSql);
    runSql(
      databaseName,
      await readFile(
        resolve(root, 'apps/server/test/ledger/legacy-ledger-migration-fees.sql'),
        'utf8',
      ),
    );
    runSql(databaseName, targetSql);
    const result = JSON.parse(
      query(
        databaseName,
        `SELECT json_build_object(
          'events', (SELECT count(*) FROM "LedgerEvent"),
          'v2Events', (SELECT count(*) FROM "LedgerEvent" WHERE "type" IN ('BUY_EXECUTION', 'SELL_EXECUTION')),
          'strategyRows', (SELECT count(*) FROM "AccountCostStrategyVersion"),
          'charges', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object('externalId', "externalId", 'charges', "payload"->'charges')
              ORDER BY "externalId"
            )
            FROM "LedgerEvent"
            WHERE "type" IN ('BUY_EXECUTION', 'SELL_EXECUTION')
          ), '[]'::jsonb)
        )`,
      ),
    );
    assert(Number(result.events) === 4, `合法费用迁移事件数量异常: ${result.events}`);
    assert(Number(result.v2Events) === 4, `合法费用迁移 V2 事件数量异常: ${result.v2Events}`);
    assert(Number(result.strategyRows) === 1, `合法费用迁移策略数量异常: ${result.strategyRows}`);

    const chargesByExternalId = new Map(
      result.charges.map((event) => [event.externalId, event.charges ?? []]),
    );
    const expectedCharges = new Map([
      ['legacy-fee-01', [['COMMISSION', '1.25']]],
      ['legacy-fee-02', [['TAX', '0.75']]],
      [
        'legacy-fee-03',
        [
          ['COMMISSION', '1.5'],
          ['TAX', '0.25'],
        ],
      ],
      ['legacy-fee-04', []],
    ]);
    for (const [externalId, expected] of expectedCharges) {
      const actual = chargesByExternalId.get(externalId);
      assert(actual, `缺少迁移后的费用事件: ${externalId}`);
      assert(actual.length === expected.length, `费用明细数量异常: ${externalId}`);
      for (let index = 0; index < expected.length; index += 1) {
        const [category, amount] = expected[index];
        assert(actual[index].category === category, `费用类别异常: ${externalId}`);
        assert(
          canonicalDecimal(actual[index].amount) === amount,
          `费用金额异常: ${externalId}=${actual[index].amount}`,
        );
      }
    }
    return { databaseName, events: result.events, charges: result.charges };
  } finally {
    if (created) dropDatabase(databaseName);
  }
};

const runFullFixtureScenario = async () => {
  const databaseName = `thesis_ledger_legacy_full_${Date.now()}`;
  let created = false;
  try {
    createDatabase(databaseName);
    created = true;
    runSql(databaseName, preTargetSql);
    runSql(
      databaseName,
      await readFile(
        resolve(root, 'apps/server/test/ledger/legacy-ledger-migration-fixture.sql'),
        'utf8',
      ),
    );
    runSql(
      databaseName,
      await readFile(
        resolve(root, 'apps/server/test/ledger/legacy-ledger-migration-position-snapshot.sql'),
        'utf8',
      ),
    );

    const before = JSON.parse(
      query(
        databaseName,
        `SELECT json_build_object(
          'events', (SELECT count(*) FROM "LedgerEvent"),
          'positions', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'symbol', "symbol",
                'quantity', "quantity"::text,
                'costPrice', "costPrice"::text,
                'source', "source"
              ) ORDER BY "symbol"
            )
            FROM "Position"
            WHERE "accountId" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ), '[]'::jsonb)
        )`,
      ),
    );
    assert(Number(before.events) === 17, `全类型 fixture 迁移前事件数量异常: ${before.events}`);

    runSql(databaseName, targetSql);
    runSql(databaseName, postTargetSql);

    const after = JSON.parse(
      query(
        databaseName,
        `SELECT json_build_object(
          'events', (SELECT count(*) FROM "LedgerEvent"),
          'legacyEvents', (SELECT count(*) FROM "LedgerEvent" WHERE "type" IN ('BUY', 'SELL')),
          'v2Events', (SELECT count(*) FROM "LedgerEvent" WHERE "factId" IS NOT NULL),
          'factless', (SELECT count(*) FROM "LedgerEvent" WHERE "factId" IS NULL),
          'missingSourceFields', (
            SELECT count(*) FROM "LedgerEvent"
            WHERE "sourceCategory" IS NULL OR "sourceChannel" IS NULL
          ),
          'missingPayloadFields', (
            SELECT count(*) FROM "LedgerEvent"
            WHERE "ledgerRevision" IS NULL
              OR "economicOrderKey" IS NULL
              OR "payloadVersion" IS NULL
              OR "payload" IS NULL
          ),
          'sourceCategoryCounts', COALESCE((
            SELECT jsonb_object_agg("sourceCategory", "count")
            FROM (
              SELECT "sourceCategory", count(*) AS "count"
              FROM "LedgerEvent"
              GROUP BY "sourceCategory"
              ORDER BY "sourceCategory"
            ) AS categories
          ), '{}'::jsonb),
          'cashFlows', (SELECT count(*) FROM "LedgerEvent" WHERE "type" = 'CASH_FLOW'),
          'cashInflows', (
            SELECT count(*) FROM "LedgerEvent"
            WHERE "type" = 'CASH_FLOW' AND "payload"->>'direction' = 'INFLOW'
          ),
          'cashOutflows', (
            SELECT count(*) FROM "LedgerEvent"
            WHERE "type" = 'CASH_FLOW' AND "payload"->>'direction' = 'OUTFLOW'
          ),
          'cashCategories', COALESCE((
            SELECT jsonb_agg("category" ORDER BY "category")
            FROM (
              SELECT DISTINCT "payload"->>'category' AS "category"
              FROM "LedgerEvent"
              WHERE "type" = 'CASH_FLOW'
            ) AS categories
          ), '[]'::jsonb),
          'positionBaselines', (
            SELECT count(*) FROM "LedgerEvent"
            WHERE "type" = 'POSITION_BASELINE_OBSERVATION'
          ),
          'cashBaselines', (
            SELECT count(*) FROM "LedgerEvent"
            WHERE "type" = 'CASH_BALANCE_OBSERVATION'
          ),
          'cashBaselineBatchRefs', (
            SELECT count(*) FROM "LedgerEvent"
            WHERE "type" = 'CASH_BALANCE_OBSERVATION'
              AND "payload" ? 'batchId'
          ),
          'strategyRows', (SELECT count(*) FROM "AccountCostStrategyVersion"),
          'strategy', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'revision', "revision",
                'method', "method",
                'effectiveAt', "effectiveAt",
                'reason', "reason",
                'actorId', "actorId"
              ) ORDER BY "revision"
            )
            FROM "AccountCostStrategyVersion"
            WHERE "accountId" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ), '[]'::jsonb),
          'earliestOccurredAt', (SELECT min("occurredAt") FROM "LedgerEvent"),
          'accountLedgerRevision', (
            SELECT "ledgerRevision" FROM "AccountLedgerState"
            WHERE "accountId" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ),
          'correctionOfColumnExists', EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'LedgerEvent'
              AND column_name = 'correctionOf'
          ),
          'legacyLedgerColumnsRemaining', (
            SELECT count(*)
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'LedgerEvent'
              AND column_name IN (
                'symbol', 'quantity', 'price', 'amount', 'fee', 'tax',
                'source', 'currency', 'note', 'metadata'
              )
          ),
          'positions', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'symbol', "symbol",
                'quantity', "quantity"::text,
                'costPrice', "costPrice"::text,
                'source', "source"
              ) ORDER BY "symbol"
            )
            FROM "Position"
            WHERE "accountId" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          ), '[]'::jsonb)
        )`,
      ),
    );
    assert(Number(after.events) === Number(before.events), '全类型 fixture 迁移前后事件数量不一致');
    assert(Number(after.legacyEvents) === 0, `迁移后仍存在旧事件类型: ${after.legacyEvents}`);
    assert(Number(after.v2Events) === 17, `全类型 fixture V2 事件数量异常: ${after.v2Events}`);
    assert(Number(after.factless) === 0, `全类型 fixture 存在无 factId 事件: ${after.factless}`);
    assert(
      Number(after.missingSourceFields) === 0,
      `全类型 fixture 存在缺失来源字段: ${after.missingSourceFields}`,
    );
    assert(
      Number(after.missingPayloadFields) === 0,
      `全类型 fixture 存在缺失 V2 审计字段: ${after.missingPayloadFields}`,
    );
    const expectedSourceCategoryCounts = { IMPORT: 1, INTEGRATION: 3, MANUAL: 13 };
    assert(
      Object.keys(after.sourceCategoryCounts).length ===
        Object.keys(expectedSourceCategoryCounts).length &&
        Object.entries(expectedSourceCategoryCounts).every(
          ([category, count]) => Number(after.sourceCategoryCounts[category]) === count,
        ),
      `来源类别映射异常: ${JSON.stringify(after.sourceCategoryCounts)}`,
    );
    assert(Number(after.cashFlows) === 7, `CASH_FLOW 数量异常: ${after.cashFlows}`);
    assert(Number(after.cashInflows) === 3, `CASH_FLOW 流入数量异常: ${after.cashInflows}`);
    assert(Number(after.cashOutflows) === 4, `CASH_FLOW 流出数量异常: ${after.cashOutflows}`);
    assert(
      JSON.stringify(after.cashCategories) ===
        JSON.stringify(['DEPOSIT', 'FEE', 'INTEREST', 'TAX', 'TRANSFER', 'WITHDRAWAL']),
      `现金类别映射异常: ${JSON.stringify(after.cashCategories)}`,
    );
    assert(
      Number(after.positionBaselines) === 3,
      `持仓基线事件数量异常: ${after.positionBaselines}`,
    );
    assert(Number(after.cashBaselines) === 1, `现金基线事件数量异常: ${after.cashBaselines}`);
    assert(
      Number(after.cashBaselineBatchRefs) === 0,
      `现金基线事件不应引用 BaselineObservationBatch: ${after.cashBaselineBatchRefs}`,
    );
    assert(Number(after.strategyRows) === 1, `成本策略数量异常: ${after.strategyRows}`);
    assert(after.strategy.length === 1, '成本策略记录缺失');
    assert(after.strategy[0].revision === 1, '成本策略版本号异常');
    assert(after.strategy[0].method === 'AVG', '成本策略方法异常');
    assert(after.strategy[0].actorId === 'migration:legacy-ledger-v2', '成本策略来源异常');
    assert(after.strategy[0].effectiveAt === after.earliestOccurredAt, '成本策略生效时间异常');
    assert(Number(after.accountLedgerRevision) === 17, '账户账本 Revision 回填异常');
    assert(after.correctionOfColumnExists === false, '旧 correctionOf 未在收缩迁移中删除');
    assert(
      Number(after.legacyLedgerColumnsRemaining) === 0,
      `旧 LedgerEvent 宽表字段仍存在: ${after.legacyLedgerColumnsRemaining}`,
    );
    assert(
      JSON.stringify(
        after.positions.map((position) => ({
          ...position,
          quantity: canonicalDecimal(position.quantity),
          costPrice: canonicalDecimal(position.costPrice),
        })),
      ) ===
        JSON.stringify(
          before.positions.map((position) => ({
            ...position,
            quantity: canonicalDecimal(position.quantity),
            costPrice: canonicalDecimal(position.costPrice),
          })),
        ),
      `Position 迁移前后不一致: before=${JSON.stringify(before.positions)} after=${JSON.stringify(after.positions)}`,
    );

    return { databaseName, before, after };
  } finally {
    if (created) dropDatabase(databaseName);
  }
};

const runFailureScenario = async (fixtureName, expectedMessage, expectedState) => {
  const databaseName = `thesis_ledger_legacy_fee_failure_${Date.now()}`;
  let created = false;
  try {
    createDatabase(databaseName);
    created = true;
    runSql(databaseName, preTargetSql);
    runSql(
      databaseName,
      await readFile(resolve(root, 'apps/server/test/ledger', fixtureName), 'utf8'),
    );

    let errorText = '';
    try {
      runSql(databaseName, targetSql);
    } catch (error) {
      errorText = [error.message, error.stdout, error.stderr]
        .filter(Boolean)
        .map((value) => value.toString())
        .join('\n');
    }
    assert(errorText.includes(expectedMessage), `迁移失败原因不符合预期: ${errorText}`);
    const state = JSON.parse(
      query(
        databaseName,
        `SELECT json_build_object(
          'events', (SELECT count(*) FROM "LedgerEvent"),
          'legacyEvents', (SELECT count(*) FROM "LedgerEvent" WHERE "type" IN ('BUY', 'SELL')),
          'v2Events', (SELECT count(*) FROM "LedgerEvent" WHERE "type" IN ('BUY_EXECUTION', 'SELL_EXECUTION')),
          'factless', (SELECT count(*) FROM "LedgerEvent" WHERE "factId" IS NULL),
          'strategyTableExists', to_regclass('public."AccountCostStrategyVersion"') IS NOT NULL
        )`,
      ),
    );
    for (const [key, value] of Object.entries(expectedState)) {
      assert(
        JSON.stringify(state[key]) === JSON.stringify(value),
        `失败事务回滚断言异常: ${key}=${state[key]}`,
      );
    }
    return { databaseName, error: expectedMessage, state };
  } finally {
    if (created) dropDatabase(databaseName);
  }
};

const valid = await runValidScenario();
const fullFixture = await runFullFixtureScenario();
const invalidFees = await runFailureScenario(
  'legacy-ledger-migration-invalid-fees.sql',
  'Legacy BUY/SELL contains a missing, negative, or non-finite fee/tax value',
  { events: 8, legacyEvents: 8, v2Events: 0, factless: 8, strategyTableExists: false },
);
const unknownType = await runFailureScenario(
  'legacy-ledger-migration-unknown.sql',
  'Legacy LedgerEvent contains an unknown type; migration is blocked',
  { events: 1, legacyEvents: 0, v2Events: 0, factless: 1, strategyTableExists: false },
);

console.log(
  JSON.stringify(
    {
      verified: true,
      valid: { events: valid.events, chargeEvents: valid.charges.length },
      fullFixture: {
        eventsBefore: fullFixture.before.events,
        eventsAfter: fullFixture.after.events,
        positions: fullFixture.after.positions.length,
        cashFlows: fullFixture.after.cashFlows,
        cashBaselineBatchRefs: fullFixture.after.cashBaselineBatchRefs,
        legacyLedgerColumnsRemaining: fullFixture.after.legacyLedgerColumnsRemaining,
        strategyRows: fullFixture.after.strategyRows,
        correctionOfColumnExists: fullFixture.after.correctionOfColumnExists,
      },
      invalidFees: invalidFees.state,
      unknownType: unknownType.state,
    },
    null,
    2,
  ),
);
