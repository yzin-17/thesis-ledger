import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoots = ['apps', 'packages', 'services'];
const runtimeFields = ['dependencies', 'optionalDependencies', 'peerDependencies'];

const pathKind = (path) => path.split('/')[0];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function discoverPackages(directory, packages = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', 'release', 'generated'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    const manifestPath = join(path, 'package.json');
    if (await exists(manifestPath)) {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (typeof manifest.name === 'string') {
        packages.push({
          name: manifest.name,
          path: relative(root, path).replaceAll('\\', '/'),
          manifest,
        });
      }
      continue;
    }
    await discoverPackages(path, packages);
  }
  return packages;
}

const dependenciesFor = (pkg, fields) =>
  new Set(
    fields.flatMap((field) =>
      Object.keys(pkg.manifest[field] ?? {}).filter((dependency) => dependency.startsWith('@thesis-ledger/')),
    ),
  );

export function validateWorkspaceGraph(packages) {
  const violations = [];
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const runtimeGraph = new Map();

  for (const pkg of packages) {
    const dependencies = [...dependenciesFor(pkg, runtimeFields)].filter((name) => byName.has(name));
    runtimeGraph.set(pkg.name, dependencies);

    for (const dependencyName of dependencies) {
      const target = byName.get(dependencyName);
      if (!target) continue;
      const sourceKind = pathKind(pkg.path);
      const targetKind = pathKind(target.path);
      if (sourceKind === 'packages' && (targetKind === 'apps' || targetKind === 'services')) {
        violations.push(`${pkg.name} (${pkg.path}) must not depend on ${dependencyName} (${target.path})`);
      }
      if (sourceKind === 'apps' && targetKind === 'services') {
        violations.push(`${pkg.name} (${pkg.path}) must not depend on service ${dependencyName}`);
      }
      if (sourceKind === 'services' && targetKind === 'apps') {
        violations.push(`${pkg.name} (${pkg.path}) must not depend on app ${dependencyName}`);
      }
    }
  }

  const allowedPackageDependencies = new Map([
    ['@thesis-ledger/shared', new Set()],
    ['@thesis-ledger/domain', new Set(['@thesis-ledger/shared'])],
    ['@thesis-ledger/schemas', new Set()],
    ['@thesis-ledger/api-client', new Set(['@thesis-ledger/schemas'])],
  ]);
  for (const [name, allowed] of allowedPackageDependencies) {
    const pkg = byName.get(name);
    if (!pkg) continue;
    for (const dependency of runtimeGraph.get(name) ?? []) {
      if (!allowed.has(dependency)) {
        violations.push(`${name} has unsupported runtime dependency ${dependency}`);
      }
    }
  }

  const dsa = byName.get('@thesis-ledger/dsa-adapter');
  if (dsa) {
    const allowed = new Set(['@thesis-ledger/domain', '@thesis-ledger/schemas']);
    for (const dependency of runtimeGraph.get(dsa.name) ?? []) {
      if (!allowed.has(dependency)) {
        violations.push(`${dsa.name} has unsupported runtime dependency ${dependency}`);
      }
    }
  }

  const state = new Map();
  const stack = [];
  const visit = (name) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      const start = stack.indexOf(name);
      const cycle = [...stack.slice(start), name];
      violations.push(`runtime dependency cycle: ${cycle.join(' -> ')}`);
      return;
    }
    state.set(name, 'visiting');
    stack.push(name);
    for (const dependency of runtimeGraph.get(name) ?? []) visit(dependency);
    stack.pop();
    state.set(name, 'done');
  };
  for (const name of runtimeGraph.keys()) visit(name);

  return [...new Set(violations)];
}

function runFixtureChecks() {
  const pkg = (name, path, dependencies = {}, devDependencies = {}) => ({
    name,
    path,
    manifest: { name, dependencies, devDependencies },
  });
  const valid = [
    pkg('@thesis-ledger/shared', 'packages/shared'),
    pkg('@thesis-ledger/domain', 'packages/domain', { '@thesis-ledger/shared': 'workspace:*' }),
    pkg('@thesis-ledger/schemas', 'packages/schemas', {}, { '@thesis-ledger/domain': 'workspace:*' }),
    pkg('@thesis-ledger/api-client', 'packages/api-client', {
      '@thesis-ledger/schemas': 'workspace:*',
    }),
  ];
  assert.deepEqual(validateWorkspaceGraph(valid), []);

  const reverse = [
    ...valid,
    pkg('@thesis-ledger/server-fixture', 'apps/server-fixture'),
    pkg('@thesis-ledger/bad-package', 'packages/bad-package', {
      '@thesis-ledger/server-fixture': 'workspace:*',
    }),
  ];
  assert.match(validateWorkspaceGraph(reverse).join('\n'), /must not depend/u);

  const cycle = [
    pkg('@thesis-ledger/a', 'services/a', { '@thesis-ledger/b': 'workspace:*' }),
    pkg('@thesis-ledger/b', 'services/b', { '@thesis-ledger/a': 'workspace:*' }),
  ];
  assert.match(validateWorkspaceGraph(cycle).join('\n'), /runtime dependency cycle/u);

  const devOnly = [
    pkg('@thesis-ledger/a', 'services/a', {}, { '@thesis-ledger/b': 'workspace:*' }),
    pkg('@thesis-ledger/b', 'services/b', {}, { '@thesis-ledger/a': 'workspace:*' }),
  ];
  assert.deepEqual(validateWorkspaceGraph(devOnly), []);
}

runFixtureChecks();

const packages = [];
for (const directory of workspaceRoots) {
  const path = join(root, directory);
  if (await exists(path)) await discoverPackages(path, packages);
}

const violations = validateWorkspaceGraph(packages);
if (violations.length > 0) {
  console.error(`Workspace dependency guard failed:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Workspace dependency graph: OK (${packages.length} packages)`);
}
