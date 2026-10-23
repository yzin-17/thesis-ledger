/** 目标运行验收：仅新增专用账户/策略，真实预览、冻结后清仓、按账户正式校准。 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function assertOwnedAccount(account, expected) {
  assert.match(expected.id, /^[0-9a-f-]{36}$/);
  assert.match(expected.name, /^风险与正式校准验收-\d{8}-[0-9a-f]{8}$/);
  assert.equal(account.id, expected.id);
  assert.equal(account.name, expected.name);
  assert.equal(account.mode, 'actual');
  assert.equal(account.type, 'securities');
  assert.equal(account.currency, 'CNY');
}
export function assertRuntimeTarget(container) {
  assert.equal(container.Config.Labels['com.docker.compose.project'], 'thesis-ledger-dev');
  assert.equal(container.Config.Labels['com.docker.compose.service'], 'thesis-ledger');
  assert.equal(container.State.Status, 'running');
  assert.equal(container.State.Health.Status, 'healthy');
  assert(container.Config.Env.includes('AI_RESEARCH_EXECUTION_ENABLED=false'));
}

async function run() {
  if (!process.argv.includes('--run')) {
    console.log(
      '只读预案：现行 HiThink/600000.SH/2026-10-16；新增专用账户与策略，正常记账、只读风险预览、冻结后清仓停用，再仅校准自有槽位。执行使用 --run；保留全部旧事实，不改变路由、规则启用或通知。',
    );
    return;
  }
  const root = new URL('../', import.meta.url);
  const folder = new URL('.recovery-artifacts/risk-calibration-2026-10-17/', root);
  await mkdir(folder, { recursive: true });
  const file = new URL('manifest.json', folder);
  const containerName = 'thesis-ledger-dev-thesis-ledger-1';
  const container = JSON.parse(
    execFileSync('docker', ['inspect', containerName], { encoding: 'utf8' }),
  )[0];
  assertRuntimeTarget(container);
  const baseline = JSON.parse(
    await readFile(new URL('.recovery-artifacts/futu-2026-10-16-image-backup/manifest.json', root)),
  );
  const runtime = await readFile(
    new URL('./portfolio-calibration-runtime.cjs', import.meta.url),
    'utf8',
  );
  let state;
  let failure;
  try {
    state = JSON.parse(await readFile(file));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!state)
    state = { createdAt: new Date().toISOString(), token: randomUUID().slice(0, 8), commands: [] };
  const save = () => writeFile(file, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  const api = async (path, method = 'GET', body) => {
    const prefix = path.startsWith('/market-data/') ? '/api' : '/api/v1';
    const response = await fetch(`http://127.0.0.1:3000${prefix}${path}`, {
      method,
      signal: AbortSignal.timeout(120000),
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await response.json();
    assert(
      response.ok,
      `验收 API ${method} ${path} 返回 ${response.status}: ${JSON.stringify(value.message ?? value.error ?? '请求失败')}`,
    );
    return value;
  };
  const execute = (phase) =>
    JSON.parse(
      execFileSync('docker', ['exec', '-i', containerName, 'node', '-e', runtime], {
        input: JSON.stringify({
          phase,
          accountId: state.account.id,
          accountName: state.account.name,
          valuationDate: '2026-10-16',
          database: baseline.state.database,
          estimateId: state.estimate?.id,
        }),
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
  const command = async (key, path, values) => {
    if (state.commands.some((row) => row.key === key)) return;
    const input = {
      accountId: state.account.id,
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: key,
      actorId: 'risk-calibration-acceptance',
      source: {
        category: 'MANUAL',
        channel: 'risk-calibration-acceptance',
        externalId: `${state.token}:${key}`,
      },
      ...values,
    };
    const result = await api(path, 'POST', input);
    state.commands.push({ key, input, result });
    await save();
  };
  try {
    if (!state.account) {
      const name = `风险与正式校准验收-20261017-${state.token}`;
      assert(!(await api('/accounts?includeInactive=true')).some((row) => row.name === name));
      state.account = await api('/accounts', 'POST', {
        name,
        type: 'securities',
        mode: 'actual',
        currency: 'CNY',
      });
      await save();
    }
    assertOwnedAccount(
      (await api('/accounts?includeInactive=true')).find((row) => row.id === state.account.id),
      state.account,
    );
    if (state.finishedAt) {
      assert.equal(state.finalAccount.active, false);
      assert.equal(state.calibration.originalSnapshotUnchanged, true);
      console.log(JSON.stringify({ finishedAt: state.finishedAt, reusedCompletedEvidence: true }));
      return;
    }
    if (!state.strategy) {
      const template = JSON.parse(
        await readFile(
          new URL('.recovery-artifacts/strategy-parity-2026-10-16/owned-objects.json', root),
        ),
      );
      assert.equal(template.secondVersion.id, '05653623-5378-4e52-a7b1-9e7c6f381c57');
      const schema = structuredClone(template.secondVersion.schema);
      const name = `风险消费验收-600000-20261017-${state.token}`;
      schema.name = name;
      schema.executionInstrument.symbol = '600000.SH';
      for (const source of schema.signalSources) source.asset.symbol = '600000.SH';
      state.strategy = await api('/backtests/strategies', 'POST', { name, schema });
      await save();
    }
    await command('01-deposit', '/ledger/cash-flows', {
      command: 'CREATE_CASH_FLOW',
      occurredAt: '2026-10-14T01:00:00Z',
      payload: {
        direction: 'INFLOW',
        category: 'DEPOSIT',
        amount: '10000',
        currency: 'CNY',
        note: '独立验收记账，不涉及银行转账',
      },
    });
    if (!state.instrumentConfirmation) {
      const candidates = await api('/market-data/instruments/search?q=600000&limit=20');
      const instrument = candidates.find((row) => row.symbol === '600000.SH');
      assert(instrument?.confirmable, '必须由现有目录精确确认 600000.SH 身份');
      state.instrumentConfirmation = await api(
        `/market-data/instruments/${instrument.id}/confirm`,
        'POST',
      );
      await save();
    }
    await command('02-buy', '/ledger/executions', {
      command: 'CREATE_EXECUTION',
      occurredAt: '2026-10-15T02:00:00Z',
      side: 'BUY',
      payload: {
        symbol: '600000.SH',
        quantity: '100',
        price: '10',
        currency: 'CNY',
        capabilityVerification: 'UNVERIFIED',
        charges: [],
        note: '专用验收记账；不是实际证券委托',
      },
    });
    state.riskRuntime = execute('risk');
    await save();
    if (!state.preview || state.preview.evaluations.some((row) => row.state === 'unavailable')) {
      state.preview = await api('/strategy-optimization/risk-applications/preview', 'POST', {
        strategyVersionId: state.strategy.versions[0].id,
        accountId: state.account.id,
        symbol: '600000.SH',
        cycleMode: 'existingAndFuture',
      });
      await save();
      assert(
        state.preview.evaluations.length === 3 &&
          state.preview.evaluations.every(
            (row) => row.state === 'not_triggered' || row.state === 'triggered',
          ),
      );
      assert(state.preview.context.occurredAt && state.preview.context.availableAt);
    }
    if (!state.estimate) {
      state.estimate = execute('estimate').estimate;
      await save();
    }
    await command('03-sell-cleanup', '/ledger/executions', {
      command: 'CREATE_EXECUTION',
      occurredAt: new Date().toISOString(),
      side: 'SELL',
      payload: {
        symbol: '600000.SH',
        quantity: '100',
        price: '10',
        currency: 'CNY',
        capabilityVerification: 'UNVERIFIED',
        charges: [],
        note: '专用验收清仓记账；不表示交易所实际成交',
      },
    });
    await command('04-withdraw-cleanup', '/ledger/cash-flows', {
      command: 'CREATE_CASH_FLOW',
      occurredAt: new Date().toISOString(),
      payload: {
        direction: 'OUTFLOW',
        category: 'WITHDRAWAL',
        amount: '10000',
        currency: 'CNY',
        note: '验收记账资金归零，不涉及银行转账',
      },
    });
    await api(`/accounts/${state.account.id}`, 'DELETE');
    if (!state.calibration) {
      state.calibration = execute('calibrate');
      await save();
    }
    state.finishedAt = new Date().toISOString();
    await save();
    console.log(
      JSON.stringify({
        accountId: state.account.id,
        strategyId: state.strategy.id,
        preview: state.preview.evaluations,
        estimateId: state.estimate.id,
        officialId: state.calibration.official.id,
        originalSnapshotUnchanged: state.calibration.originalSnapshotUnchanged,
      }),
    );
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (state.account) {
      try {
        assertOwnedAccount(
          (await api('/accounts?includeInactive=true')).find((row) => row.id === state.account.id),
          state.account,
        );
        if (state.commands.some((row) => row.key === '02-buy')) {
          await command('03-sell-cleanup', '/ledger/executions', {
            command: 'CREATE_EXECUTION',
            occurredAt: new Date().toISOString(),
            side: 'SELL',
            payload: {
              symbol: '600000.SH',
              quantity: '100',
              price: '10',
              currency: 'CNY',
              capabilityVerification: 'UNVERIFIED',
              charges: [],
              note: '专用验收清仓记账；不表示交易所实际成交',
            },
          });
        }
        if (state.commands.some((row) => row.key === '01-deposit')) {
          await command('04-withdraw-cleanup', '/ledger/cash-flows', {
            command: 'CREATE_CASH_FLOW',
            occurredAt: new Date().toISOString(),
            payload: {
              direction: 'OUTFLOW',
              category: 'WITHDRAWAL',
              amount: '10000',
              currency: 'CNY',
              note: '验收记账资金归零，不涉及银行转账',
            },
          });
        }
        await api(`/accounts/${state.account.id}`, 'DELETE');
        state.finalAccount = (await api('/accounts?includeInactive=true')).find(
          (row) => row.id === state.account.id,
        );
        assertOwnedAccount(state.finalAccount, state.account);
        assert.equal(state.finalAccount.active, false);
        await save();
      } catch (error) {
        state.cleanupError = error.message;
        await save();
        if (!failure) throw error;
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
