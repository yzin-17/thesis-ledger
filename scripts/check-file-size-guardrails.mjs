import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const baseRef = process.env.GUARDRAIL_BASE_REF?.trim();

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist', 'coverage', 'generated', 'third_party'].includes(entry.name))
      continue;
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
      /[/\\]test[/\\].+\.test\.(?:ts|tsx)$/u.test(path) ||
      path.endsWith('.test.ts') ||
      path.endsWith('.test.tsx'),
  },
];

const countLines = (text) => text.split(/\r?\n/u).length;

let baseAvailable = false;
if (baseRef) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], {
      cwd: root,
      stdio: 'ignore',
    });
    baseAvailable = true;
  } catch {
    console.log(
      `::warning::File-size guardrail baseline ${baseRef} is unavailable; oversized files are warning-only for this run`,
    );
  }
}

const baseLinesFor = (file) => {
  if (!baseAvailable || !baseRef) return undefined;
  try {
    const text = execFileSync('git', ['show', `${baseRef}:${file}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return countLines(text);
  } catch {
    return null;
  }
};

const warnings = [];
const violations = [];
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
    const lines = countLines(text);
    if (lines <= rule.maxLines) continue;
    const file = relative(root, path).replaceAll('\\', '/');
    const baseLines = baseLinesFor(file);

    if (baseLines === undefined) {
      warnings.push({ file, lines, limit: rule.maxLines, rule: rule.name });
      console.log(
        `::warning file=${file}::${rule.name} has ${lines} lines (threshold ${rule.maxLines}); no valid baseline was supplied, so this run cannot enforce the ratchet`,
      );
      continue;
    }

    let reason;
    if (baseLines === null) reason = 'new file exceeds the threshold';
    else if (baseLines <= rule.maxLines) reason = `crossed the ${rule.maxLines}-line threshold from ${baseLines} lines`;
    else if (lines > baseLines) reason = `grew from the oversized baseline of ${baseLines} lines`;

    if (reason) {
      violations.push({ file, lines, baseLines, limit: rule.maxLines, rule: rule.name });
      console.error(
        `::error file=${file}::${rule.name} has ${lines} lines: ${reason}; split responsibilities instead of increasing the ratchet`,
      );
      continue;
    }

    warnings.push({ file, lines, baseLines, limit: rule.maxLines, rule: rule.name });
    console.log(
      `::warning file=${file}::${rule.name} remains above ${rule.maxLines} lines (${lines}, baseline ${baseLines}); legacy debt is allowed only while it does not grow`,
    );
  }
}

if (violations.length > 0) {
  console.error(`File-size guardrails: ${violations.length} ratchet violation(s)`);
  process.exitCode = 1;
} else if (warnings.length > 0) {
  console.log(`File-size guardrails: ${warnings.length} legacy warning(s); ratchet passed`);
} else {
  console.log('File-size guardrails: no warnings');
}
