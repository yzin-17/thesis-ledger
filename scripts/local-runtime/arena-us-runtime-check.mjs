// 有界运行态验收：两个既有富途报价，以及一个固定官方资料检查批次。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleMonitorCheckSchema, ruleMonitorJobResponseSchema, ruleMonitorStatusSchema } from '../../packages/schemas/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [mode, output] = process.argv.slice(2);
assert(['quotes', 'rules'].includes(mode));
assert(output && resolve(output).startsWith(resolve(root, 'var/acceptance') + '/'));
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
async function request(path, method = 'GET', body) {
  const response = await fetch('http://127.0.0.1:3000' + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert(response.ok, '运行态接口失败：' + response.status);
  return response.json();
}
if (mode === 'quotes') {
  assert(!existsSync(output), '报价验收已有回执，不重复读取');
  const results = [];
  for (const [symbol, assetType] of [['AAPL.US', 'STOCK'], ['SPY.US', 'ETF']]) {
    const quote = await request('/api/market/' + symbol + '/quote?assetType=' + assetType);
    results.push({ symbol, assetType, quote });
  }
  save(output, { observedAt: new Date().toISOString(), results });
  for (const { symbol, assetType, quote } of results) {
    assert.equal(quote.provider, 'futu'); assert.equal(quote.upstreamSource, 'futu');
    assert.equal(quote.units?.priceCurrency, 'USD');
    assert.equal(quote.executionFacts?.assetType, assetType);
    assert.equal(quote.executionFacts?.tradingState, 'normal');
    assert(quote.executionFacts?.securityId && quote.executionFacts?.sharesPerLot);
    assert.equal(quote.executionRules?.provider, 'official-us-rules');
    console.log(JSON.stringify({ symbol, freshness: quote.freshness, marketTime: quote.marketTime,
      exchange: quote.executionFacts.exchange, lot: quote.executionFacts.sharesPerLot,
      rulesVerifiedThrough: quote.executionRules.verifiedThrough }));
  }
} else {
  const base = '/api/market-data/rule-monitor';
  const before = ruleMonitorStatusSchema.parse(await request(base));
  const intent = output + '.intent.json';
  let input;
  if (existsSync(intent)) input = ruleMonitorCheckSchema.parse(JSON.parse(readFileSync(intent)));
  else {
    input = ruleMonitorCheckSchema.parse({ version: 'rule-source-monitor-v1', requestId: randomUUID(), sourceIds: ['official-us-rules/us-live-cash-equity'] });
    save(intent, { ...input });
    const queued = ruleMonitorJobResponseSchema.parse(await request(base + '/checks', 'POST', input));
    assert.equal(queued.run.id, input.requestId);
  }
  // 重启此命令只读既有任务，不补发或创建第二批。
  let run;
  for (let n = 0; n < 40; n++) {
    run = ruleMonitorJobResponseSchema.parse(await request(base + '/checks/' + input.requestId)).run;
    if (!['queued', 'running'].includes(run.status)) break;
    await new Promise(done => setTimeout(done, 5000));
  }
  const after = ruleMonitorStatusSchema.parse(await request(base));
  const result = { run, configPreserved: JSON.stringify(before.config) === JSON.stringify(after.config),
    observations: after.observations.filter(row => row.identity === input.sourceIds[0] || row.kind === 'document'),
    observedAt: new Date().toISOString() };
  save(output, result);
  console.log(JSON.stringify({ runId: run.id, status: run.status, counts: run.counts, errorCode: run.errorCode, configPreserved: result.configPreserved }));
  assert(result.configPreserved); assert.equal(run.status, 'succeeded'); assert.equal(run.counts.documents, 6); assert.equal(run.counts.unavailable, 0);
}
