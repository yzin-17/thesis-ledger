import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots = [resolve(root, 'apps/server/src/backtest'), resolve(root, 'packages/domain/src')];
const forbiddenImport =
  /(?:from|import\s*\()\s*['"][^'"]*(?:ledger-v2|trade-projection|\/ledger\/|\/portfolio\/|\/journal\/)[^'"]*['"]/u;
const forbiddenType = /\b(?:LedgerEventV2|TradeProjection|CASH_FLOW)\b/u;

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (
      ['.ts', '.tsx'].includes(extname(entry.name)) &&
      (directory.endsWith('/backtest') ||
        /^(?:backtest|simulation|nav-simulation|execution-rules|trading-calendar)/u.test(
          entry.name,
        ))
    ) {
      files.push(path);
    }
  }
  return files;
};

const violations = [];
let files = [];
for (const directory of roots) files = files.concat(await filesUnder(directory));
for (const path of files) {
  const source = await readFile(path, 'utf8');
  if (forbiddenImport.test(source))
    violations.push({ path, reason: 'forbidden real-account import' });
  if (forbiddenType.test(source))
    violations.push({ path, reason: 'forbidden real-account type/event' });
}
if (violations.length > 0) {
  console.error(JSON.stringify({ gate: 'backtest-v2-isolation', status: 'failed', violations }));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify({ gate: 'backtest-v2-isolation', status: 'passed', filesScanned: files.length }),
  );
}
