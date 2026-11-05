import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourceState } from '../../thesis-ledger-infra/scripts/research-dual-read.mjs';
import { sql } from '../../thesis-ledger-infra/scripts/research-state-backup.mjs';
import { readFundTarget, fundProviderState } from './fund-calibration-target.mjs';
import { fundPolicyFingerprint } from './fund-nav-route-case.mjs';
import {
  assertDisclosureAccount,
  assertDisclosureLedger,
  assertDisclosureBarsRepair,
  assertDisclosureSampleRecovery,
  assertQualifiedDisclosureSource,
  assertDisclosurePlan,
  createDisclosurePlan,
  disclosureChannel,
  disclosureFund,
  restoreDisclosurePolicy,
} from './fund-disclosure-acceptance-guards.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privateRoot = resolve(root, '.recovery-artifacts');
const authorization = '--authorized-fund-disclosure';
const inputFiles = [
  'fund-disclosure-acceptance.mjs',
  'fund-disclosure-acceptance-guards.mjs',
  'fund-disclosure-acceptance-runtime.cjs',
];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const hashes = () =>
  Object.fromEntries(
    inputFiles.map((name) => [name, hash(readFileSync(new URL(name, import.meta.url)))]),
  );
export function disclosureArguments(args) {
  if (!args.length) return { mode: 'plan' };
  if (args.length === 2 && args[0] === '--plan-file') return { mode: 'plan', path: args[1] };
  if (args.length === 4 && args[0] === '--plan-file' && args[2] === '--reuse-qualified-source')
    return { mode: 'plan', path: args[1], source: args[3] };
  assert.equal(args.at(-1), authorization);
  if (
    args.length === 3 &&
    ['--execute', '--recover', '--repair-bars', '--recover-sample'].includes(args[0])
  )
    return { mode: args[0].slice(2), path: args[1] };
  assert(args.length === 5 && args[0] === '--finish' && args[2] === '--web-evidence');
  return { mode: 'finish', path: args[1], web: args[3] };
}
export function disclosurePrivatePath(path, required = false) {
  const absolute = resolve(path);
  assert(absolute.startsWith(privateRoot + sep));
  for (let p = absolute; p.startsWith(privateRoot); p = dirname(p)) {
    if (existsSync(p)) assert(!lstatSync(p).isSymbolicLink());
    if (p === privateRoot) break;
  }
  if (required) assert(lstatSync(absolute).isFile());
  return absolute;
}
export function disclosurePointsSql(accountId) {
  if (accountId) assert.match(accountId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  return `BEGIN READ ONLY; SELECT json_build_object('hash',md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))) FROM "AccountValuationPoint" t${accountId ? ` WHERE "accountId"<>'${accountId}'::uuid` : ''}; COMMIT;`;
}
const readTarget = (accountId) => {
  const source = sourceState();
  return {
    ...readFundTarget(accountId),
    points: sql(source.containers.postgres.Id, disclosurePointsSql(accountId)),
  };
};
const load = (path) => JSON.parse(readFileSync(disclosurePrivatePath(path, true)));
export function assertDisclosureWeb(web, record) {
  assert.equal(web.caseId, record.plan.caseId);
  assert.equal(web.accountId, record.account.id);
  assert.equal(web.minuteSeriesObserved, true);
  assert.equal(web.estimatedQualityObserved, true);
  assert.equal(web.originalPreferenceRestored, true);
  assert.deepEqual(
    web.pointIds,
    record.samples.at(-1).sampling.points.map((p) => p.id),
  );
  assert.equal(
    hash(readFileSync(disclosurePrivatePath(web.screenshot, true))),
    web.screenshotSha256,
  );
}

async function main() {
  const args = disclosureArguments(process.argv.slice(2));
  let record;
  const api = async (method, path, body) => {
    const controls = [
      '/api/market-data/policy',
      '/api/market-data/providers',
      '/api/market-data/routes/capabilities?contractVersion=3',
      '/api/v1/accounts?includeInactive=true',
    ];
    if (method === 'GET') assert(controls.includes(path));
    else if (method === 'PUT') assert.equal(path, '/api/market-data/policy');
    else if (path === '/api/v1/accounts') {
      assert(record?.creationStarted && method === 'POST');
      assert.deepEqual(body, {
        name: record.plan.accountName,
        mode: 'actual',
        type: 'fund',
        currency: 'CNY',
      });
    } else {
      assertDisclosureAccount(record.account, record.plan);
      assert(
        (method === 'DELETE' && path === `/api/v1/accounts/${record.account.id}`) ||
          (method === 'POST' && path === `/api/v1/accounts/${record.account.id}/reactivate`) ||
          (method === 'POST' &&
            ['/api/v1/ledger/executions', '/api/v1/ledger/cash-flows'].includes(path) &&
            body.accountId === record.account.id &&
            body.actorId === record.plan.caseId &&
            body.source.channel === disclosureChannel),
      );
    }
    const response = await fetch('http://127.0.0.1:3000' + path, {
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
    assert(response.ok, `基金披露验收 ${method} ${path.split('?')[0]} 返回 ${response.status}`);
    return response.json();
  };
  if (args.mode === 'plan') {
    const [policy, providers, catalog] = await Promise.all([
      api('GET', '/api/market-data/policy'),
      api('GET', '/api/market-data/providers'),
      api('GET', '/api/market-data/routes/capabilities?contractVersion=3'),
    ]);
    const plan = {
      ...createDisclosurePlan(policy, providers.providers, catalog, readTarget()),
      providerState: fundProviderState(providers.providers),
      inputHashes: hashes(),
    };
    if (args.source) {
      const path = disclosurePrivatePath(args.source, true),
        prior = load(path);
      assertQualifiedDisclosureSource(prior);
      plan.adjustedPriceCase = true;
      plan.sourceReuse = { path, sha256: hash(readFileSync(path)) };
      assertDisclosurePlan(plan);
    }
    if (args.path)
      writeFileSync(disclosurePrivatePath(args.path), JSON.stringify(plan, null, 2) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
    console.log(
      JSON.stringify({
        mode: 'read-only-plan',
        caseId: plan.caseId,
        policy: policy.revision,
        accountName: plan.accountName,
        targetWritten: false,
        additions: plan.sourceReuse ? [] : plan.temporary.routes.slice(plan.original.routes.length),
        adjustedPriceCase: plan.adjustedPriceCase ?? false,
        fundSourceGets: plan.sourceReuse ? 0 : 2,
        path: args.path,
      }),
    );
    return;
  }
  const prepared = load(args.path);
  const plan = args.mode === 'execute' ? prepared : prepared.plan;
  assertDisclosurePlan(plan);
  const output = disclosurePrivatePath(
    resolve(privateRoot, `fund-disclosure-20261021-${plan.caseId.slice(0, 8)}`),
  );
  if (args.mode === 'execute') {
    assert.deepEqual(hashes(), plan.inputHashes);
    assert(!existsSync(output), '已开始的有限来源不能重跑');
    assert.deepEqual(readTarget(), plan.baseline);
    mkdirSync(output, { mode: 0o700 });
    record = { plan, phase: 'prepared', commands: {}, samples: [] };
  } else {
    assert.equal(resolve(args.path), resolve(output, 'recovery.json'));
    record = prepared;
  }
  const save = () => {
    const next = resolve(output, `recovery-${randomUUID()}.next`);
    writeFileSync(next, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(next, resolve(output, 'recovery.json'));
  };
  const run = (phase) => {
    const source = sourceState();
    assert.deepEqual(source.state.identities, plan.baseline.state.identities);
    const execution = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        source.containers['thesis-ledger'].Id,
        'node',
        '-e',
        readFileSync(new URL('fund-disclosure-acceptance-runtime.cjs', import.meta.url), 'utf8'),
      ],
      {
        input: JSON.stringify({
          phase,
          plan: {
            format: plan.format,
            caseId: plan.caseId,
            accountName: plan.accountName,
            symbol: disclosureFund,
            adjustedPriceCase: plan.adjustedPriceCase ?? false,
          },
          accountId: record.account?.id,
          source: record.source,
          prices: record.prices,
        }),
        encoding: 'utf8',
        timeout: 600000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    const lines = (execution.stdout ?? '').split('\n');
    const value = lines.find(
      (line) =>
        line.startsWith('FUND_DISCLOSURE_RESULT=') || line.startsWith('FUND_DISCLOSURE_FAILURE='),
    );
    assert(value, `目标 ${phase} 缺少有限回执`);
    const result = JSON.parse(value.slice(value.indexOf('=') + 1));
    if (execution.status !== 0) {
      record.failureEvidence = { phase, ...result };
      save();
      throw new Error(`目标 ${phase} 失败；保留原有限来源回执`);
    }
    return result;
  };
  const command = async (key) => {
    if (!record.commands[key]) {
      const action = key.replace(/2$/, '');
      assert(['deposit', 'buy', 'sell', 'withdraw'].includes(action));
      const execution = ['buy', 'sell'].includes(action);
      record.commands[key] = {
        path: execution ? '/api/v1/ledger/executions' : '/api/v1/ledger/cash-flows',
        input: {
          command: execution ? 'CREATE_EXECUTION' : 'CREATE_CASH_FLOW',
          accountId: record.account.id,
          occurredAt: new Date().toISOString(),
          timePrecision: 'INSTANT',
          sourceTimezone: 'Asia/Shanghai',
          economicOrderKey: key,
          actorId: plan.caseId,
          source: {
            category: 'MANUAL',
            channel: disclosureChannel,
            externalId: `${plan.caseId}:${key}`,
          },
          ...(execution ? { side: action === 'buy' ? 'BUY' : 'SELL' } : {}),
          payload: execution
            ? {
                symbol: disclosureFund,
                quantity: '100',
                price: '1.25',
                currency: 'CNY',
                capabilityVerification: 'UNVERIFIED',
                charges: [],
                note: '专用验收记账，不是证券委托',
              }
            : {
                direction: action === 'deposit' ? 'INFLOW' : 'OUTFLOW',
                category: action === 'deposit' ? 'DEPOSIT' : 'WITHDRAWAL',
                amount: '1000',
                currency: 'CNY',
                note: '专用验收记账，不涉及资金转移',
              },
        },
      };
      save();
    }
    const row = record.commands[key];
    if (!row.result) {
      row.result = await api('POST', row.path, row.input);
      save();
    }
  };
  const settle = async () => {
    const matches = (await api('GET', '/api/v1/accounts?includeInactive=true')).filter(
      (a) => a.name === plan.accountName,
    );
    assert(matches.length <= 1);
    if (!record.account && matches.length) {
      assert(record.creationStarted);
      record.account = matches[0];
      save();
    }
    if (!record.account) return;
    assert(matches.length === 1 && matches[0].id === record.account.id);
    assertDisclosureAccount(matches[0], plan);
    let state = run('inspect').owned;
    assertDisclosureLedger(state.events, plan);
    assert(
      (state.quantity === 0 && [0, 1000].includes(state.cashValue)) ||
        (state.quantity === 100 && state.cashValue === 875),
    );
    if (state.quantity === 100) {
      assert(state.account.active);
      await command(record.sampleRepairStarted ? 'sell2' : 'sell');
      state = run('inspect').owned;
      assert(state.quantity === 0 && state.cashValue === 1000);
    }
    if (state.cashValue === 1000) {
      await command(record.sampleRepairStarted ? 'withdraw2' : 'withdraw');
      state = run('inspect').owned;
    }
    assert(state.quantity === 0 && state.cashValue === 0);
    if (state.account.active)
      assert.equal((await api('DELETE', `/api/v1/accounts/${state.account.id}`)).active, false);
    record.settled = true;
    save();
  };
  const protect = async () => {
    assert.deepEqual(
      readTarget(record.account?.id),
      plan.baseline,
      '原业务、目录、点位或模型保护不一致',
    );
    assert.deepEqual(
      fundProviderState((await api('GET', '/api/market-data/providers')).providers),
      plan.providerState,
    );
    return {
      passed: true,
      originalTables: 13,
      originalMinutePointsUnchanged: true,
      modelRequests: 0,
    };
  };
  if (args.mode === 'finish') {
    assert.equal(record.phase, 'awaiting-web');
    record.web = load(args.web);
    assertDisclosureWeb(record.web, record);
  }
  let failure;
  if (['execute', 'repair-bars', 'recover-sample'].includes(args.mode)) {
    save();
    try {
      assert.deepEqual(
        fundProviderState((await api('GET', '/api/market-data/providers')).providers),
        plan.providerState,
      );
      if (args.mode === 'recover-sample') {
        const state = run('inspect');
        assertDisclosureSampleRecovery(record, state);
        await protect();
        writeFileSync(
          resolve(output, 'before-sample-recovery.json'),
          JSON.stringify(record, null, 2) + '\n',
          { mode: 0o600, flag: 'wx' },
        );
        record.sampleRepairStarted = true;
        record.originalRuntimeFailure = record.failure;
        delete record.failure;
        record.sampleRepairCodeHashes = hashes();
        record.samples = [
          {
            sampling: {
              points: state.points,
              recoveredStoredPoint: true,
              sourcesReusedWithoutRetiming: true,
            },
          },
        ];
        record.phase = 'sample-recovery-started';
        save();
        assert.equal(
          (await api('POST', `/api/v1/accounts/${record.account.id}/reactivate`, {})).active,
          true,
        );
      } else if (args.mode === 'repair-bars') {
        assertDisclosureBarsRepair(record);
        await protect();
        writeFileSync(
          resolve(output, 'before-bars-repair.json'),
          JSON.stringify(record, null, 2) + '\n',
          { mode: 0o600, flag: 'wx' },
        );
        record.barsRepairStarted = true;
        record.initialPrices = record.prices;
        record.initialFailure = record.failure;
        delete record.failure;
        record.repairCodeHashes = hashes();
        record.phase = 'bars-repair-started';
        save();
        record.prices = run('repair-bars');
      } else if (plan.sourceReuse) {
        const prior = load(plan.sourceReuse.path);
        assert.equal(hash(readFileSync(plan.sourceReuse.path)), plan.sourceReuse.sha256);
        assertQualifiedDisclosureSource(prior);
        record.source = prior.source;
        record.reusedSource = {
          path: plan.sourceReuse.path,
          sha256: plan.sourceReuse.sha256,
          originalObservationsPreserved: true,
          newFundDataRequests: 0,
        };
        record.phase = 'source-reused';
        save();
        record.prices = run('prices');
      } else {
        const policy = await api('GET', '/api/market-data/policy');
        assert.equal(policy.revision, plan.original.revision);
        assert.equal(fundPolicyFingerprint(policy), fundPolicyFingerprint(plan.original));
        await api('PUT', '/api/market-data/policy', {
          ...plan.temporary,
          expectedRevision: plan.original.revision,
        });
        record.phase = 'source-started';
        save();
        record.source = run('prepare');
        record.phase = 'source-qualified';
        save();
        record.prices = run('prices');
      }
      save();
      const coverage = record.source.holdings.holdings.reduce((sum, holding) => {
        const value = record.prices.prices[holding.symbol];
        return (
          sum +
          (holding.weight > 0 &&
          (plan.adjustedPriceCase
            ? record.prices.returnChecks?.[holding.symbol]?.change !== undefined
            : value?.quote?.price > 0 && value?.bars?.points.at(-1)?.close > 0)
            ? holding.weight
            : 0)
        );
      }, 0);
      assert(coverage >= 0.5, '真实底层价格覆盖不足，保留来源结果，不创建账户');
      if (args.mode !== 'recover-sample') {
        assert(
          !(await api('GET', '/api/v1/accounts?includeInactive=true')).some(
            (a) => a.name === plan.accountName,
          ),
        );
        record.creationStarted = true;
        save();
        record.account = await api('POST', '/api/v1/accounts', {
          name: plan.accountName,
          type: 'fund',
          mode: 'actual',
          currency: 'CNY',
        });
        assertDisclosureAccount(record.account, plan);
        save();
      }
      await command(record.sampleRepairStarted ? 'deposit2' : 'deposit');
      await command(record.sampleRepairStarted ? 'buy2' : 'buy');
      if (args.mode !== 'recover-sample') {
        record.samples.push(run('sample'));
        save();
      }
      const first = Date.parse(record.samples[0].sampling.points[0].at);
      const delay = Math.max(0, first + 60_100 - Date.now());
      assert(delay <= 60_000);
      if (delay) await new Promise((done) => setTimeout(done, delay));
      record.samples.push(run('sample'));
      save();
      const points = record.samples[1].sampling.points;
      assert(points.length === 2 && Date.parse(points[1].at) > Date.parse(points[0].at));
      for (const point of points) {
        assert.equal(point.valuationBasis, 'ESTIMATED');
        assert.equal(point.dataQuality, 'COMPLETE');
        assert(Number(point.pricedCoverage) >= 0.5 && Number(point.totalValue) > 875);
        assert.equal(point.evidence.funds[0].disclosureEvidence.status, 'matched');
      }
      record.phase = 'sampled';
      save();
    } catch (error) {
      failure = error;
      record.failure = error.message;
      save();
    }
  }
  try {
    await settle();
  } catch (error) {
    failure ??= error;
    record.cleanupFailure = error.message;
    save();
  }
  try {
    record.restored = await restoreDisclosurePolicy(api, plan);
    save();
  } catch (error) {
    failure ??= error;
    record.restoreFailure = error.message;
    save();
  }
  try {
    record.protection = await protect();
  } catch (error) {
    failure ??= error;
    record.protectionFailure = error.message;
    save();
  }
  if (failure) {
    record.phase = 'recovery-required';
    save();
    throw failure;
  }
  if (['execute', 'repair-bars', 'recover-sample'].includes(args.mode)) {
    assert.equal(
      (await api('POST', `/api/v1/accounts/${record.account.id}/reactivate`, {})).active,
      true,
    );
    record.phase = 'awaiting-web';
  } else record.phase = args.mode === 'finish' ? 'passed' : 'recovered';
  save();
  if (args.mode === 'finish')
    writeFileSync(resolve(output, 'report.json'), JSON.stringify(record, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
  console.log(
    JSON.stringify({
      phase: record.phase,
      output,
      accountId: record.account?.id,
      points: record.samples.at(-1)?.sampling.points.map((p) => ({
        id: p.id,
        at: p.at,
        totalValue: p.totalValue,
        pricedCoverage: p.pricedCoverage,
      })),
      restored: record.restored,
      modelRequests: 0,
    }),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
