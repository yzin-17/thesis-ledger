import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { sha256 } from './process.mjs';

export function sourceProvenance(root) {
  const scope = [
    'apps/mobile/src',
    'apps/mobile/android',
    'apps/mobile/ios',
    'apps/mobile/config',
    'apps/mobile/index.js',
    'apps/mobile/app.json',
    'apps/mobile/package.json',
    'apps/mobile/metro.config.cjs',
    'apps/mobile/babel.config.cjs',
    'apps/mobile/chart-source-plugin.cjs',
    'packages/api-client',
    'packages/schemas',
    'packages/domain',
    'packages/shared',
    'patches',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'package.json',
    'scripts/mobile-release.mjs',
    'scripts/mobile-release',
    '.gitignore',
  ];
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const files = [
    ...new Set(
      git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...scope])
        .split('\0')
        .filter(Boolean),
    ),
  ].sort();
  const entries = files.map((file) => {
    const p = path.join(root, file);
    if (!existsSync(p)) return { file, removed: true };
    const bytes = lstatSync(p).isSymbolicLink() ? Buffer.from(readlinkSync(p)) : readFileSync(p);
    return { file, sha256: sha256(bytes) };
  });
  return {
    head: git(['rev-parse', 'HEAD']).trim(),
    sourceFingerprint: sha256(JSON.stringify(entries)),
    entries,
  };
}
