import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist', 'coverage', 'generated', 'third_party'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
};

const rules = [
  {
    name: 'desktop feature page',
    root: resolve(root, 'apps/desktop/src/features'),
    maxLines: 800,
    match: (path) => extname(path) === '.tsx',
  },
  {
    name: 'server service',
    root: resolve(root, 'apps/server/src'),
    maxLines: 600,
    match: (path) => path.endsWith('.service.ts'),
  },
  {
    name: 'test',
    root,
    maxLines: 800,
    match: (path) =>
      /[/\\]test[/\\].+\.test\.(?:ts|tsx)$/u.test(path) || path.endsWith('.test.ts') || path.endsWith('.test.tsx'),
  },
];

const warnings = [];
for (const rule of rules) {
  let files = [];
  try {
    files = await walk(rule.root);
  } catch {
    continue;
  }
  for (const path of files) {
    if (!rule.match(path)) continue;
    const text = await readFile(path, 'utf8');
    const lines = text.split(/\r?\n/u).length;
    if (lines <= rule.maxLines) continue;
    const file = relative(root, path).replaceAll('\\', '/');
    warnings.push({ file, lines, limit: rule.maxLines, rule: rule.name });
    console.log(
      `::warning file=${file}::${rule.name} has ${lines} lines (warning threshold ${rule.maxLines}); split responsibilities before raising the ratchet`,
    );
  }
}

if (warnings.length === 0) {
  console.log('File-size guardrails: no warnings');
} else {
  console.log(`File-size guardrails: ${warnings.length} warning(s); warning-only ratchet is active`);
}
