import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['apps', 'packages', 'services', 'infra', 'scripts', 'docs'];
const ignored = new Set(['.env.example', 'pnpm-lock.yaml']);
const ignoredDirectories = new Set(['node_modules', 'dist', 'release']);
const patterns = [
  /sk-[A-Za-z0-9]{20,}/u,
  /AKIA[0-9A-Z]{16}/u,
  /-----BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY-----/u,
  /https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9-]{20,}/u,
];

const files = [];
const walk = async (root) => {
  for (const name of await readdir(root, { withFileTypes: true })) {
    const path = join(root, name.name);
    if (name.isDirectory() && !name.name.startsWith('.') && !ignoredDirectories.has(name.name)) {
      await walk(path);
    } else if (name.isFile() && !ignored.has(name.name)) files.push(path);
  }
};
for (const root of roots) await walk(root);
const findings = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  if (patterns.some((pattern) => pattern.test(text))) findings.push(file);
}
if (findings.length) {
  console.error(`发现疑似 Secret：\n${findings.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Secret scan passed (${files.length} files)`);
