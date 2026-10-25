import { execFileSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Git 已跟踪源码与未忽略 WIP 的并集；现有 ignore 只排除未跟踪产物。 */
export function gitLintCandidates(root) {
  return execFileSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  )
    .split('\0')
    .filter(Boolean);
}

/** 只返回现存、由版本控制归属且被 ESLint 配置覆盖的精确文件路径。 */
export async function workspaceLintSources(root, eslint, candidates = gitLintCandidates) {
  const repository = resolve(root);
  const paths = [...new Set(await candidates(repository))].filter((path) =>
    /\.(?:tsx?|mts)$/u.test(path),
  );
  const files = await Promise.all(
    paths.map(async (path) => {
      const absolute = resolve(repository, path);
      const local = relative(repository, absolute);
      if (isAbsolute(local) || local.split(sep)[0] === '..')
        throw new Error('lint 源码路径越出工作区');
      let file;
      try {
        file = await stat(absolute);
      } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
      }
      if (!file.isFile() || (await eslint.isPathIgnored(absolute))) return null;
      return local;
    }),
  );
  return files.filter((file) => file !== null).sort();
}
