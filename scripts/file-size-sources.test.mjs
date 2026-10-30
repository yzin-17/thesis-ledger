import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { workspaceFileSizeSources } from './file-size-sources.mjs';

const roots = [];
async function fixture(git = true) {
  const root = await mkdtemp(join(tmpdir(), 'file-size-sources-'));
  roots.push(root);
  if (git) execFileSync('git', ['init', '--quiet', root]);
  const put = async (name, text = 'export const value = 1;') => {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), text);
  };
  return { root, put };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('检查未提交真实源码，保留并排除未跟踪验收快照', async () => {
  const { root, put } = await fixture();
  await put('.gitignore', 'apps/mobile/release/\n.recovery-artifacts/\n');
  const source = 'apps/desktop/test/中文 测试.test.tsx';
  const snapshot = 'apps/mobile/release/验收包/test/copied.test.tsx';
  await put(source);
  await put(snapshot, '验收原文\n'.repeat(900));
  await put('.recovery-artifacts/backup.test.ts', '恢复原文');
  const files = await workspaceFileSizeSources(root);
  assert.ok(files.includes(source));
  assert.ok(!files.includes(snapshot));
  assert.ok(!files.includes('.recovery-artifacts/backup.test.ts'));
  assert.equal(await readFile(join(root, snapshot), 'utf8'), '验收原文\n'.repeat(900));
});

test('Git 已跟踪的 ignore 路径保留，不能借 ignore 隐藏真实源码', async () => {
  const { root, put } = await fixture();
  await put('.gitignore', 'apps/mobile/release/\n');
  const tracked = 'apps/mobile/release/tracked.test.ts';
  await put(tracked);
  // 注入已跟踪清单，不执行 stage 或 commit。
  assert.deepEqual(await workspaceFileSizeSources(root, () => [tracked, tracked]), [tracked]);
});

test('保持既有缓存边界，跳过已删除文件和同后缀目录', async () => {
  const { root, put } = await fixture();
  await put('apps/server/src/actual.service.ts');
  await put('packages/a/generated/large.test.ts');
  await mkdir(join(root, 'directory.test.ts'));
  assert.deepEqual(
    await workspaceFileSizeSources(root, () => [
      'apps/server/src/actual.service.ts',
      'packages/a/generated/large.test.ts',
      'deleted.test.ts',
      'directory.test.ts',
    ]),
    ['apps/server/src/actual.service.ts'],
  );
});

test('Git 清单不可用和路径越界时失败，不回退为全目录扫描', async () => {
  const { root, put } = await fixture(false);
  await put('source.test.ts');
  await assert.rejects(workspaceFileSizeSources(root));
  await assert.rejects(
    workspaceFileSizeSources(root, () => ['../outside.test.ts']),
    /越出工作区/u,
  );
});
