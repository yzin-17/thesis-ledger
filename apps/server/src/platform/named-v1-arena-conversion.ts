import { isDeepStrictEqual } from 'node:util';
import {
  arenaLiveAccountSchema, arenaLiveDecisionSchema, arenaLiveProtocolSchema, arenaLiveRemainingBudgetSchema,
  arenaProtocolSchema,
} from '@thesis-ledger/schemas';

type Json = Record<string, unknown>;

export function convertArenaProtocol(source: Json, historical = false) {
  const version = historical ? 'arena-historical-match-protocol-v1' : 'arena-live-match-protocol-v1';
  if (source.version !== (historical ? 1 : 2) && source.version !== version) return null;
  const converted = { ...source, version };
  const parsed = (historical ? arenaProtocolSchema : arenaLiveProtocolSchema).safeParse(converted);
  return parsed.success && isDeepStrictEqual(parsed.data, converted) ? converted : null;
}

export function convertArenaMatch(row: Json, historical = false) {
  const protocol = convertArenaProtocol(row.protocol as Json, historical);
  if (!protocol || (!historical && !arenaLiveRemainingBudgetSchema.safeParse(row.remaining).success))
    throw new Error('比赛协议或余额无法等价转换');
  return { ...row, protocol };
}

export function convertArenaCycle(row: Json) {
  const reservation = row.reservation as Json | null;
  if (row.state === 'running' || row.leaseUntil !== null || reservation?.settled === false)
    throw new Error('轮次仍持有执行权或未结算预留');
  if (row.decision !== null) arenaLiveDecisionSchema.parse(row.decision);
  if (row.input === null) {
    if (row.state === 'pending' && (row.requestId !== null || reservation))
      throw new Error('待办轮次已有调用或预留');
    return row;
  }
  const input = row.input as Json;
  const protocol = convertArenaProtocol(input.protocol as Json);
  if (!protocol || row.state === 'pending' || arenaLiveAccountSchema.parse(input.account).revision !== row.bookRevision)
    throw new Error('已冻结轮次协议或账户无法等价转换');
  return { ...row, input: { ...input, protocol } };
}
