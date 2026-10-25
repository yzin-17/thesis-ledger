import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runBuild } from './process.mjs';

test('编译日志跨数据块隐藏密码，失败不能返回成功回执', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mobile-release-log-')),
    log = path.join(dir, 'build.log');
  try {
    const command = {
      binary: process.execPath,
      args: [
        '-e',
        "process.stdout.write('fixture-se');setTimeout(()=>{process.stdout.write('cret\\n');process.exitCode=3},30)",
      ],
      cwd: dir,
    };
    await assert.rejects(
      runBuild(command, {
        log,
        env: { ...process.env, ANDROID_KEYSTORE_PASSWORD: 'fixture-secret' },
      }),
      /退出码 3/,
    );
    const text = readFileSync(log, 'utf8');
    assert(!text.includes('fixture-secret'));
    assert(text.includes('[隐藏]'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('IPA 解压保留主二进制权限和内容，输出限定在新目录', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mobile-release-zip-'));
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ipa-extract.py');
  try {
    const file = path.join(dir, 'fixture.ipa'),
      out = path.join(dir, 'out');
    const code =
      "import zipfile,sys,stat\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n i=zipfile.ZipInfo('Payload/Test.app/Test');i.create_system=3;i.external_attr=(stat.S_IFREG|0o755)<<16;z.writestr(i,b'fixture executable')";
    assert.equal(spawnSync('python3', ['-c', code, file]).status, 0);
    assert.equal(spawnSync('python3', [helper, file, out]).status, 0);
    assert.equal(
      readFileSync(path.join(out, 'Payload/Test.app/Test'), 'utf8'),
      'fixture executable',
    );
    assert.equal(statSync(path.join(out, 'Payload/Test.app/Test')).mode & 0o777, 0o755);
    assert.equal(existsSync(path.join(dir, 'Test')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
