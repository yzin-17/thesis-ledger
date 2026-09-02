import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const databaseName = `thesis_ledger_restore_${Date.now()}`;
const dumpPath = resolve('/private/tmp', `${databaseName}.dump`);
let databaseCreated = false;

const compose = (args, options = {}) =>
  execFileSync('docker', ['compose', ...args], {
    cwd: root,
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });

const text = (value) => value.toString('utf8').trim();

try {
  const dump = compose([
    'exec',
    '-T',
    'postgres',
    'pg_dump',
    '-U',
    'thesis_ledger',
    '-d',
    'thesis_ledger',
    '--format=custom',
    '--no-owner',
  ]);
  writeFileSync(dumpPath, dump);
  const checksum = createHash('sha256').update(dump).digest('hex');

  compose(['exec', '-T', 'postgres', 'createdb', '-U', 'thesis_ledger', databaseName]);
  databaseCreated = true;
  compose(
    [
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '-U',
      'thesis_ledger',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--dbname',
      databaseName,
    ],
    { input: dump },
  );

  const counts = text(
    compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'thesis_ledger',
      '-d',
      databaseName,
      '-tAc',
      `select json_build_object(
        'accounts', (select count(*) from "Account"),
        'ledgerEvents', (select count(*) from "LedgerEvent"),
        'snapshots', (select count(*) from "PortfolioSnapshot"),
        'schemaVersion', (select "version" from "SchemaVersion" where "id" = 1)
      )`,
    ]),
  );
  const restored = JSON.parse(counts);
  if (restored.schemaVersion !== '20260902000000_fresh_database_baseline')
    throw new Error(`恢复库 Schema marker 异常: ${counts}`);

  console.log(
    JSON.stringify(
      {
        source: 'thesis_ledger',
        restoredDatabase: databaseName,
        backupFormat: 'custom',
        checksum,
        restored,
        verified: true,
      },
      null,
      2,
    ),
  );
} finally {
  if (databaseCreated) {
    try {
      compose(['exec', '-T', 'postgres', 'dropdb', '-U', 'thesis_ledger', databaseName]);
    } catch {
      // Keep the original recovery error visible; cleanup is best effort.
    }
  }
  try {
    unlinkSync(dumpPath);
  } catch {
    // The dump may not have been written if pg_dump failed.
  }
}
