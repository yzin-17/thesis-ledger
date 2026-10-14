import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';

// 只临时替换现金路线；原主备、其他路线及凭据不变，恢复须修订及摘要同时相等。
const [action, journal] = process.argv.slice(2);
assert(
  ['activate', 'restore'].includes(action) && journal,
  '需指定 activate/restore 和恢复记录路径',
);
const api = createLocalApi('http://127.0.0.1:3000');
const save = async (value) => {
  await writeFile(`${journal}.next`, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(`${journal}.next`, journal);
};
const current = await api.get('/api/market-data/policy');
assert(current.syncState === 'applied' && !current.effectiveStale, '政策须已同步');
if (action === 'activate') {
  assert.equal(current.revision, Number(process.argv[4]), '固定已核对政策修订');
  const provider = (await api.get('/api/market-data/providers')).providers.find(
    (row) => row.providerId === 'akshare',
  );
  assert(
    provider?.enabled && provider.configured && !provider.requiresCredential,
    '仅使用已配置启用的东财',
  );
  const baseline = desiredFromState(current);
  const temporary = structuredClone(baseline);
  const routes = temporary.routes.filter(
    (row) =>
      row.key.kind === 'data' &&
      row.key.market === 'CN' &&
      row.key.assetType === 'ETF' &&
      row.key.capability === 'CASH_DISTRIBUTION',
  );
  assert.equal(routes.length, 1);
  assert.deepEqual(
    routes[0].targets,
    [
      { providerId: 'hithink', upstreamSource: 'fund-corporate-actions-dividends' },
      { providerId: 'official-dividends', upstreamSource: 'cn-etf-cash-notices' },
    ],
    '原主备须符合已核对基线',
  );
  routes[0].targets = [{ providerId: 'akshare', upstreamSource: 'eastmoney' }];
  temporary.revision += 1;
  temporary.requestId = randomUUID();
  const record = {
    baseline,
    temporary,
    baselineFingerprint: policyFingerprint(baseline),
    temporaryFingerprint: policyFingerprint(temporary),
    phase: 'prepared',
  };
  await save(record);
  const changed = await api.put('/api/market-data/policy', {
    ...temporary,
    expectedRevision: baseline.revision,
  });
  assert.equal(changed.revision, temporary.revision);
  assert.equal(policyFingerprint(desiredFromState(changed)), record.temporaryFingerprint);
  record.phase = 'owned';
  await save(record);
  assert.equal(changed.syncState, 'applied');
  console.log(JSON.stringify({ phase: record.phase, revision: changed.revision, journal }));
} else {
  const record = JSON.parse(await readFile(journal, 'utf8'));
  assert.equal(record.baselineFingerprint, policyFingerprint(record.baseline));
  assert.equal(record.temporaryFingerprint, policyFingerprint(record.temporary));
  if (policyFingerprint(desiredFromState(current)) !== record.baselineFingerprint) {
    assert.equal(record.phase, 'owned', '缺少明确提交确认');
    assert.equal(current.revision, record.temporary.revision, '有并行修订，停止恢复');
    assert.equal(
      policyFingerprint(desiredFromState(current)),
      record.temporaryFingerprint,
      '有并行选择，停止恢复',
    );
    const restored = await api.put('/api/market-data/policy', {
      ...record.baseline,
      revision: current.revision + 1,
      requestId: randomUUID(),
      expectedRevision: current.revision,
    });
    assert.equal(policyFingerprint(desiredFromState(restored)), record.baselineFingerprint);
    assert.equal(restored.syncState, 'applied');
  }
  record.phase = 'restored';
  await save(record);
  console.log(JSON.stringify({ phase: record.phase, journal }));
}
