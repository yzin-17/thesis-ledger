import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist', '.git'].includes(entry.name)) {
      files.push(...(await filesUnder(path)));
    } else if (entry.isFile() && ['.ts', '.tsx', '.mjs'].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
};

const main = async () => {
  const sourceFiles = await filesUnder(resolve(root, 'apps/server/src/backtest'));
  const sourceMatches = [];
  for (const path of sourceFiles) {
    const source = await readFile(path, 'utf8');
    const matches =
      source.match(
        /\b(?:BacktestJob|backtest-v1|mode:\s*['"]V1['"]|schemaVersion\s*[:=]\s*1)\b/gu,
      ) ?? [];
    if (matches.length > 0) sourceMatches.push({ path, references: matches.length });
  }
  const inventory = {
    model: 'BacktestJob',
    v1ModeDefault: 'V1',
    sourceReferences: sourceMatches,
    database: { status: 'not-requested', strategyVersionV1Rows: null, backtestV1Rows: null },
    migration: {
      decision: '待数据库只读盘点',
      rule: '有存量或遗留调用方时只完成 Expand/Cutover，停止 Contract；无存量且无调用方时才允许 Contract',
    },
  };
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      inventory.database = {
        status: 'passed',
        strategyVersionV1Rows: await prisma.strategyVersion.count({ where: { schemaVersion: 1 } }),
        backtestV1Rows: await prisma.backtestJob.count({ where: { mode: 'V1' } }),
      };
    } finally {
      await prisma.$disconnect();
    }
  }
  console.log(JSON.stringify({ gate: 'backtest-v1-inventory', status: 'passed', inventory }));
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
