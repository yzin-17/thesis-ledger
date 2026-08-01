import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pnpmRoot = resolve(root, 'node_modules/.pnpm');
const outputPath = resolve(root, 'docs/engineering/third-party-license-inventory.md');

const normalizeLicense = (value) => {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(normalizeLicense).filter(Boolean).join(' OR ');
  if (value && typeof value === 'object' && 'type' in value) return normalizeLicense(value.type);
  return '';
};

const packages = new Map();
const pnpmEntries = await readdir(pnpmRoot, { withFileTypes: true });
for (const entry of pnpmEntries) {
  if (!entry.isDirectory()) continue;
  const packageModules = resolve(pnpmRoot, entry.name, 'node_modules');
  let scopes;
  try {
    scopes = await readdir(packageModules, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const scope of scopes) {
    const packageRoots = scope.name.startsWith('@')
      ? (await readdir(resolve(packageModules, scope.name), { withFileTypes: true })).map((child) =>
          resolve(packageModules, scope.name, child.name),
        )
      : [resolve(packageModules, scope.name)];
    for (const packageRoot of packageRoots) {
      try {
        const packageJson = JSON.parse(
          await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
        );
        if (!packageJson.name || !packageJson.version) continue;
        const license = normalizeLicense(packageJson.license ?? packageJson.licenses);
        packages.set(`${packageJson.name}@${packageJson.version}`, {
          name: packageJson.name,
          version: packageJson.version,
          license: license || 'UNKNOWN',
        });
      } catch {
        // pnpm 的链接目录可能没有 package.json，跳过即可。
      }
    }
  }
}

const rows = [...packages.values()].sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
);
const unknown = rows.filter((row) => row.license === 'UNKNOWN');
const markdown = [
  '# 第三方依赖许可证清单',
  '',
  '> 由 `pnpm licenses:scan` 从当前锁定依赖的 package metadata 生成；发布前仍需人工核对 DSA Fork、移植代码和非 npm 依赖。',
  '',
  '| 包 | 版本 | 声明许可证 |',
  '| --- | --- | --- |',
  ...rows.map((row) => `| ${row.name} | ${row.version} | ${row.license} |`),
  '',
  `共 ${rows.length} 个唯一依赖版本。`,
  '',
].join('\n');
await writeFile(outputPath, markdown);
console.log(`License inventory written (${rows.length} packages): ${outputPath}`);
if (unknown.length > 0) {
  console.error(`许可证字段缺失 (${unknown.length}):`);
  for (const row of unknown) console.error(`- ${row.name}@${row.version}`);
  process.exitCode = 1;
}
