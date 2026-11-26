import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

// pnpm deploy 在当前 Server 镜像里为这四个 workspace 引用写入 injected。
function matchesDeployedManifest(source, runtime) {
  if (source?.name !== '@thesis-ledger/server' || Object.hasOwn(source, 'dependenciesMeta')) return false;

  const generated = {};
  for (const [section, names] of [
    ['dependencies', ['domain', 'schemas', 'shared']],
    ['devDependencies', ['api-client']],
  ]) {
    for (const name of names) {
      const dependency = `@thesis-ledger/${name}`;
      if (source[section]?.[dependency] !== 'workspace:*') return false;
      generated[dependency] = { injected: true };
    }
  }
  return isDeepStrictEqual({ ...source, dependenciesMeta: generated }, runtime);
}

try {
  const [source, runtime] = process.argv.slice(2).map(path => JSON.parse(readFileSync(path, 'utf8')));
  if (!matchesDeployedManifest(source, runtime)) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
