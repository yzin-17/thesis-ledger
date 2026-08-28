import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const violations = [];

const serverLedgerPrefix = 'apps/server/src/ledger/';
const serverImportsPrefix = 'apps/server/src/imports/';

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
    if (file.startsWith(serverLedgerPrefix) && target.startsWith(serverImportsPrefix)) {
      violations.push(`${file} -> ${specifier} (ledger must not depend on imports adapter)`);
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
