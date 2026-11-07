import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readdirSync, existsSync } from 'node:fs';

// Offline source tests only. Reuse the locally built data image, mount source read-only,
// provide no credentials, no volumes or network, and never mutate the running stack.
const source = fileURLToPath(new URL('../../daily-stock-analysis/', import.meta.url));
const environments = `${source}.venv/lib`;
const pythonLibrary = readdirSync(environments).find(
  (name) => name.startsWith('python') && existsSync(`${environments}/${name}/site-packages/pytest`),
);
if (!pythonLibrary)
  throw new Error(
    'Existing local pytest packages are required; this script never installs dependencies',
  );
const testPackages = `${environments}/${pythonLibrary}/site-packages`;
const name = `ledger-risk-dsa-${randomUUID().slice(0, 8)}`;
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--pull',
    'never',
    '--name',
    name,
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,exec,size=256m',
    '-e',
    'PYTHONDONTWRITEBYTECODE=1',
    '-e',
    'PYTHONPATH=/source',
    '-e',
    'PYTEST_DISABLE_PLUGIN_AUTOLOAD=1',
    '-e',
    'DATABASE_PATH=/tmp/offline-risk.db',
    '--mount',
    `type=bind,source=${source},target=/source,readonly`,
    '--mount',
    `type=bind,source=${testPackages},target=/pytest-tools,readonly`,
    '-w',
    '/source',
    '--entrypoint',
    'python',
    'daily-stock-analysis:thesisledger-dev',
    '-c',
    "import sys, subprocess; sys.path.append('/pytest-tools'); import pytest; result=pytest.main(sys.argv[1:]); result or subprocess.run([sys.executable,'scripts/check_data_service_boundary.py','--syntax'],check=True); result or subprocess.run([sys.executable,'scripts/check_thesis_ledger_capability_boundaries.py'],check=True); result or subprocess.run([sys.executable,'scripts/check_data_runtime_contract.py'],check=True); result or subprocess.run([sys.executable,'scripts/data_test_scope.py'],check=True); sys.exit(result)",
    '-p',
    'no:cacheprovider',
    '--override-ini',
    'addopts=',
    'tests/test_thesis_ledger_cache_context_v3.py',
    'tests/test_configured_market_routes.py',
    '-q',
  ],
  { encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
);
if (result.error) {
  // Only this script's UUID container may be removed after an interrupted test.
  spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' });
}
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) process.stderr.write(String(result.error));
process.exit(result.status ?? 1);
