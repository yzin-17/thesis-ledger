import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type JournalReviewSnapshot } from '@prisma/client';
import { journalReviewObjectId, journalReviewObjectReference } from '@thesis-ledger/domain';
import {
  journalReviewEvidenceInputSchema,
  journalReviewQuerySchema,
  journalReviewObjectReferenceSchema,
  type JournalReviewEvidenceInput,
  type TradeDetailResponse,
  type JournalReviewSnapshotRequest,
  type JournalPeriodReviewRequest,
  journalReviewObjectLocatorSchema,
  journalReviewReferenceLocatorSchema,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { TradeQueryService } from '../ledger/trade-query.service.js';
import { journalReviewAssociation, journalReviewNoteView } from './journal-review-association.js';
import { journalReviewCandidate } from './journal-review-candidate.js';
import { journalReviewPage } from './journal-review-page.js';
import { journalReviewLegacy } from './journal-review-legacy.js';
import { journalReviewEvidenceFingerprint } from './journal-review-evidence.js';

function snapshotFingerprints(rows: readonly JournalReviewSnapshot[]) {
  const result = new Map<string, string | null>();
  for (const row of rows) {
    let objectId: string;
    if (row.reviewObjectType === 'TRADE_CYCLE' && row.closeSliceId === null)
      objectId = journalReviewObjectId('TRADE_CYCLE', row.tradeId);
    else if (row.reviewObjectType === 'CLOSE_SLICE' && row.closeSliceId !== null)
      objectId = journalReviewObjectId('CLOSE_SLICE', row.closeSliceId);
    else continue;
    if (result.has(objectId)) continue;
    const stored = journalReviewEvidenceInputSchema.safeParse(row.inputSnapshot);
    let fingerprint: string | null = null;
    if (
      stored.success &&
      stored.data.reference.reviewObjectId === objectId &&
      stored.data.trade.accountId === row.accountId &&
      stored.data.trade.accountMode === row.mode &&
      stored.data.projection.ledgerRevision === row.ledgerRevision.toString() &&
      stored.data.projection.projectionGeneration === row.projectionGeneration.toString() &&
      stored.data.projection.evidenceFingerprint === journalReviewEvidenceFingerprint(stored.data)
    )
      fingerprint = stored.data.projection.evidenceFingerprint;
    result.set(objectId, fingerprint);
  }
  return result;
}

function missingFx(trade: TradeDetailResponse, closeSliceId?: string) {
  const currencies = new Set<string>();
  const slices =
    closeSliceId === undefined
      ? trade.closeSlices
      : trade.closeSlices.filter((row) => row.id === closeSliceId);
  const sourceFacts = new Set(
    slices.flatMap((row) => row.allocations.map((allocation) => allocation.sourceFactId)),
  );
  const entries = [...trade.entryLegs, ...trade.baselineComponents].filter(
    (row) => closeSliceId === undefined || sourceFacts.has(row.factId),
  );
  for (const row of entries) {
    currencies.add(row.currency);
    if (closeSliceId === undefined && 'charges' in row)
      for (const charge of row.charges) currencies.add(charge.currency);
  }
  for (const slice of slices) {
    currencies.add(slice.currency);
    for (const charge of [
      ...slice.charges,
      ...slice.allocations.flatMap((row) => row.allocatedBuyCharges),
    ])
      currencies.add(charge.currency);
  }
  if (closeSliceId === undefined)
    for (const dividend of trade.dividendAttributions) currencies.add(dividend.currency);
  return currencies.size > 1;
}

@Injectable()
export class JournalReviewQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trades: TradeQueryService,
  ) {}

  private async load(raw: unknown, transaction?: Prisma.TransactionClient) {
    const query = journalReviewQuerySchema.parse(raw);
    const projectionInput = {
      accountId: query.accountId,
      mode: query.mode,
      ...(query.symbol === undefined ? {} : { symbol: query.symbol }),
    };
    const projection =
      transaction === undefined
        ? await this.trades.readAccountProjection(projectionInput)
        : await this.trades.readAccountProjection(projectionInput, transaction);
    const client = transaction ?? this.prisma;
    const planRequest = client.tradePlan.findMany({ where: { accountId: query.accountId } });
    const entryRequest = client.journalEntry.findMany({ where: { accountId: query.accountId } });
    const snapshotRequest = client.journalReviewSnapshot.findMany({
      where: { accountId: query.accountId, mode: query.mode },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const [plans, entries, snapshots] =
      transaction === undefined
        ? await this.prisma.$transaction([planRequest, entryRequest, snapshotRequest], {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          })
        : await Promise.all([planRequest, entryRequest, snapshotRequest]);
    const fingerprints = snapshotFingerprints(snapshots);
    const legacyItems = journalReviewLegacy({
      accountId: query.accountId,
      mode: query.mode,
      ...(query.symbol === undefined ? {} : { symbol: query.symbol }),
      trades: projection.details,
      entries: entries
        .filter((row) => row.accountId === query.accountId)
        .map(journalReviewNoteView),
    });
    const legacyEntryIds = new Set(
      legacyItems
        .filter((row) => row.reason === 'SELL_MAPPING_AMBIGUOUS')
        .map((row) => row.journalEntry.id),
    );
    const candidates = projection.details.flatMap((trade) => {
      if (trade.projectionGeneration !== projection.version.projectionGeneration)
        throw new ConflictException({
          errorCode: 'PROJECTION_GENERATION_CONFLICT',
          message: '交易与账户投影版本不一致，请刷新后重试',
        });
      if (trade.projectionFingerprint === null)
        throw new ConflictException({
          errorCode: 'PROJECTION_NOT_READY',
          message: '交易投影证据尚未就绪，请刷新后重试',
        });
      const association = journalReviewAssociation({
        trade,
        plans,
        entries: entries.filter((row) => !legacyEntryIds.has(row.id)),
      });
      return [undefined, ...trade.closeSlices.map((row) => row.id)].map((closeSliceId) => {
        const reference = journalReviewObjectReference(trade, closeSliceId);
        const evidence: JournalReviewEvidenceInput = {
          reference,
          trade,
          plan: association.plan,
          journalEntries: association.journalEntries,
          analysisDraft: null,
          fxEvidence: [],
          projection: {
            ...projection.version,
            projectionFingerprint: trade.projectionFingerprint!,
            evidenceFingerprint: 'pending',
            factIds: [],
            eventIds: [],
            fxEvidenceVersion: null,
            conversionFingerprint: null,
          },
        };
        const previous = fingerprints.get(reference.reviewObjectId);
        const candidate = journalReviewCandidate({
          evidence,
          fxMissing: missingFx(trade, closeSliceId),
          projectionStale: false,
          ...(previous === undefined ? {} : { previousEvidenceFingerprint: previous }),
        });
        candidate.missingEvidence.push(...association.missingEvidence);
        return candidate;
      });
    });
    const current =
      transaction === undefined
        ? await this.trades.readVersion(query.accountId)
        : projection.version;
    if (
      current.ledgerRevision !== projection.version.ledgerRevision ||
      current.projectionGeneration !== projection.version.projectionGeneration
    )
      throw new ConflictException({
        errorCode: 'PROJECTION_GENERATION_CONFLICT',
        message: '复盘投影已更新，请刷新后重试',
      });
    return { candidates, query, version: projection.version, legacyItems };
  }

  async list(raw: unknown) {
    const loaded = await this.load(raw);
    return {
      ...journalReviewPage(loaded.candidates, loaded.query, loaded.version),
      legacyItems: loaded.legacyItems,
    };
  }

  async get(
    input: Pick<JournalReviewSnapshotRequest, 'accountId' | 'mode' | 'reference'>,
    transaction?: Prisma.TransactionClient,
  ) {
    const reference = journalReviewObjectReferenceSchema.parse(input.reference);
    const loaded = await this.load({ accountId: input.accountId, mode: input.mode }, transaction);
    const candidate = loaded.candidates.find(
      (row) =>
        row.input.reference.reviewObjectId === reference.reviewObjectId &&
        row.input.reference.tradeId === reference.tradeId &&
        row.input.trade.accountId === input.accountId &&
        row.input.trade.accountMode === input.mode,
    );
    if (!candidate)
      throw new NotFoundException({
        errorCode: 'JOURNAL_OBJECT_NOT_FOUND',
        message: '复盘对象不存在或不属于当前账户模式',
      });
    return candidate;
  }

  async readObjects(input: Pick<JournalPeriodReviewRequest, 'accountId' | 'mode' | 'symbol'>) {
    return (await this.readContext(input)).candidates;
  }

  async locate(raw: unknown) {
    const query = journalReviewObjectLocatorSchema.parse(raw);
    const context = await this.readContext(query);
    const candidate = context.candidates.find(
      (row) => row.input.reference.reviewObjectId === query.reviewObjectId,
    );
    if (!candidate)
      throw new NotFoundException({
        errorCode: 'JOURNAL_OBJECT_NOT_FOUND',
        message: '复盘对象不存在或不属于当前账户模式',
      });
    return candidate;
  }

  async resolveReference(raw: unknown) {
    const query = journalReviewReferenceLocatorSchema.parse(raw);
    const context = await this.readContext(query);
    const candidate = context.candidates.find((row) => {
      const reference = row.input.reference;
      if (
        reference.tradeId !== query.tradeId ||
        reference.reviewObjectType !== query.reviewObjectType
      )
        return false;
      if (query.reviewObjectType === 'CLOSE_SLICE')
        return (
          reference.reviewObjectType === 'CLOSE_SLICE' &&
          reference.closeSliceId === query.closeSliceId
        );
      return true;
    });
    if (!candidate)
      throw new NotFoundException({
        errorCode: 'JOURNAL_OBJECT_NOT_FOUND',
        message: '复盘引用不存在或不属于当前账户模式',
      });
    return candidate;
  }

  async readContext(input: Pick<JournalPeriodReviewRequest, 'accountId' | 'mode' | 'symbol'>) {
    const loaded = await this.load({
      accountId: input.accountId,
      mode: input.mode,
      ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
    });
    return {
      version: loaded.version,
      candidates: loaded.candidates.filter(
        (row) =>
          row.input.trade.accountId === input.accountId &&
          row.input.trade.accountMode === input.mode,
      ),
    };
  }
}
