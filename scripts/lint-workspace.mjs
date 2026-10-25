import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { workspaceLintSources } from './workspace-lint-sources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const eslintCli = resolve(dirname(require.resolve('eslint')), '../bin/eslint.js');
const eslint = new ESLint({ cwd: root });
const argumentsList = process.argv.slice(2);
if (
  argumentsList.some((argument) => !['--list', '--guardrails'].includes(argument)) ||
  new Set(argumentsList).size !== argumentsList.length
) {
  throw new Error('仅支持可选参数 --list 与 --guardrails');
}
const guardrails = argumentsList.includes('--guardrails');

const files = (await workspaceLintSources(root, eslint))
  .filter((file) => !guardrails || ['apps', 'packages', 'services'].includes(file.split(sep)[0]))
  .sort();
if (!files.length) throw new Error('未发现配置内的 TypeScript 文件，停止 lint');
const groups = new Map();
for (const file of files) {
  const parts = file.split(sep);
  let scope = parts.length > 1 ? parts[0] : 'root';
  if (['apps', 'packages', 'services'].includes(parts[0]) && parts.length > 2) {
    scope = parts.slice(0, 2).join('/');
  }
  const entries = groups.get(scope) ?? [];
  entries.push(file);
  groups.set(scope, entries);
}

if (argumentsList.includes('--list')) {
  console.log(JSON.stringify({ files: files.length, groups: Object.fromEntries(groups) }));
} else {
  for (const [scope, entries] of groups) {
    console.log(`Lint ${scope} (${entries.length} files)`);
    try {
      const options = guardrails
        ? [
            '--rule',
            'no-nested-ternary:warn',
            '--rule',
            'complexity:[warn,20]',
            '--rule',
            'max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]',
          ]
        : ['--max-warnings=0'];
      execFileSync(process.execPath, [eslintCli, ...entries, ...options], {
        cwd: root,
        stdio: 'inherit',
      });
    } catch (error) {
      console.error(`Lint ${scope} 失败：${error.signal ?? error.status ?? 'unknown'}`);
      process.exit(error.status || 1);
    }
  }
  console.log(`Workspace lint passed (${groups.size} groups, ${files.length} files)`);
}
