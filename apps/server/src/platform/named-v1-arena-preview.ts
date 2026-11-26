import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  arenaLiveAccountSchema,
  arenaLiveDecisionSchema,
  arenaLiveRemainingBudgetSchema,
} from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from '../backtest/backtest-snapshot.js';
import { convertArenaProtocol } from './named-v1-arena-conversion.js';

const id = z.uuid();
const object = z.record(z.string(), z.unknown());
const matchSchema = z.strictObject({
  id,
  state: z.string(),
  protocol: object,
  remaining: z.unknown(),
  valuations: z.number().int().nonnegative(),
  timelines: z.number().int().nonnegative(),
  agents: z.array(z.strictObject({ id, account: z.unknown(), remaining: z.unknown() })),
  cycles: z.array(z.strictObject({
    id,
    agentId: id,
    state: z.string(),
    attempt: z.number().int().nonnegative(),
    bookRevision: z.number().int().nonnegative(),
    inputProtocol: object.nullable(),
    frozenAccount: z.unknown().optional(),
    decision: z.unknown(),
    requestId: id.nullable(),
    hasReservation: z.boolean().optional(),
    generationContracts: z.array(z.string()),
  })),
});

const matches = z.array(matchSchema).parse(JSON.parse(readFileSync(0, 'utf8')));
const summaries = matches.map((match) => {
  const accountRevisions = new Map(match.agents.map(({ id, account }) => {
    const parsed = arenaLiveAccountSchema.safeParse(account);
    return [id, parsed.success ? parsed.data.revision : null];
  }));
  const issues: string[] = [];
  const protocol = convertArenaProtocol(match.protocol);
  if (!protocol) issues.push('比赛配置缺少可证明的等价转换');
  if (!arenaLiveRemainingBudgetSchema.safeParse(match.remaining).success ||
      match.agents.some(({ id, remaining }) =>
        accountRevisions.get(id) === null || !arenaLiveRemainingBudgetSchema.safeParse(remaining).success))
    issues.push('账户或预算无法按当前结构读回');
  const generationContracts = [...new Set(match.cycles.flatMap((cycle) => cycle.generationContracts))].sort();
  if (match.cycles.some((cycle) => cycle.state === 'running'))
    issues.push('存在执行中的轮次');
  if (match.cycles.some((cycle) => cycle.inputProtocol !== null && !convertArenaProtocol(cycle.inputProtocol)))
    issues.push('轮次冻结协议缺少可证明的等价转换');
  if (match.cycles.some((cycle) => cycle.frozenAccount !== null && cycle.frozenAccount !== undefined &&
      arenaLiveAccountSchema.safeParse(cycle.frozenAccount).data?.revision !== cycle.bookRevision))
    issues.push('轮次冻结账户与原账簿修订不一致');
  if (match.cycles.some((cycle) => cycle.decision !== null && !arenaLiveDecisionSchema.safeParse(cycle.decision).success))
    issues.push('已保存决策无法按现行结构读回');
  return {
    id: match.id,
    state: match.state,
    protocolVersion: match.protocol.version,
    protocolHash: protocol ? hashCanonicalManifest(protocol) : null,
    generationContracts,
    agents: match.agents.length,
    cycles: match.cycles.length,
    valuations: match.valuations,
    timelines: match.timelines,
    issues,
    pending: match.cycles.filter((c) => c.state === 'pending').map((cycle) => ({
      id: cycle.id,
      attempt: cycle.attempt,
      bookRevision: cycle.bookRevision,
      currentBookRevision: accountRevisions.get(cycle.agentId) ?? null,
      hasFrozenProtocol: cycle.inputProtocol !== null,
      hasProviderRequest: cycle.requestId !== null,
      ...(cycle.hasReservation === undefined ? {} : { hasReservation: cycle.hasReservation }),
    })),
  };
});
process.stdout.write(JSON.stringify({ contract: 'arena-match-migration-preview-v1', matches: summaries }) + '\n');
