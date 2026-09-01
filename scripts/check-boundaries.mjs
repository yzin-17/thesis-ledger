import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const violations = [];

const serverLedgerPrefix = 'apps/server/src/ledger/';
const serverImportsPrefix = 'apps/server/src/imports/';
const serverProvidersPrefix = 'apps/server/src/providers/';
const forbiddenServerFeatureDependencies = [
  [serverLedgerPrefix, serverImportsPrefix, 'ledger must not depend on imports adapter'],
  [
    serverProvidersPrefix,
    'apps/server/src/notifications/',
    'providers must not own or import notification feature',
  ],
  [serverLedgerPrefix, 'apps/server/src/cash-plans/', 'ledger must not depend on cash plans'],
  [
    'apps/server/src/cash-plans/',
    'apps/server/src/automation/',
    'cash plans must not depend on automation orchestration',
  ],
  [
    'apps/server/src/notifications/',
    'apps/server/src/risk/',
    'notification outbox must not depend on risk callers',
  ],
  [
    'apps/server/src/notifications/',
    'apps/server/src/cash-plans/',
    'notification outbox must not depend on cash plan callers',
  ],
];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (['.ts', '.tsx'].includes(extname(entry.name))) await inspect(path);
  }
}

async function inspect(path) {
  const source = await readFile(path, 'utf8');
  const imports = [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  const file = relative(root, path).replaceAll('\\', '/');
  for (const specifier of imports) {
    if (!specifier.startsWith('.')) continue;
    const target = relative(root, resolve(dirname(path), specifier)).replaceAll('\\', '/');
    if (
      file.startsWith('packages/') &&
      (target.startsWith('apps/') || target.startsWith('services/'))
    ) {
      violations.push(`${file} -> ${specifier}`);
    }
    const sourceApp = file.match(/^apps\/([^/]+)/)?.[1];
    const targetApp = target.match(/^apps\/([^/]+)/)?.[1];
    if (sourceApp && targetApp && sourceApp !== targetApp) {
      violations.push(`${file} -> ${specifier}`);
    }
    if (file.startsWith('apps/') && target.startsWith('services/')) {
      violations.push(`${file} -> ${specifier}`);
    }
    for (const [sourcePrefix, targetPrefix, reason] of forbiddenServerFeatureDependencies) {
      if (file.startsWith(sourcePrefix) && target.startsWith(targetPrefix)) {
        violations.push(`${file} -> ${specifier} (${reason})`);
      }
    }
  }
}

await walk(join(root, 'apps'));
await walk(join(root, 'packages'));
await walk(join(root, 'services'));
if (violations.length > 0) {
  console.error(`发现跨层非法导入:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Import boundaries: OK');
}
