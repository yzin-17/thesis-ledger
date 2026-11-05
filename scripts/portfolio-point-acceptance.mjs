import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertOwnedAccount, assertRuntimeTarget } from './portfolio-calibration-acceptance.mjs';

const root = new URL('../', import.meta.url);
const folder = new URL('.recovery-artifacts/ui-overlays-2026-10-17/', root);
const manifest = new URL('point-manifest.json', folder);
const ownedId = '8cbb048e-9c15-480d-be49-6865679d76c7';
const ownedName = '风险与正式校准验收-20261017-0b3235a5';

export function assertPointPreparation(preflight) {
  assert.equal(preflight.account.id, ownedId);
  assert.equal(preflight.account.name, ownedName);
  assert.equal(preflight.account.active, false);
  assert.equal(preflight.ownPointCount, 0);
  assert(preflight.positions.every((row) => Number(row.quantity) === 0));
  assert(Object.values(preflight.cash).every((amount) => Number(amount) === 0));
  assert.match(preflight.nonOwnedPointsHash, /^[0-9a-f]{64}$/);
}

async function run() {
  const action = process.argv[2];
  if (!['--prepare', '--sample', '--retire'].includes(action)) {
    console.log(
      '默认只读：--prepare 恢复登记的空验收账户并记账；--sample 仅采样此账户当前分钟；--retire 清仓、现金归零并可恢复停用。不回填历史、不操作原账户。',
    );
    return;
  }
  const container = 'thesis-ledger-dev-thesis-ledger-1';
  assertRuntimeTarget(
    JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0],
  );
  const baseline = JSON.parse(
    await readFile(new URL('.recovery-artifacts/futu-2026-10-16-image-backup/manifest.json', root)),
  );
  const original = JSON.parse(
    await readFile(new URL('.recovery-artifacts/risk-calibration-2026-10-17/manifest.json', root)),
  );
  assert.equal(original.account.id, ownedId);
  assert.equal(original.account.name, ownedName);
  assert(original.finishedAt && original.calibration.originalSnapshotUnchanged);
  await mkdir(folder, { recursive: true });
  let state;
  try {
    state = JSON.parse(await readFile(manifest));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  state ??= {
    accountId: ownedId,
    accountName: ownedName,
    token: randomUUID(),
    commands: [],
    samples: [],
  };
  assert.equal(state.accountId, ownedId);
  assert.equal(state.accountName, ownedName);
  const save = () => writeFile(manifest, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  const api = async (path, method = 'GET', body) => {
    const response = await fetch('http://127.0.0.1:3000/api/v1' + path, {
      method,
      signal: AbortSignal.timeout(60000),
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await response.json();
    assert(
      response.ok,
      `${method} ${path}: ${response.status} ${JSON.stringify(value.message ?? '请求失败')}`,
    );
    return value;
  };
  const account = (await api('/accounts?includeInactive=true')).find((row) => row.id === ownedId);
  assertOwnedAccount(account, original.account);
  const runtime = await readFile(
    new URL('./portfolio-calibration-runtime.cjs', import.meta.url),
    'utf8',
  );
  const execute = (phase) =>
    JSON.parse(
      execFileSync('docker', ['exec', '-i', container, 'node', '-e', runtime], {
        input: JSON.stringify({
          phase,
          accountId: ownedId,
          accountName: ownedName,
          valuationDate: '2026-10-16',
          database: baseline.state.database,
          nonOwnedPointsHash: state.preflight?.nonOwnedPointsHash,
        }),
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
  const command = async (key, command, payload) => {
    if (state.commands.some((row) => row.key === key)) return;
    const execution = command === 'CREATE_EXECUTION';
    const input = {
      accountId: ownedId,
      command,
      occurredAt: new Date().toISOString(),
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: key,
      actorId: 'point-acceptance',
      source: {
        category: 'MANUAL',
        channel: 'point-acceptance',
        externalId: `${state.token}:${key}`,
      },
      ...(execution ? { side: key === '02-buy' ? 'BUY' : 'SELL' } : {}),
      payload,
    };
    const result = await api(
      execution ? '/ledger/executions' : '/ledger/cash-flows',
      'POST',
      input,
    );
    state.commands.push({ key, input, result });
    await save();
  };
  if (action === '--prepare') {
    assert(!state.retiredAt, '已完成的点位证据不再重复新建记账');
    if (!state.preflight) {
      state.preflight = execute('point-preflight');
      assertPointPreparation(state.preflight);
      await save();
    }
    if (!account.active) await api(`/accounts/${ownedId}/reactivate`, 'POST');
    await command('01-deposit', 'CREATE_CASH_FLOW', {
      direction: 'INFLOW',
      category: 'DEPOSIT',
      amount: '10000',
      currency: 'CNY',
      note: '当前点位专用验收记账，不涉及银行转账',
    });
    await command('02-buy', 'CREATE_EXECUTION', {
      symbol: '600000.SH',
      quantity: '100',
      price: '10',
      currency: 'CNY',
      capabilityVerification: 'UNVERIFIED',
      charges: [],
      note: '当前点位专用记账，不是证券委托',
    });
    state.preparedAt ??= new Date().toISOString();
  } else if (action === '--sample') {
    assert(state.preparedAt && !state.retiredAt);
    state.samples.push(execute('point-sample'));
  } else {
    if (state.commands.some((row) => row.key === '02-buy')) {
      await command('03-sell-cleanup', 'CREATE_EXECUTION', {
        symbol: '600000.SH',
        quantity: '100',
        price: '10',
        currency: 'CNY',
        capabilityVerification: 'UNVERIFIED',
        charges: [],
        note: '验收清仓记账，不是交易所成交',
      });
    }
    if (state.commands.some((row) => row.key === '01-deposit')) {
      await command('04-withdraw-cleanup', 'CREATE_CASH_FLOW', {
        direction: 'OUTFLOW',
        category: 'WITHDRAWAL',
        amount: '10000',
        currency: 'CNY',
        note: '验收资金归零，不涉及银行转账',
      });
    }
    state.finalAccount = await api(`/accounts/${ownedId}`, 'DELETE');
    assertOwnedAccount(state.finalAccount, original.account);
    assert.equal(state.finalAccount.active, false);
    state.final = execute('point-preflight');
    assert(state.final.positions.every((row) => Number(row.quantity) === 0));
    assert(Object.values(state.final.cash).every((amount) => Number(amount) === 0));
    assert.equal(state.final.nonOwnedPointsHash, state.preflight.nonOwnedPointsHash);
    state.retiredAt ??= new Date().toISOString();
  }
  await save();
  console.log(
    JSON.stringify({
      action,
      accountId: ownedId,
      samples: state.samples.length,
      preparedAt: state.preparedAt,
      retiredAt: state.retiredAt,
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
