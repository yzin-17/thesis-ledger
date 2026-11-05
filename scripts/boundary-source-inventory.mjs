import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function boundarySourceFiles(root) {
  const { stdout } = await exec(
    'git',
    [
      '-C',
      root,
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      'apps',
      'packages',
      'services',
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const files = [];
  for (const file of [...new Set(stdout.split('\0').filter(Boolean))].sort()) {
    if (!['.ts', '.tsx'].includes(extname(file))) continue;
    if (file.split('/').some((part) => ['node_modules', 'dist', 'coverage'].includes(part)))
      continue;
    const path = join(root, file);
    try {
      if ((await stat(path)).isFile()) files.push(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return files;
}
