import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { DatabaseExecutionTarget } from './database-structure.js';

const run = promisify(execFile);
const descriptorSchema = z.array(
  z.strictObject({
    table: z.string().min(1),
    columns: z.array(z.string().min(1)).min(1),
  }),
);
type Descriptor = z.infer<typeof descriptorSchema>;
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** 迁移前内容留在只读归档；摘要仍以升级前表名对账。 */
const archivesByMigration: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '20260929114800_drop_market_bar_series_v2': {
    MarketBarSeriesCoverage: 'MarketBarSeriesCoverageArchive',
    MarketBarSeriesFact: 'MarketBarSeriesFactArchive',
  },
  '20260930100000_rebase_legacy_market_policy': {
    DesiredProviderPolicy: 'DesiredProviderPolicyLegacyArchive',
    DesiredProviderPolicyRevision: 'DesiredProviderPolicyRevisionLegacyArchive',
  },
};

/** 仅本次实际执行归档迁移时，旧表摘要才转向对应归档。 */
export function upgradeArchiveNamesFor(pendingMigrations: ReadonlyArray<{ name: string }>) {
  const renamedTables: Record<string, string> = {};
  for (const migration of pendingMigrations) {
    Object.assign(renamedTables, archivesByMigration[migration.name]);
  }
  return renamedTables;
}

export type UpgradeDataWitness = {
  tables: Array<Descriptor[number] & { sha256: string; rows: number }>;
};

/** 在无业务写入的隔离副本上调用；仅返回摘要，不输出业务记录。SchemaVersion 单独核验。 */
export async function captureUpgradeDataWitness(
  container: string,
  target: DatabaseExecutionTarget,
  baseline?: UpgradeDataWitness,
  renamedTables: Readonly<Record<string, string>> = {},
): Promise<UpgradeDataWitness> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('数据校验容器无效');
  const args = [
    'exec',
    '-i',
    container,
    'psql',
    '-U',
    target.ownerName,
    '-d',
    target.databaseName,
    '-Atq',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  let descriptors: Descriptor;
  if (baseline)
    descriptors = descriptorSchema.parse(
      baseline.tables.map(({ table, columns }) => ({ table, columns })),
    );
  else {
    const schema = await run(
      'docker',
      [
        ...args,
        '-c',
        `SELECT COALESCE(json_agg(t ORDER BY t.table), '[]') FROM
      (SELECT c.relname AS table, array_agg(a.attname ORDER BY a.attnum) AS columns
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
       WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname <> 'SchemaVersion'
       AND a.attnum > 0 AND NOT a.attisdropped GROUP BY c.relname) t;`,
      ],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    descriptors = descriptorSchema.parse(JSON.parse(schema.stdout));
  }
  const tables: UpgradeDataWitness['tables'] = [];
  for (const descriptor of descriptors) {
    const physicalTable = renamedTables[descriptor.table] ?? descriptor.table;
    const sql = `SET TIME ZONE 'UTC'; COPY (SELECT encode(sha256(convert_to(to_jsonb(ROW(
      ${descriptor.columns.map(identifier).join(', ')}))::text, 'UTF8')), 'hex')
      FROM public.${identifier(physicalTable)} ORDER BY 1) TO STDOUT;`;
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'ignore'] });
    const digest = createHash('sha256');
    let rows = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      digest.update(chunk);
      for (const byte of chunk) if (byte === 10) rows += 1;
    });
    const completed = new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.stdin.once('error', reject);
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error('数据摘要查询失败')),
      );
    });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000);
    try {
      child.stdin.end(sql);
      await completed;
      tables.push({ ...descriptor, sha256: digest.digest('hex'), rows });
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
  return { tables };
}

export function assertUpgradeDataPreserved(before: UpgradeDataWitness, after: UpgradeDataWitness) {
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('数据库升级改变或丢失了既有列数据');
}
