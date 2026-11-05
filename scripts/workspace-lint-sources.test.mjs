import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { ESLint } from 'eslint';
import { gitLintCandidates, workspaceLintSources } from './workspace-lint-sources.mjs';

const roots = [];
const eslint = { isPathIgnored: () => Promise.resolve(false) };
async function fixture(git = true) {
  const root = await mkdtemp(join(tmpdir(), 'workspace-lint-sources-'));
  roots.push(root);
  if (git) execFileSync('git', ['init', '--quiet', root]);
  const put = async (name, text = 'export const value = 1;') => {
    const path = join(root, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  };
  return { root, put };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('Git 清单包含未提交源码、空格与中文路径，验收包和恢复产物保留原位', async () => {
  const { root, put } = await fixture();
  await put('.gitignore', 'apps/mobile/release/\n.recovery-artifacts/\n');
  await put('apps/mobile/src/未提交 页面.tsx');
  await put('scripts/contract.mts');
  await put('apps/mobile/release/验收快照/旧源码.ts', '验收原文');
  await put('.recovery-artifacts/backup.ts', '恢复原文');
  await put('README.md', '说明');
  assert.deepEqual(await workspaceLintSources(root, eslint), [
    'apps/mobile/src/未提交 页面.tsx',
    'scripts/contract.mts',
  ]);
  assert.equal(
    await readFile(join(root, 'apps/mobile/release/验收快照/旧源码.ts'), 'utf8'),
    '验收原文',
  );
  assert.equal(await readFile(join(root, '.recovery-artifacts/backup.ts'), 'utf8'), '恢复原文');
  assert.ok(gitLintCandidates(root).includes('apps/mobile/src/未提交 页面.tsx'));
});

test('已跟踪且被 Git ignore 覆盖的源码仍检查，不按 ignore 二次删除候选', async () => {
  const { root, put } = await fixture();
  await put('.gitignore', 'apps/mobile/release/\n');
  const tracked = 'apps/mobile/release/tracked.ts';
  const wip = 'apps/mobile/src/new.ts';
  await put(tracked);
  await put(wip);
  // 模拟只读 Git index 输出，不执行 stage 或 commit。
  assert.deepEqual(await workspaceLintSources(root, eslint, () => [tracked, wip, wip]), [
    tracked,
    wip,
  ]);
});

test('保留既有 ESLint 排除规则，忽略已删除文件及同后缀目录', async () => {
  const { root, put } = await fixture();
  await put('apps/server/src/live.ts');
  await put('packages/sample/generated/value.ts');
  await mkdir(join(root, 'directory.ts'));
  const configured = { isPathIgnored: (path) => Promise.resolve(path.includes('/generated/')) };
  assert.deepEqual(
    await workspaceLintSources(root, configured, () => [
      'deleted.ts',
      'directory.ts',
      'apps/server/src/live.ts',
      'packages/sample/generated/value.ts',
    ]),
    ['apps/server/src/live.ts'],
  );
});

test('Git 清单不可用时直接失败，不回退到产物目录扫描', async () => {
  const { root, put } = await fixture(false);
  await put('source.ts');
  await assert.rejects(workspaceLintSources(root, eslint));
});

test('拒绝工作区外的候选路径', async () => {
  const { root } = await fixture();
  await assert.rejects(
    workspaceLintSources(root, eslint, () => ['../outside.ts']),
    /越出工作区/u,
  );
});

test('未提交真实源码的嵌套三元仍触发原 ESLint 规则，快照不再扩入执行目标', async () => {
  const { root, put } = await fixture();
  await put('.gitignore', 'apps/mobile/release/\n');
  const body = 'const result = true ? (false ? 1 : 2) : 3;';
  await put('apps/mobile/src/real.ts', body);
  await put('apps/mobile/release/copied.ts', body);
  const engine = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [{ files: ['**/*.ts'], rules: { 'no-nested-ternary': 'error' } }],
  });
  const files = await workspaceLintSources(root, engine);
  const reports = await engine.lintFiles(files);
  assert.equal(reports.length, 1);
  assert.ok(reports[0].filePath.endsWith('/apps/mobile/src/real.ts'));
  assert.equal(reports[0].errorCount, 1);
  assert.equal(reports[0].messages[0].ruleId, 'no-nested-ternary');
});
