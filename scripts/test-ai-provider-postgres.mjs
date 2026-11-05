import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const container = `ledger-ai-provider-test-${randomUUID().slice(0, 8)}`;
const database = 'ai_provider_concurrency_fixture';
const owner = 'fixture_owner';
const testTimeoutMs = Number(process.env.AI_PROVIDER_TEST_TIMEOUT_MS ?? 120_000);
if (!Number.isSafeInteger(testTimeoutMs) || testTimeoutMs < 120_000 || testTimeoutMs > 900_000)
  throw new Error(
    'AI_PROVIDER_TEST_TIMEOUT_MS 必须是 120000～900000 的整数，仅控制隔离测试进程等待',
  );
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`,
    );
  return result.stdout.trim();
};
let started = false;
try {
  const requestedTests = process.argv.slice(2);
  const tests = requestedTests.length
    ? requestedTests
    : [
        'test/ai/ai-provider-pricing-migration-postgres.integration.test.ts',
        'test/ai/ai-provider-history-preservation-postgres.integration.test.ts',
        'test/ai/ai-provider-save-postgres.integration.test.ts',
        'test/ai/ai-provider-default-postgres.integration.test.ts',
        'test/ai/ai-research-submission-postgres.integration.test.ts',
        'test/ai/ai-research-process-recovery.integration.test.ts',
        'test/ai/research-submission-v2-postgres.integration.test.ts',
        'test/ai/research-execution-v2-postgres.integration.test.ts',
        'test/ai/research-execution-v2-lifecycle-postgres.integration.test.ts',
        'test/research/submission-http-postgres.integration.test.ts',
        'test/research/private-scopes-http-postgres.integration.test.ts',
        'test/research/fund-submission-http-postgres.integration.test.ts',
        'test/research/reports-http-postgres.integration.test.ts',
        'test/research/legacy-reports-http-postgres.integration.test.ts',
      ];
  const verifyResearchUpgrade = tests.some((test) =>
    test.endsWith('/research-submission-v2-postgres.integration.test.ts'),
  );
  const verifyObservationUpgrade = tests.some((test) =>
    test.endsWith('/observation-store-postgres.integration.test.ts'),
  );
  const dsaIntegration = tests.includes('test/research/dsa-g1-http-postgres.integration.test.ts');
  if (
    dsaIntegration &&
    !existsSync(new URL('../../daily-stock-analysis/.venv/bin/python', import.meta.url))
  )
    throw new Error('G1 需要相邻 DSA 工作区及其 Python 环境，尚未创建隔离数据库');
  if (
    tests.length === 0 ||
    tests.some((test) => test.endsWith('ai-research-process-recovery.integration.test.ts'))
  ) {
    run('pnpm', ['--filter', '@thesis-ledger/server...', 'build'], { timeout: 120_000 });
    console.log('已构建当前 Server 与依赖，独立恢复进程使用本次产物');
  }
  run('docker', [
    'run',
    '--pull',
    'never',
    '-d',
    '--name',
    container,
    '--tmpfs',
    '/var/lib/postgresql/data',
    '-p',
    '127.0.0.1::5432',
    '-e',
    `POSTGRES_USER=${owner}`,
    '-e',
    'POSTGRES_PASSWORD=isolated_fixture',
    '-e',
    `POSTGRES_DB=${database}`,
    'postgres:17-alpine',
  ]);
  started = true;
  for (let attempt = 0; ; attempt++) {
    const ready = spawnSync('docker', [
      'exec',
      container,
      'pg_isready',
      '-h',
      '127.0.0.1',
      '-U',
      owner,
      '-d',
      database,
    ]);
    if (ready.status === 0) break;
    if (attempt >= 40) throw new Error('隔离 PostgreSQL 未就绪');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const sql = (input) =>
    run(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-XqAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        owner,
        '-d',
        database,
        '-f',
        '-',
      ],
      { input },
    );
  const identity = sql('SELECT current_database(), current_user;');
  if (identity !== `${database}|${owner}`) throw new Error('隔离数据库身份不符');
  const migrationRoot = `${root}apps/server/prisma/migrations`;
  const migrations = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations) {
    // 在扩展前写入真实 V1 行，逐字段核对保留升级；不接触业务数据库。
    let retained;
    let observationRetained;
    const retainedId = randomUUID();
    if (verifyObservationUpgrade && migration === '20261019020000_research_observation_versions') {
      sql(`INSERT INTO "AiRun" ("id", "provider", "model", "promptVersion", "status", "question", "result", "createdAt", "updatedAt")
        VALUES ('${retainedId}', 'controlled-observation-upgrade', 'controlled-model', 'research-v1', 'succeeded', '观察升级保留报告', '{"version":1,"conclusion":"原报告保持原样"}'::jsonb, '2026-10-18T08:00:00Z', '2026-10-18T08:00:00Z');
        INSERT INTO "JournalEntry" ("id", "reason", "content", "tags", "createdAt", "updatedAt")
        VALUES ('${retainedId}', '观察升级保留交易笔记', '原 Journal 内容', '["controlled-upgrade"]'::jsonb, '2026-10-18T08:00:00Z', '2026-10-18T08:00:00Z');`);
      observationRetained = sql(`SELECT jsonb_build_object(
        'report', (SELECT to_jsonb(r) FROM "AiRun" r WHERE id = '${retainedId}'),
        'journal', (SELECT to_jsonb(j) FROM "JournalEntry" j WHERE id = '${retainedId}'));`);
    }
    if (verifyResearchUpgrade && migration === '20261019010000_research_submission_v2') {
      const result = JSON.stringify({
        version: 1,
        provider: 'controlled-upgrade',
        conclusion: '保留的 V1 合成报告',
        evidence: [],
        risks: [],
        unknowns: ['历史模式未记录'],
        disclaimer: '隔离升级样例',
        signals: [],
        createdAt: '2026-10-18T08:00:00Z',
      });
      sql(`INSERT INTO "AiRun" ("id", "provider", "model", "promptVersion", "status", "question", "result", "context", "modelMetadata", "inputTokens", "outputTokens", "cost", "createdAt", "updatedAt")
        VALUES ('${retainedId}', 'controlled-upgrade', 'controlled-model', 'research-v1', 'succeeded', '保留升级样例', '${result}'::jsonb, '{"scope":"portfolio"}'::jsonb, '{"templateId":"primary-risks"}'::jsonb, 17, 9, 0.00123456, '2026-10-18T08:00:00Z', '2026-10-18T08:00:00Z');`);
      retained = JSON.parse(sql(`SELECT to_jsonb(r) FROM "AiRun" r WHERE id = '${retainedId}';`));
    }
    sql(readFileSync(`${migrationRoot}/${migration}/migration.sql`, 'utf8'));
    if (observationRetained) {
      const after = sql(`SELECT jsonb_build_object(
        'report', (SELECT to_jsonb(r) FROM "AiRun" r WHERE id = '${retainedId}'),
        'journal', (SELECT to_jsonb(j) FROM "JournalEntry" j WHERE id = '${retainedId}'));`);
      if (!isDeepStrictEqual(JSON.parse(observationRetained), JSON.parse(after)))
        throw new Error('观察存储升级改变了原报告或 Journal 记录');
      console.log('观察存储保留升级：原报告及 Journal 逐字段一致');
    }
    if (retained) {
      const after = JSON.parse(
        sql(`SELECT to_jsonb(r) FROM "AiRun" r WHERE id = '${retainedId}';`),
      );
      for (const key of [
        'researchOwnerId',
        'researchSubmissionId',
        'researchInputDigest',
        'researchScopeSnapshot',
      ]) {
        if (after[key] !== null) throw new Error(`V1 升级不应回填 ${key}`);
        delete after[key];
      }
      if (!isDeepStrictEqual(retained, after)) throw new Error('保留升级改变了原 V1 记录');
      const { researchResultSchema } = await import('../packages/schemas/dist/index.js');
      researchResultSchema.parse(after.result);
      console.log('V1 记录保留升级逐字段及既有结果解析通过，新增字段保持空值');
    }
  }
  if (sql('SELECT version FROM "SchemaVersion" WHERE id=1;') !== migrations.at(-1))
    throw new Error('隔离数据库结构 head 与实际 migration 输入不一致');
  const port = run('docker', ['port', container, '5432/tcp']).split(':').at(-1);
  const url = `postgresql://${owner}:isolated_fixture@127.0.0.1:${port}/${database}`;
  console.log(JSON.stringify({ database, owner, migrations: migrations.length, isolated: true }));
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@thesis-ledger/server',
      'exec',
      'vitest',
      'run',
      '--no-file-parallelism',
      ...tests,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: testTimeoutMs,
      env: {
        ...process.env,
        DATABASE_URL: url,
        AI_PROVIDER_DATABASE_URL: url,
        AI_EXECUTION_DATABASE_URL: url,
        RESEARCH_DSA_INTEGRATION_TEST: dsaIntegration ? '1' : '0',
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (started) run('docker', ['rm', '-f', container]);
}
