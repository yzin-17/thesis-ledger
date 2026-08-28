import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  tradeDetailResponseSchemaV2,
  tradeListQuerySchemaV2,
  tradeListResponseSchemaV2,
  tradeReferenceResolveRequestSchemaV2,
  tradeReferenceResolveResponseSchemaV2,
  tradeCloseSliceQueryResponseSchemaV2,
  type TradeDetailResponseV2,
  type TradeListResponseV2,
  type TradeReferenceResolveResponseV2,
  type TradeCloseSliceQueryResponseV2,
} from '@thesis-ledger/schemas';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';

const tradeDetailInclude = {
  entryLegs: true,
  baselineComponents: true,
  corporateActions: true,
  closeSlices: { include: { allocations: true } },
  dividendAttributions: true,
  evidenceSources: true,
} as const;

type PersistedTrade = Prisma.TradeGetPayload<{ include: typeof tradeDetailInclude }>;

type TradeCursor = {
  version: 1;
  accountId: string | null;
  mode: 'actual' | 'shadow';
  projectionGenerations: Record<string, string>;
  after: { openedAt: string | null; id: string };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decimalString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  return null;
};

const isoDateTime = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};

const jsonArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const stringArray = (value: unknown): string[] =>
  jsonArray(value).filter((item): item is string => typeof item === 'string');

const charges = (value: unknown) =>
  jsonArray(value) as TradeDetailResponseV2['entryLegs'][number]['charges'];

const source = (value: unknown) => {
  const record = isRecord(value) ? value : {};
  const category = ['MANUAL', 'IMPORT', 'INTEGRATION', 'MIGRATION'].includes(
    String(record.category),
  )
    ? (String(record.category) as 'MANUAL' | 'IMPORT' | 'INTEGRATION' | 'MIGRATION')
    : 'MIGRATION';
  const channel =
    typeof record.channel === 'string' && record.channel.trim() ? record.channel : 'legacy';
  return {
    category,
    channel,
    ...(typeof record.externalId === 'string' ? { externalId: record.externalId } : {}),
    ...(typeof record.draftId === 'string' ? { draftId: record.draftId } : {}),
    ...(typeof record.sourceRowId === 'string' ? { sourceRowId: record.sourceRowId } : {}),
  };
};

const excludedReasons = (trade: PersistedTrade): string[] => {
  const reasons: string[] = [];
  if (trade.lifecycle !== 'ENDED') reasons.push('LIFECYCLE_ACTIVE');
  if (trade.endEvidence !== 'SELL_EXECUTION') reasons.push('END_EVIDENCE_NOT_SELL');
  if (trade.costEstimated) reasons.push('COST_ESTIMATED');
  if (trade.netRealizedPnl === null) reasons.push('NET_PNL_UNAVAILABLE');
  if (trade.completeness !== 'COMPLETE') reasons.push('EVIDENCE_INCOMPLETE');
  return reasons;
};

const tradeFactIds = (trade: PersistedTrade) =>
  new Set([
    ...trade.entryLegs.map((item) => item.factId),
    ...trade.baselineComponents.map((item) => item.factId),
    ...trade.corporateActions.map((item) => item.factId),
    ...trade.closeSlices.map((item) => item.factId),
    ...trade.dividendAttributions.map((item) => item.factId),
    ...trade.evidenceSources.map((item) => item.factId),
  ]);

const mapSummary = (trade: PersistedTrade): TradeListResponseV2['items'][number] => ({
  id: trade.id,
  accountId: trade.accountId,
  accountMode: trade.accountMode,
  symbol: trade.symbol,
  lifecycle: trade.lifecycle,
  exitProgress: trade.exitProgress,
  endEvidence: trade.endEvidence,
  openedAt: isoDateTime(trade.openedAt),
  closedAt: isoDateTime(trade.closedAt),
  earliestEvidenceAt: isoDateTime(trade.earliestEvidenceAt),
  sourceQuantity: decimalString(trade.sourceQuantity)!,
  closedQuantity: decimalString(trade.closedQuantity)!,
  remainingQuantity: decimalString(trade.remainingQuantity)!,
  grossRealizedPnl: decimalString(trade.grossRealizedPnl),
  netRealizedPnl: decimalString(trade.netRealizedPnl),
  realizedNetReturnRate: decimalString(trade.realizedNetReturnRate),
  costEstimated: trade.costEstimated,
  completeness: trade.completeness,
  issues: stringArray(trade.issues),
  costIssues: stringArray(trade.costIssues),
  algorithmVersion: trade.algorithmVersion,
  projectionFingerprint: trade.projectionFingerprint ?? null,
  projectionGeneration: trade.projectionGeneration.toString(),
  excludedReasons: excludedReasons(trade),
});

const mapDetail = (trade: PersistedTrade): TradeDetailResponseV2 =>
  tradeDetailResponseSchemaV2.parse({
    ...mapSummary(trade),
    entryLegs: trade.entryLegs.map((entry) => ({
      id: entry.id,
      eventId: entry.eventId,
      factId: entry.factId,
      occurredAt: isoDateTime(entry.occurredAt),
      currency: entry.currency,
      price: decimalString(entry.price)!,
      originalQuantity: decimalString(entry.originalQuantity)!,
      quantity: decimalString(entry.quantity)!,
      remainingQuantity: decimalString(entry.remainingQuantity)!,
      rawCost: decimalString(entry.rawCost),
      remainingCost: decimalString(entry.remainingCost),
      rawCostEstimated: entry.rawCostEstimated,
      charges: charges(entry.charges),
    })),
    baselineComponents: trade.baselineComponents.map((component) => ({
      id: component.id,
      eventId: component.eventId,
      factId: component.factId,
      batchId: component.batchId,
      batchScope: component.batchScope as 'FULL' | 'PARTIAL',
      occurredAt: isoDateTime(component.occurredAt),
      currency: component.currency,
      observedQuantity: decimalString(component.observedQuantity)!,
      quantity: decimalString(component.quantity)!,
      remainingQuantity: decimalString(component.remainingQuantity)!,
      averageCost: decimalString(component.averageCost),
      rawCost: decimalString(component.rawCost),
      remainingCost: decimalString(component.remainingCost),
      rawCostEstimated: component.rawCostEstimated,
      costIncludesFees: component.costIncludesFees as 'INCLUDES_FEES' | 'EXCLUDES_FEES' | 'UNKNOWN',
      reconciledExecutionFactIds: stringArray(component.reconciledExecutionFactIds),
      reconciliationFactIds: stringArray(component.reconciliationFactIds),
    })),
    corporateActions: trade.corporateActions.map((action) => ({
      id: action.id,
      eventId: action.eventId,
      factId: action.factId,
      type: action.type as 'BONUS_SHARE' | 'SPLIT' | 'MERGE',
      occurredAt: isoDateTime(action.occurredAt),
      quantity: decimalString(action.quantity),
      fromUnits: decimalString(action.fromUnits),
      toUnits: decimalString(action.toUnits),
      positionQuantityBefore: decimalString(action.positionQuantityBefore)!,
      positionQuantityAfter: decimalString(action.positionQuantityAfter)!,
    })),
    closeSlices: trade.closeSlices.map((slice) => ({
      id: slice.id,
      eventId: slice.eventId,
      factId: slice.factId,
      occurredAt: isoDateTime(slice.occurredAt),
      currency: slice.currency,
      price: decimalString(slice.price),
      quantity: decimalString(slice.quantity)!,
      remainingQuantityAfter: decimalString(slice.remainingQuantityAfter)!,
      charges: charges(slice.charges),
      grossRealizedPnl: decimalString(slice.grossRealizedPnl),
      netRealizedPnl: decimalString(slice.netRealizedPnl),
      realizedNetReturnRate: decimalString(slice.realizedNetReturnRate),
      costEstimated: slice.costEstimated,
      allocations: slice.allocations.map((allocation) => ({
        id: allocation.id,
        source: allocation.source as 'ENTRY_LEG' | 'BASELINE_COMPONENT',
        sourceEventId: allocation.sourceEventId,
        sourceFactId: allocation.sourceFactId,
        quantity: decimalString(allocation.quantity)!,
        originalCost: decimalString(allocation.originalCost),
        allocatedBuyCharges: charges(allocation.allocatedBuyCharges),
      })),
    })),
    dividendAttributions: trade.dividendAttributions.map((dividend) => ({
      id: dividend.id,
      eventId: dividend.eventId,
      factId: dividend.factId,
      occurredAt: isoDateTime(dividend.occurredAt),
      amount: decimalString(dividend.amount)!,
      currency: dividend.currency,
    })),
    evidenceSources: trade.evidenceSources.map((evidence) => ({
      id: evidence.id,
      kind: evidence.kind as
        | 'EXECUTION'
        | 'BASELINE_OBSERVATION'
        | 'BASELINE_RECONCILIATION'
        | 'CORPORATE_ACTION'
        | 'DIVIDEND',
      eventId: evidence.eventId,
      factId: evidence.factId,
      source: source(evidence.source),
    })),
  });

const openedAtKey = (trade: PersistedTrade) => isoDateTime(trade.openedAt);

const compareTrades = (left: PersistedTrade, right: PersistedTrade) => {
  const leftOpenedAt = openedAtKey(left);
  const rightOpenedAt = openedAtKey(right);
  if (leftOpenedAt === null && rightOpenedAt !== null) return 1;
  if (leftOpenedAt !== null && rightOpenedAt === null) return -1;
  if (leftOpenedAt !== rightOpenedAt)
    return (rightOpenedAt ?? '').localeCompare(leftOpenedAt ?? '');
  return right.id.localeCompare(left.id);
};

const encodeCursor = (cursor: TradeCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url');

const decodeCursor = (raw: string): TradeCursor => {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!isRecord(parsed) || parsed.version !== 1) throw new Error('version');
    if (parsed.accountId !== null && typeof parsed.accountId !== 'string')
      throw new Error('account');
    if (parsed.mode !== 'actual' && parsed.mode !== 'shadow') throw new Error('mode');
    if (!isRecord(parsed.projectionGenerations) || !isRecord(parsed.after))
      throw new Error('shape');
    if (typeof parsed.after.id !== 'string') throw new Error('after');
    if (parsed.after.openedAt !== null && typeof parsed.after.openedAt !== 'string')
      throw new Error('openedAt');
    const projectionGenerations: Record<string, string> = {};
    for (const [accountId, generation] of Object.entries(parsed.projectionGenerations)) {
      if (
        !/^[0-9a-f-]{36}$/i.test(accountId) ||
        typeof generation !== 'string' ||
        !/^\d+$/.test(generation)
      )
        throw new Error('generations');
      projectionGenerations[accountId] = generation;
    }
    return {
      version: 1,
      accountId: parsed.accountId,
      mode: parsed.mode,
      projectionGenerations,
      after: {
        openedAt: parsed.after.openedAt,
        id: parsed.after.id,
      },
    };
  } catch {
    throw new BadRequestException({
      errorCode: 'TRADE_CURSOR_INVALID',
      message: '交易列表游标无效，请刷新后重试',
    });
  }
};

const sameMap = (left: Record<string, string>, right: Record<string, string>) => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (
    leftKeys.length !== rightKeys.length ||
    leftKeys.some((key, index) => key !== rightKeys[index])
  )
    return false;
  return leftKeys.every((key) => left[key] === right[key]);
};

const generationConflict = () =>
  new ConflictException({
    errorCode: 'PROJECTION_GENERATION_CONFLICT',
    message: '交易数据已更新，请刷新后重试',
  });

@Injectable()
export class TradeQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(rawQuery: unknown): Promise<TradeListResponseV2> {
    const query = tradeListQuerySchemaV2.parse(rawQuery);
    const accountIds = await this.accountIds(query.accountId, query.mode);
    const projectionGenerations = await this.projectionGenerations(accountIds);
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (cursor) {
      if (
        cursor.mode !== query.mode ||
        cursor.accountId !== (query.accountId ?? null) ||
        !sameMap(cursor.projectionGenerations, projectionGenerations)
      )
        throw generationConflict();
    }

    const where: Prisma.TradeWhereInput = {
      accountMode: query.mode,
      account: { mode: query.mode },
      ...(query.accountId === undefined ? {} : { accountId: query.accountId }),
      ...(query.symbol === undefined ? {} : { symbol: query.symbol }),
      ...(query.lifecycle === undefined ? {} : { lifecycle: query.lifecycle }),
    };
    const trades = (await this.prisma.trade.findMany({
      where,
      include: tradeDetailInclude,
    })) as PersistedTrade[];
    const ordered = trades.sort(compareTrades);
    let start = 0;
    if (cursor) {
      start = ordered.findIndex(
        (trade) => trade.id === cursor.after.id && openedAtKey(trade) === cursor.after.openedAt,
      );
      if (start === -1) throw generationConflict();
      start += 1;
    }
    const page = ordered.slice(start, start + query.limit);
    const hasNextPage = start + page.length < ordered.length;
    const last = page.at(-1);
    const nextCursor =
      hasNextPage && last
        ? encodeCursor({
            version: 1,
            accountId: query.accountId ?? null,
            mode: query.mode,
            projectionGenerations,
            after: { openedAt: openedAtKey(last), id: last.id },
          })
        : null;
    return tradeListResponseSchemaV2.parse({
      accountId: query.accountId ?? null,
      mode: query.mode,
      items: page.map(mapSummary),
      nextCursor,
      projectionGenerations,
    });
  }

  async get(accountId: string, tradeId: string, mode: 'actual' | 'shadow' = 'actual') {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: tradeDetailInclude,
    });
    if (!trade || trade.accountId !== accountId || trade.accountMode !== mode)
      throw new NotFoundException('Trade 不存在');
    return mapDetail(trade);
  }

  async listDetails(input: {
    accountId: string;
    mode?: 'actual' | 'shadow';
    symbol?: string;
  }): Promise<TradeDetailResponseV2[]> {
    const mode = input.mode ?? 'actual';
    const trades = (await this.prisma.trade.findMany({
      where: {
        accountId: input.accountId,
        accountMode: mode,
        ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
      },
      include: tradeDetailInclude,
    })) as PersistedTrade[];
    return trades.sort(compareTrades).map(mapDetail);
  }

  async readVersion(accountId: string) {
    const state = await this.prisma.accountLedgerState.findUnique({
      where: { accountId },
      select: { ledgerRevision: true, projectionGeneration: true },
    });
    return {
      ledgerRevision: state?.ledgerRevision.toString() ?? '0',
      projectionGeneration: state?.projectionGeneration.toString() ?? '0',
    };
  }

  async closeSlice(
    accountId: string,
    tradeId: string,
    sliceId: string,
    mode: 'actual' | 'shadow' = 'actual',
  ): Promise<TradeCloseSliceQueryResponseV2> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: tradeDetailInclude,
    });
    if (!trade || trade.accountId !== accountId || trade.accountMode !== mode)
      throw new NotFoundException('Trade 不存在');
    const detail = mapDetail(trade);
    const slice = detail.closeSlices.find((candidate) => candidate.id === sliceId);
    if (!slice) throw new NotFoundException('Close Slice 不存在');
    return tradeCloseSliceQueryResponseSchemaV2.parse({
      accountId,
      mode,
      tradeId,
      projectionGeneration: trade.projectionGeneration.toString(),
      slice,
    });
  }

  async resolveReference(rawRequest: unknown): Promise<TradeReferenceResolveResponseV2> {
    const request = tradeReferenceResolveRequestSchemaV2.parse(rawRequest);
    const trades = (await this.prisma.trade.findMany({
      where: { accountId: request.accountId, accountMode: request.mode },
      include: tradeDetailInclude,
    })) as PersistedTrade[];
    const matches = trades.filter((trade) => {
      const facts = tradeFactIds(trade);
      return request.factIds.every((factId) => facts.has(factId));
    });
    const candidateTradeIds = matches.map((trade) => trade.id).sort();
    const matchedFactIds = request.factIds.filter((factId) =>
      matches.some((trade) => tradeFactIds(trade).has(factId)),
    );
    const base = {
      accountId: request.accountId,
      mode: request.mode,
      matchedFactIds,
      candidateTradeIds,
    };
    const [match] = matches;
    if (match !== undefined && matches.length === 1)
      return tradeReferenceResolveResponseSchemaV2.parse({
        ...base,
        status: 'RESOLVED',
        trade: mapDetail(match),
      });
    if (matches.length > 1)
      return tradeReferenceResolveResponseSchemaV2.parse({
        ...base,
        status: 'AMBIGUOUS',
        ...(request.snapshot === undefined ? {} : { snapshot: request.snapshot }),
      });
    if (request.snapshot !== undefined)
      return tradeReferenceResolveResponseSchemaV2.parse({
        ...base,
        status: 'LEGACY',
        snapshot: request.snapshot,
      });
    return tradeReferenceResolveResponseSchemaV2.parse({ ...base, status: 'NOT_FOUND' });
  }

  private async accountIds(accountId: string | undefined, mode: 'actual' | 'shadow') {
    if (accountId !== undefined) {
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { id: true },
      });
      if (!account) throw new NotFoundException('账户不存在');
      return [accountId];
    }
    const accounts = await this.prisma.account.findMany({
      where: { mode },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return accounts.map((account) => account.id);
  }

  private async projectionGenerations(accountIds: string[]) {
    if (accountIds.length === 0) return {};
    const states = await this.prisma.accountLedgerState.findMany({
      where: { accountId: { in: accountIds } },
      select: { accountId: true, projectionGeneration: true },
    });
    const byAccount = new Map(
      states.map((state) => [state.accountId, state.projectionGeneration.toString()]),
    );
    return Object.fromEntries(
      accountIds.map((accountId) => [accountId, byAccount.get(accountId) ?? '0']),
    );
  }
}
