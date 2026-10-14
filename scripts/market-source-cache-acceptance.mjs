import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { localOrigin } from './market-status-functional-acceptance.mjs';
import { targetProbe } from './market-cache-generation-acceptance.mjs';
import { createSourceCacheCase, executeSourceCacheCase } from './market-source-cache-case.mjs';

const args = process.argv.slice(2);
const origin = localOrigin(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000');
const api = createLocalApi(origin);
const state = await api.get('/api/market-data/policy');
const providers = await api.get('/api/market-data/providers');
const plan = createSourceCacheCase(state, providers.providers);
if (!args.includes('--execute')) {
  console.log(JSON.stringify({ mode: 'read-only-preview', policy: plan.baseline.revision,
    configVersions: [plan.configVersion, plan.configVersion + 1, plan.configVersion + 2],
    symbol: '600519.SH', change: '仅HiThink enabled关闭/恢复，影响全部HiThink产品能力，正常预计少于60秒',
    boundary: '无政策PUT、目标/凭据/认证方法/准入/Ledger变更或故障注入；未知提交/并行变化停止覆盖',
    evidence: '原Server报价HTTP及Reader数据发起次数，不称HTTP重试数或SDK页数' }));
} else {
  assert(args.includes('--authorized-source-config-cache-case') &&
    args.includes(`--expected-policy=${plan.baseline.revision}`) &&
    args.includes(`--expected-config=${plan.configVersion}`), '需本案例精确授权及当前政策/配置代次');
  const destination = path.join(await fs.mkdtemp(path.join(tmpdir(), 'tl-source-cache-')), 'recovery.json');
  let previous = {};
  const journal = async (record) => {
    previous = { ...previous, ...record };
    await fs.writeFile(destination + '.tmp', JSON.stringify({ origin, ...previous }, null, 2), { mode: 0o600 });
    await fs.rename(destination + '.tmp', destination);
  };
  console.log(`恢复记录：${destination}`);
  try { console.log(JSON.stringify(await executeSourceCacheCase(api, plan, journal, targetProbe(origin)))); }
  catch { console.error('源配置缓存验收未完成；核对0600恢复记录，不覆盖未知提交或并行修改。'); process.exitCode = 1; }
}
