// 本地开发比赛的显式复制入口；原比赛只读，默认仅预览。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { arenaLiveDetailSchema, arenaLiveProtocolSchema, arenaReceiptSchema, arenaCatalogResultSchema } from '../../packages/schemas/dist/index.js';
const args = process.argv.slice(2), apply = args.includes('--apply');
const value = (name) => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
const sourceId = value('--source');
assert(sourceId && /^[0-9a-f-]{36}$/i.test(sourceId), '必须用 --source 指定原比赛 UUID');
const base = 'http://127.0.0.1:3000/api/v1';
let reads = 0, writes = 0;
async function request(path, schema, method = 'GET', body) {
  if (method === 'GET') reads++; else writes++;
  const response = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert(response.ok, `本地比赛接口失败 ${response.status}`);
  return schema.parse(await response.json());
}
const original = await request('/arena-matches/' + sourceId, arenaLiveDetailSchema);
const protocol = arenaLiveProtocolSchema.parse({ ...original.protocol, title: original.protocol.title + ' · 历史回放' });
assert(protocol.startsOn, '原比赛必须设置开始日期');
const fingerprint = (input) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
const before = { startedAt: original.startedAt, state: original.state, protocol: fingerprint(original.protocol),
  accounts: fingerprint(original.agents.map((agent) => ({ id: agent.id, account: agent.account, remaining: agent.remaining }))),
  cycles: fingerprint(original.agents.flatMap((agent) => agent.cycles)) };
console.log(JSON.stringify({ action: apply ? '创建并启动历史回放比赛' : '预览历史回放比赛', sourceId, title: protocol.title,
  startsOn: protocol.startsOn, models: protocol.entrants.length, universe: protocol.universe, protocolFingerprint: fingerprint(protocol) }));
if (apply) {
  const catalog = await request('/arena-matches/catalog?kind=live&pageSize=25&search=' + encodeURIComponent(protocol.title), arenaCatalogResultSchema);
  let replay;
  for (const candidate of catalog.items.filter((item) => item.title === protocol.title).slice(0, 5)) {
    const detail = await request('/arena-matches/' + candidate.id, arenaLiveDetailSchema);
    if (fingerprint(detail.protocol) === fingerprint(protocol)) { replay = detail; break; }
  }
  if (!replay) {
    const receipt = await request('/arena-matches', arenaReceiptSchema, 'POST', protocol);
    replay = await request('/arena-matches/' + receipt.id, arenaLiveDetailSchema);
  }
  assert.notEqual(replay.id, sourceId);
  if (replay.state === 'draft') await request('/arena-matches/' + replay.id + '/start', arenaReceiptSchema, 'POST');
  // 留出一轮正式调度窗口，仅复核一次；来源未就绪时不触发重试。
  await new Promise((done) => setTimeout(done, 6500));
  replay = await request('/arena-matches/' + replay.id, arenaLiveDetailSchema);
  const after = await request('/arena-matches/' + sourceId, arenaLiveDetailSchema);
  assert.equal(after.startedAt, before.startedAt); assert.equal(after.state, before.state);
  assert.equal(fingerprint(after.protocol), before.protocol);
  assert.equal(fingerprint(after.agents.map((agent) => ({ id: agent.id, account: agent.account, remaining: agent.remaining }))), before.accounts);
  assert.equal(fingerprint(after.agents.flatMap((agent) => agent.cycles)), before.cycles);
  const receipt = { sourceId, replayId: replay.id, title: protocol.title, startsOn: protocol.startsOn, state: replay.state,
    timeline: replay.timeline, frames: replay.frames.length, researchCycles: replay.agents.reduce((n, agent) => n + agent.cycles.length, 0),
    originalRecordsPreserved: true, reads, writes, observedAt: new Date().toISOString() };
  const output = resolve(value('--output') ?? '/tmp/arena-replay-create-receipt.json');
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ ...receipt, receiptPath: output }));
}
