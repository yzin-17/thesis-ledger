import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { gitLintCandidates } from './workspace-lint-sources.mjs';

// 保留尺寸门禁原有的缓存目录边界，源码归属由 Git 清单确定。
const generatedDirectories = new Set([
  'node_modules',
  'dist',
  'coverage',
  'generated',
  'third_party',
]);

export async function workspaceFileSizeSources(root, candidates = gitLintCandidates) {
  const repository = resolve(root);
  const files = await Promise.all(
    [...new Set(await candidates(repository))].map(async (file) => {
      const absolute = resolve(repository, file);
      const local = relative(repository, absolute);
      if (isAbsolute(local) || local.split(sep)[0] === '..')
        throw new Error('文件尺寸源码路径越出工作区');
      if (local.split(sep).some((part) => generatedDirectories.has(part))) return null;
      try {
        return (await stat(absolute)).isFile() ? local : null;
      } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
      }
    }),
  );
  return files.filter((file) => file !== null).sort();
}
