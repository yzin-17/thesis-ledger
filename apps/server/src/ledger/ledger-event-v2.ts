import type { LedgerEventV2 } from '@thesis-ledger/schemas';

type RevisionedFactEvent = {
  factId?: string | null;
  ledgerRevision?: bigint | string | null;
  id?: string;
  eventId?: string;
};

const parseLedgerRevision = (value: bigint | string | null | undefined) => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
};

const eventIdentity = (event: RevisionedFactEvent) => event.id ?? event.eventId ?? '';

export const latestLedgerEventByFact = <T extends RevisionedFactEvent>(events: T[]) => {
  const tips = new Map<string, T>();
  for (const event of events) {
    if (!event.factId) continue;
    const current = tips.get(event.factId);
    if (!current) {
      tips.set(event.factId, event);
      continue;
    }
    const eventRevision = parseLedgerRevision(event.ledgerRevision);
    const currentRevision = parseLedgerRevision(current.ledgerRevision);
    if (eventRevision !== undefined && currentRevision !== undefined) {
      if (
        eventRevision > currentRevision ||
        (eventRevision === currentRevision && eventIdentity(event) > eventIdentity(current))
      )
        tips.set(event.factId, event);
      continue;
    }
    if (eventRevision !== undefined && currentRevision === undefined) tips.set(event.factId, event);
    else if (eventRevision === undefined && currentRevision === undefined)
      tips.set(event.factId, event);
  }
  return tips;
};

export const ledgerEventSymbol = (event: LedgerEventV2) => {
  if (event.revisionAction === 'VOID') return undefined;
  if ('symbol' in event.payload) return event.payload.symbol;
  return undefined;
};

export const ledgerEventCurrency = (event: LedgerEventV2) => {
  if (event.revisionAction === 'VOID') return 'CNY';
  if ('currency' in event.payload) return event.payload.currency;
  return 'CNY';
};

export type LedgerPositionOperation =
  | { symbol: string; kind: 'SET' | 'ADD' | 'SUBTRACT'; quantity: string }
  | { symbol: string; kind: 'RATIO'; fromUnits: string; toUnits: string };

export const ledgerEventPositionOperation = (
  event: LedgerEventV2,
): LedgerPositionOperation | undefined => {
  const symbol = ledgerEventSymbol(event);
  if (!symbol || event.revisionAction === 'VOID') return undefined;
  if (event.type === 'POSITION_BASELINE_OBSERVATION')
    return { symbol, kind: 'SET', quantity: event.payload.quantity };
  if (event.type === 'BUY_EXECUTION' || event.type === 'BONUS_SHARE')
    return { symbol, kind: 'ADD', quantity: event.payload.quantity };
  if (event.type === 'SELL_EXECUTION')
    return { symbol, kind: 'SUBTRACT', quantity: event.payload.quantity };
  if (event.type === 'SPLIT' || event.type === 'MERGE')
    return {
      symbol,
      kind: 'RATIO',
      fromUnits: event.payload.fromUnits,
      toUnits: event.payload.toUnits,
    };
  return undefined;
};
