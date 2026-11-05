import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { boundarySourceFiles } from './boundary-source-inventory.mjs';

const scripts = fileURLToPath(new URL('.', import.meta.url));

test('源码清单忽略未跟踪副本，保留维护文件与已跟踪的忽略文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boundary-inventory-'));
  const write = async (name, text) => {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), text);
  };
  try {
    execFileSync('git', ['init', '-q', root]);
    await write('.gitignore', 'apps/mobile/release/\napps/server/src/tracked-hidden.ts\n');
    await write('apps/mobile/release/待审 副本/illegal.ts', "import 'bullmq';\n");
    await write('apps/server/src/backtest/审计 input.ts', "import 'bullmq';\n");
    await write('apps/server/src/tracked-hidden.ts', 'export const tracked = true;\n');
    await write('apps/server/src/deleted.ts', 'export const removed = true;\n');
    execFileSync('git', [
      '-C',
      root,
      'add',
      '-f',
      'apps/server/src/tracked-hidden.ts',
      'apps/server/src/deleted.ts',
    ]);
    await unlink(join(root, 'apps/server/src/deleted.ts'));
    const files = await boundarySourceFiles(root);
    assert.deepEqual(files, [
      join(root, 'apps/server/src/backtest/审计 input.ts'),
      join(root, 'apps/server/src/tracked-hidden.ts'),
    ]);
    await mkdir(join(root, 'scripts'));
    for (const name of [
      'check-boundaries.mjs',
      'boundary-source-inventory.mjs',
      'mobile-boundaries.mjs',
      'ai-catalog-boundaries.mjs',
    ])
      await copyFile(join(scripts, name), join(root, 'scripts', name));
    const invoke = () =>
      spawnSync(process.execPath, [join(root, 'scripts/check-boundaries.mjs')], {
        encoding: 'utf8',
      });
    assert.equal(invoke().status, 0);
    await write('apps/server/src/ai/new-violation.ts', "import 'bullmq';\n");
    await write('apps/server/src/tracked-hidden.ts', "import 'bullmq';\n");
    const failed = invoke();
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /apps\/server\/src\/ai\/new-violation.ts/);
    assert.match(failed.stderr, /apps\/server\/src\/tracked-hidden.ts/);
    assert.doesNotMatch(failed.stderr, /待审 副本/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('源码清单无法取得 Git 输入时失败关闭', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boundary-inventory-no-git-'));
  try {
    await assert.rejects(boundarySourceFiles(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
