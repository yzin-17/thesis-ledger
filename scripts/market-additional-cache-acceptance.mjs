import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { fundNavHistorySchema } from '../packages/schemas/dist/index.js';
import { parseCurrentFundNav, parseCurrentChip } from '../apps/server/dist/src/market/market-current-data.js';
import { additionalCacheDefinitions, createAdditionalCacheCase, executeAdditionalCacheCase,
  restoreAdditionalCacheCase } from './market-additional-cache-case.mjs';
import { readCompletedCacheRequests } from './market-cache-request-evidence.mjs';
import { probeTargetHoldings } from './market-cache-target-reader.mjs';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { localOrigin } from './market-status-functional-acceptance.mjs';

export function verifyAdditionalCacheValue(definition, raw) {
  let values;
  if (definition.capability === 'FUND_NAV') values = [parseCurrentFundNav(raw, definition.symbol)];
  else if (definition.capability === 'CHIP_SUMMARY') values = [parseCurrentChip(raw, definition.symbol)];
  else {
    assert(definition.capability === 'FUND_NAV_HISTORY', '此入口只校验三项原HTTP消费');
    values = fundNavHistorySchema.parse(raw);
    assert(values.length === 5 && values.every((point) => point.symbol === definition.symbol), '需要指定基金的五日净值');
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' });
    assert.deepEqual(values.map((point) => day.format(new Date(point.navDate))),
      ['2024-07-15', '2024-07-16', '2024-07-17', '2024-07-18', '2024-07-19']);
  }
  assert(values.every((value) => value.provider === 'akshare'), '需要原选定来源');
  if (definition.capability === 'FUND_NAV')
    assert(values.every((value) => value.freshness === 'delayed'), '最新净值需要原延迟披露状态');
  if (definition.capability === 'FUND_NAV_HISTORY') {
    for (const value of values) {
      // 原DSA投影按日期年龄标记；历史stale不等于Server末次有效缓存回退。
      const age = Math.max(0, (Date.parse(value.fetchedAt.slice(0, 10)) -
        Date.parse(new Date(value.navDate).toISOString().slice(0, 10))) / 86400000);
      assert.equal(value.freshness, age > 7 ? 'stale' : 'delayed', '历史净值必须保留原日期年龄状态');
    }
  }
  const cached = values.every((value) => value.servedFromCache === true);
  assert(cached || values.every((value) => value.servedFromCache !== true), '同次缓存标记不一致');
  return { cached, provider: 'akshare', points: values.length,
    freshness: [...new Set(values.map((value) => value.freshness).filter(Boolean))] };
}

export function createAdditionalTargetProbe(origin) {
  return async (phase, checkpoint = async () => {}) => {
    const results = [];
    for (const definition of additionalCacheDefinitions) {
      const traces = Array.from({ length: phase === 'disabled' ? 1 : 2 }, () => randomUUID());
      await checkpoint({ currentCapability: definition.capability, partialResults: [...results], traces });
      if (definition.capability === 'FUND_HOLDINGS') {
        results.push(probeTargetHoldings(phase, traces));
        await checkpoint({ currentCapability: definition.capability, partialResults: [...results] });
        continue;
      }
      // 仅使用自己的trace；留1秒日志时间边界，避免宿主/收集时间截掉开始记录。
      const since = new Date(Date.now() - 1000).toISOString();
      const values = [];
      for (const traceId of traces) {
        const url = new URL(definition.consumerPath, origin);
        if (definition.range) url.search = new URLSearchParams(Object.entries(definition.range).map(([key, value]) => [key, String(value)])).toString();
        const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: {
          'x-trace-id': traceId,
          ...(process.env.SERVER_API_TOKEN ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` } : {}),
        } });
        assert.equal(response.headers.get('x-trace-id'), traceId, '消费未关联验收trace');
        const raw = await response.json();
        if (phase === 'disabled') {
          assert(response.status === 503 && raw.error === 'control-rejected', '关闭必须沿原控制拒绝返回');
          values.push({ rejected: true });
        } else {
          assert.equal(response.status, 200, '原Server缓存消费未成功');
          values.push(verifyAdditionalCacheValue(definition, raw));
        }
      }
      const readLog = () => execFileSync('docker', ['logs', '--since', since, 'thesis-ledger-dev-thesis-ledger-1'], {
        encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const counts = await readCompletedCacheRequests(readLog, traces, definition.consumerPath);
      assert(Object.keys(counts.dataByPath).every((value) => value === definition.dataPath), '消费发起了额外缓存数据请求');
      results.push({ capability: definition.capability, layer: 'target-server-http', ...counts, traces,
        ...(phase === 'disabled' ? { rejected: true }
          : { firstCached: values[0].cached, secondCached: values[1].cached,
              points: values[0].points, freshness: values[0].freshness }) });
      await checkpoint({ currentCapability: definition.capability, partialResults: [...results] });
    }
    return results;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const origin = localOrigin(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000');
  const api = createLocalApi(origin);
  const recovery = args.indexOf('--recover');
  if (recovery >= 0) {
    assert(args.includes('--authorized-additional-cache-recovery'), '恢复需本案例独立授权');
    const destination = args[recovery + 1];
    const record = JSON.parse(await fs.readFile(destination, 'utf8'));
    assert(record.origin === origin && record.owned === true, '恢复记录目标或提交所有权不明');
    const journal = async (next) => {
      await fs.writeFile(destination + '.tmp', JSON.stringify({ ...record, ...next }, null, 2), { mode: 0o600 });
      await fs.rename(destination + '.tmp', destination);
    };
    await restoreAdditionalCacheCase(api.recovery, record.plan, record.confirmedPhase, journal);
    console.log(JSON.stringify({ phase: 'restored', caseId: record.plan.caseId }));
    return;
  }
  const [state, providers, catalog] = await Promise.all([api.get('/api/market-data/policy'),
    api.get('/api/market-data/providers'), api.get('/api/market-data/routes/capabilities?contractVersion=3')]);
  const plan = createAdditionalCacheCase(state, providers.providers, catalog);
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'read-only-preview', expectedPolicy: plan.baseline.revision,
      revisions: [0, 1, 2, 3, 4].map((step) => plan.baseline.revision + step),
      source: 'akshare/eastmoney', cases: additionalCacheDefinitions,
      changes: '临时追加四单目标功能、关闭四功能、重启验证新代次、CAS恢复原路由',
      persistence: '历史净值沿原HTTP入库此基金五日净值及必要身份；持仓原Reader无Prisma，不改Ledger',
      uncovered: '持仓为目标原Reader进程，不等同真实绩效HTTP或新冻结验收；无来源配置/故障注入' }));
    return;
  }
  assert(args.includes('--authorized-four-cache-case'), '四功能临时政策需此案例单独授权，报价授权不可复用');
  assert(args.includes(`--expected-policy=${plan.baseline.revision}`), '政策已变化，停止执行');
  const root = await fs.mkdtemp(path.join(tmpdir(), 'tl-additional-cache-'));
  const destination = path.join(root, 'recovery.json');
  let previous = {};
  const journal = async (record) => {
    previous = { ...previous, ...record };
    await fs.writeFile(destination + '.tmp', JSON.stringify({ origin, ...previous }, null, 2), { mode: 0o600 });
    await fs.rename(destination + '.tmp', destination);
  };
  console.log(`恢复记录：${destination}`);
  console.log(JSON.stringify(await executeAdditionalCacheCase(api, plan, journal, createAdditionalTargetProbe(origin))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('四缓存验收未完成；核对恢复记录。提交不明或并行变化停止覆盖。'); process.exitCode = 1; });
}
