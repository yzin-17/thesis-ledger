import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const databaseName = `investment_os_restore_${Date.now()}`;
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
    'investment_os',
    '-d',
    'investment_os',
    '--format=custom',
    '--no-owner',
  ]);
  writeFileSync(dumpPath, dump);
  const checksum = createHash('sha256').update(dump).digest('hex');

  compose(['exec', '-T', 'postgres', 'createdb', '-U', 'investment_os', databaseName]);
  databaseCreated = true;
  compose(
    [
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '-U',
      'investment_os',
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
      'investment_os',
      '-d',
      databaseName,
      '-tAc',
      `select json_build_object(
        'accounts', (select count(*) from "Account"),
        'ledgerEvents', (select count(*) from "LedgerEvent"),
        'snapshots', (select count(*) from "PortfolioSnapshot"),
        'migrations', (select count(*) from "_prisma_migrations")
      )`,
    ]),
  );
  const restored = JSON.parse(counts);
  if (restored.migrations !== 15) throw new Error(`恢复库迁移数量异常: ${counts}`);

  console.log(
    JSON.stringify(
      {
        source: 'investment_os',
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
      compose(['exec', '-T', 'postgres', 'dropdb', '-U', 'investment_os', databaseName]);
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
