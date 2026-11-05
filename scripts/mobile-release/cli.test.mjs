import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  mkdtempSync,
  existsSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  cli = path.join(root, 'scripts/mobile-release.mjs'),
  template = path.join(root, 'apps/mobile/config/release.example.json');
const clean = {
  ...process.env,
  ANDROID_KEYSTORE_FILE: '',
  ANDROID_KEYSTORE_PASSWORD: '',
  ANDROID_KEY_ALIAS: '',
  ANDROID_KEY_PASSWORD: '',
  IOS_PROVISIONING_PROFILE: '',
};
const invoke = (args) =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: clean,
    encoding: 'utf8',
    timeout: 15000,
  });
test('两平台计划不依赖凭据，明确不是签名就绪或分发通过', () => {
  for (const platform of ['android', 'ios']) {
    const r = invoke(['plan', platform, '--config', template]);
    assert.equal(r.status, 0, r.stderr);
    const value = JSON.parse(r.stdout);
    assert.equal(value.signingInputsPresent, false);
    assert.equal(value.preflightVerified, false);
    assert.equal(value.distributionAvailable, false);
  }
});
test('缺材料的正式接续在创建输出和任何原生工具前拒绝', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mobile-release-cli-'));
  try {
    for (const platform of ['android', 'ios']) {
      const out = path.join(dir, platform),
        r = invoke(['build', platform, '--signed', '--config', template, '--out', out]);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /条件未就绪/);
      assert.equal(existsSync(out), false);
      assert.equal(r.stdout, '');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('参数误用、未显式选择模式和重复模式均不执行', () => {
  for (const args of [
    ['build', 'android', '--config', template, '--out', '/unused'],
    ['build', 'ios', '--signed', '--unsigned', '--config', template],
    ['upload', 'ios', '--config', template],
    ['plan', 'ios', '--config', template, '--allowProvisioningUpdates'],
  ])
    assert.equal(invoke(args).status, 2);
});
test('材料路径在原生工具切换工作目录前固定，预检失败不创建候选', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mobile-release-path-'));
  try {
    const file = path.join(dir, 'config.json'),
      keystore = path.join(dir, 'fixture.jks'),
      capture = path.join(dir, 'capture.json'),
      out = path.join(dir, 'out'),
      binary = path.join(dir, 'bin/keytool');
    const c = JSON.parse(readFileSync(template));
    c.apiBaseUrl = 'https://ledger.company.cn/api/v1';
    c.android.certificateSha256 = 'A'.repeat(64);
    writeFileSync(file, JSON.stringify(c));
    writeFileSync(keystore, 'fixture only');
    mkdirSync(path.dirname(binary));
    mkdirSync(path.join(dir, 'sdk/build-tools/99.0.0'), { recursive: true });
    writeFileSync(
      binary,
      '#!' +
        process.execPath +
        '\nrequire("fs").writeFileSync(process.env.RELEASE_FIXTURE_CAPTURE, JSON.stringify(process.env.ANDROID_KEYSTORE_FILE));process.exit(7);\n',
    );
    chmodSync(binary, 0o755);
    const r = spawnSync(
      process.execPath,
      [cli, 'build', 'android', '--signed', '--config', file, '--out', out],
      {
        cwd: root,
        env: {
          ...clean,
          JAVA_HOME: dir,
          ANDROID_HOME: path.join(dir, 'sdk'),
          RELEASE_FIXTURE_CAPTURE: capture,
          ANDROID_KEYSTORE_FILE: path.relative(root, keystore),
          ANDROID_KEYSTORE_PASSWORD: 'fixture-password',
          ANDROID_KEY_ALIAS: 'fixture',
          ANDROID_KEY_PASSWORD: 'fixture-password',
        },
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    assert.equal(r.status, 2);
    assert.match(r.stderr, /退出码 7/);
    assert.equal(JSON.parse(readFileSync(capture)), keystore);
    assert.equal(existsSync(out), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('畸形配置不会把输入内容作为 JSON 错误片段打印', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mobile-release-config-'));
  try {
    const file = path.join(dir, 'invalid.json');
    writeFileSync(file, '{"value":"fixture-private-input" invalid');
    const r = invoke(['plan', 'android', '--config', file]);
    assert.equal(r.status, 2);
    assert(!r.stderr.includes('fixture-private-input'));
    assert.equal(r.stdout, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('准备流水线无上传/凭据步骤，默认关闭候选编译，保留双端原生CI', () => {
  const flow = readFileSync(
    path.join(root, '.github/workflows/mobile-release-prepare.yml'),
    'utf8',
  );
  assert.match(flow, /prepare_unsigned:[\s\S]*?default: false/);
  assert.match(flow, /build android --unsigned/);
  assert.match(flow, /build ios --unsigned/);
  assert.doesNotMatch(
    flow,
    /upload-artifact|secrets\.|eas submit|fastlane|altool|--signed|contents: write/,
  );
  const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /mobile-android-native:/);
  assert.match(ci, /mobile-ios-native:/);
  assert.match(ci, /node --test scripts\/mobile-release\/\*\.test\.mjs/);
});
test('IPA 检查拒绝路径逃逸、符号链接和重复路径', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mobile-release-ipa-'));
  const script = path.join(root, 'scripts/mobile-release/ipa-extract.py');
  try {
    const make = `import zipfile,sys,stat
for kind in ['escape','link','duplicate']:
 with zipfile.ZipFile(sys.argv[1]+'/'+kind+'.ipa','w') as z:
  if kind=='escape': z.writestr('../escaped','x')
  elif kind=='link':
   i=zipfile.ZipInfo('Payload/Test.app/link');i.create_system=3;i.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(i,'/tmp')
  else: z.writestr('Payload/x','x');z.writestr('Payload/x','x')`;
    assert.equal(spawnSync('python3', ['-c', make, dir], { encoding: 'utf8' }).status, 0);
    for (const kind of ['escape', 'link', 'duplicate']) {
      const out = path.join(dir, kind);
      const r = spawnSync('python3', [script, path.join(dir, kind + '.ipa'), out], {
        encoding: 'utf8',
      });
      assert.notEqual(r.status, 0);
    }
    assert.equal(existsSync(path.join(dir, 'escaped')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
