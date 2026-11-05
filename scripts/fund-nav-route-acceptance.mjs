import assert from 'node:assert/strict';
import { mkdirSync, lstatSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createFundNavPlan,
  executeFundNavCase,
  restoreFundNavPolicy,
} from './fund-nav-route-case.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:3000';
const api = {
  async get(path) {
    return request('GET', path);
  },
  async put(path, body) {
    assert.equal(path, '/api/market-data/policy');
    return request('PUT', path, body);
  },
};
async function request(method, path, body) {
  assert(path.startsWith('/api/market'));
  const response = await fetch(origin + path, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      'content-type': 'application/json',
      ...(process.env.SERVER_API_TOKEN
        ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert(response.ok, `基金验收 ${method} ${path.split('?')[0]} 返回 ${response.status}`);
  return response.json();
}

export function assertFundOutput(output) {
  const privateRoot = resolve(root, '.recovery-artifacts');
  assert(output.startsWith(privateRoot + sep) && !existsSync(output));
  for (let path = dirname(output); path.startsWith(privateRoot); path = dirname(path)) {
    if (existsSync(path)) assert(!lstatSync(path).isSymbolicLink());
    if (path === privateRoot) break;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--recover') {
    assert(args.length === 3 && args[2] === '--authorized-recovery');
    const record = JSON.parse(readFileSync(args[1]));
    console.log(JSON.stringify(await restoreFundNavPolicy(api, record.plan)));
    return;
  }
  assert(args.length === 0 || (args.length === 4 && args[0] === '--execute'));
  const [state, providers, catalog] = await Promise.all([
    api.get('/api/market-data/policy'),
    api.get('/api/market-data/providers'),
    api.get('/api/market-data/routes/capabilities?contractVersion=3'),
  ]);
  const plan = createFundNavPlan(state, providers.providers, catalog);
  if (args.length === 0) {
    console.log(
      JSON.stringify({
        mode: 'read-only-plan',
        origin,
        policyRevision: plan.baseline.revision,
        provider: plan.target,
        providerConfigVersion: plan.providerConfigVersion,
        symbol: plan.symbol,
        additions: plan.temporary.routes.slice(plan.baseline.routes.length),
        originalRouteCount: plan.baseline.routes.length,
        sourceRequests: ['current NAV', '2026-10-12..2026-10-16 NAV history, limit 5'],
        impact:
          '临时追加两条基金路由；不启停来源、不切备用、不改凭证；恢复原路由内容，修订号递增且缓存换代',
        targetWritten: false,
        requiresExplicitAuthorization: true,
      }),
    );
    return;
  }
  assert.equal(args[1], `--expected-policy=${plan.baseline.revision}`);
  assert.equal(args[2], `--expected-provider=${plan.providerConfigVersion}`);
  assert(args[3].startsWith('--output='));
  const output = resolve(args[3].slice('--output='.length));
  assertFundOutput(output);
  mkdirSync(output, { mode: 0o700 });
  const checkpoint = (record) => {
    writeFileSync(resolve(output, 'recovery.json.next'), JSON.stringify(record, null, 2), {
      mode: 0o600,
    });
    renameSync(resolve(output, 'recovery.json.next'), resolve(output, 'recovery.json'));
  };
  const evidence = await executeFundNavCase(api, plan, checkpoint);
  const result = {
    passed: true,
    source: plan.target,
    evidence,
    modelRequests: 0,
    originalRoutesRestored: true,
  };
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(result, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  console.log(JSON.stringify(result));
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
