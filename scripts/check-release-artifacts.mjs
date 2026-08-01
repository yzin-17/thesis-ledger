import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const artifacts = [
  resolve(root, 'apps/desktop/release/Investment OS-0.1.0-arm64.dmg'),
  resolve(root, 'apps/desktop/release/Investment OS Setup 0.1.0.exe'),
  resolve(root, 'apps/mobile/release/investment-os-0.1.0-arm64.apk'),
  resolve(root, 'apps/mobile/release/investment-os-0.1.0.aab'),
];

const sha256 = async (path) => {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
};

const archiveEntries = (path) => {
  const output = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
};

const checked = [];
for (const path of artifacts) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size === 0) throw new Error(`发布产物为空：${path}`);
  checked.push({ path, bytes: metadata.size, sha256: await sha256(path) });
}

const apkEntries = archiveEntries(artifacts[2]);
const apkArchitectures = new Set(
  apkEntries
    .map((entry) => entry.match(/^lib\/([^/]+)\//)?.[1])
    .filter((architecture) => architecture),
);
if (apkArchitectures.size !== 1 || !apkArchitectures.has('arm64-v8a')) {
  throw new Error(`APK 架构不符合 arm64 单架构预期：${[...apkArchitectures].join(', ')}`);
}
if (!apkEntries.includes('assets/index.android.bundle')) {
  throw new Error('APK 未包含 Android JS bundle');
}

const aabEntries = archiveEntries(artifacts[3]);
if (!aabEntries.includes('base/assets/index.android.bundle')) {
  throw new Error('AAB 未包含 base Android JS bundle');
}
const aabArchitectures = new Set(
  aabEntries
    .map((entry) => entry.match(/^base\/lib\/([^/]+)\//)?.[1])
    .filter((architecture) => architecture),
);
if (aabArchitectures.size !== 1 || !aabArchitectures.has('arm64-v8a')) {
  throw new Error(`AAB 架构不符合 arm64 单架构预期：${[...aabArchitectures].join(', ')}`);
}

console.log(`发布产物静态检查通过 (${checked.length} 项)`);
for (const item of checked) {
  console.log(`- ${item.path.replace(`${root}/`, '')}: ${item.bytes} bytes, sha256=${item.sha256}`);
}
