import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { arenaAdjustLiveBudget } from '@thesis-ledger/domain';
import { arenaLiveRemainingBudgetSchema, arenaLiveProtocolSchema, type ArenaLiveBudget } from '@thesis-ledger/schemas';

const id = z.uuid();
const natural = z.number().int().nonnegative().safe();
const debit = z.strictObject({ requests: natural, tokens: natural, costMicros: natural });
const call = z.strictObject({
  requestId: id, state: z.enum(['settled', 'unknown_usage', 'reserved']),
  sentAt: z.iso.datetime({ offset: true }), reserved: debit, used: debit.nullable(),
});
const ledger = z.strictObject({
  matches: z.array(z.strictObject({ id, state: z.string(), protocol: z.record(z.string(), z.unknown()),
    remaining: arenaLiveRemainingBudgetSchema })),
  agents: z.array(z.strictObject({ id, matchId: id, providerId: z.string(), model: z.string(),
    remaining: arenaLiveRemainingBudgetSchema, bookRevision: natural })),
  cycles: z.array(z.strictObject({
    id, matchId: id, agentId: id, state: z.string(), attempt: natural, bookRevision: natural,
    leaseUntil: z.string().nullable(), requestId: id.nullable(), hasInput: z.boolean(),
    reservation: z.strictObject({ requestId: id, amount: debit, settled: z.boolean() }).nullable(),
    calls: z.array(call),
  })),
  archiveRefs: z.array(z.string().regex(/^arena-history\/[0-9a-f]{64}\.json$/u)),
  historical: z.record(z.string(), natural),
});

const source = ledger.parse(JSON.parse(readFileSync(0, 'utf8')));
const issues: Array<{ id: string; reason: string }> = [];
const requests = new Set<string>();
const agentDebits = new Map<string, z.infer<typeof call>[]>();
const matchDebits = new Map<string, z.infer<typeof call>[]>();
const agents = new Map(source.agents.map((agent) => [agent.id, agent]));
const protocols = new Map(source.matches.map((match) => {
  if (match.protocol.version !== 2 && match.protocol.version !== 'arena-live-match-protocol-v1')
    issues.push({ id: match.id, reason: '比赛协议无法识别' });
  return [match.id, arenaLiveProtocolSchema.parse({ ...match.protocol, version: 'arena-live-match-protocol-v1' })];
}));
let unknownUsage = 0;
for (const cycle of source.cycles) {
  const agent = agents.get(cycle.agentId);
  const latest = cycle.calls.at(-1);
  if (!agent || agent.matchId !== cycle.matchId || !protocols.has(cycle.matchId))
    issues.push({ id: cycle.id, reason: '轮次归属与比赛账户不一致' });
  if (cycle.state === 'running' || cycle.leaseUntil || cycle.reservation?.settled === false)
    issues.push({ id: cycle.id, reason: '轮次仍持有执行权或未结算预留' });
  if (cycle.state === 'pending' && (cycle.calls.length || cycle.hasInput || cycle.bookRevision !== agent?.bookRevision))
    issues.push({ id: cycle.id, reason: '待办存在已使用输入、调用数据或不同账簿修订' });
  if (cycle.requestId !== (cycle.calls[0]?.requestId ?? null) ||
      (latest && (latest.requestId !== cycle.reservation?.requestId ||
        !isDeepStrictEqual(latest.reserved, cycle.reservation.amount))) ||
      (!latest && cycle.reservation !== null))
    issues.push({ id: cycle.id, reason: '请求入口与最后一笔预算预留无法对账' });
  for (const receipt of cycle.calls) {
    if (requests.has(receipt.requestId) || receipt.state === 'reserved' ||
        (receipt.state === 'settled') !== (receipt.used !== null))
      issues.push({ id: cycle.id, reason: '存在重复请求或尚未固定用量结论' });
    requests.add(receipt.requestId);
    if (receipt.state === 'unknown_usage') unknownUsage += 1;
    if (!agentDebits.has(cycle.agentId)) agentDebits.set(cycle.agentId, []);
    if (!matchDebits.has(cycle.matchId)) matchDebits.set(cycle.matchId, []);
    agentDebits.get(cycle.agentId)!.push(receipt);
    matchDebits.get(cycle.matchId)!.push(receipt);
  }
}

function verifyBudget(id: string, limit: ArenaLiveBudget, remaining: ArenaLiveBudget, calls: z.infer<typeof call>[]) {
  try {
    const reconstructed = calls.sort((left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt))
      .reduce((current, item) => arenaAdjustLiveBudget(
        arenaAdjustLiveBudget(current, item.reserved, null, false), item.reserved, item.used, true,
      ), limit);
    if (!isDeepStrictEqual(reconstructed, remaining))
      issues.push({ id, reason: '剩余额度与逐次预算扣账不一致' });
  } catch {
    issues.push({ id, reason: '原请求顺序无法按初始额度重放' });
  }
}
for (const match of source.matches)
  verifyBudget(match.id, protocols.get(match.id)!.budget, match.remaining, matchDebits.get(match.id) ?? []);
for (const agent of source.agents) {
  const entrant = protocols.get(agent.matchId)?.entrants.find(
    (item) => item.providerId === agent.providerId && item.model === agent.model,
  );
  if (entrant) verifyBudget(agent.id, entrant.budget, agent.remaining, agentDebits.get(agent.id) ?? []);
  else issues.push({ id: agent.id, reason: '账户未匹配原参赛模型及预算' });
}
const pending = source.cycles.filter((cycle) => cycle.state === 'pending').map((cycle) => ({
  id: cycle.id, matchId: cycle.matchId, attempt: cycle.attempt, jobId: cycle.id + '-' + (cycle.attempt + 1),
}));
console.log(JSON.stringify({
  contract: 'named-v1-arena-ledger-v1', matches: source.matches.length, accounts: source.agents.length,
  cycles: source.cycles.length, requests: requests.size, unknownUsage,
  pending, archiveRefs: source.archiveRefs, historical: source.historical, issues,
}));
if (issues.length) process.exitCode = 1;
