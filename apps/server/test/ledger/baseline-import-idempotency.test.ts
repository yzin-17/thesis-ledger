import { describe, expect, it, vi } from 'vitest';
import {
  BaselineImportService,
  createImportDraftContentFingerprint,
} from '../../src/ledger/baseline-import.service.js';
import { accountId } from './baseline-import-ledger.fixture.js';

describe('导入幂等身份与并发竞争', () => {
  it('草稿 Revision 变更后仍按创建时 imageHash 幂等重放', async () => {
    const draftId = '55555555-5555-4555-8555-555555555561';
    const rows = [
      {
        rowId: 'line-1',
        kind: 'EXECUTION' as const,
        side: 'BUY' as const,
        occurredAt: '2026-08-20T01:00:00.000Z',
        symbol: 'AAPL.US',
        quantity: '1',
        price: '200',
        currency: 'USD',
        charges: [],
        issues: [],
      },
    ];
    const contentFingerprint = createImportDraftContentFingerprint({
      accountId,
      sourceChannel: 'broker-pdf',
      scope: 'FULL',
      contentHash: 'b'.repeat(64),
      parserVersion: 'broker-pdf@1',
      rawEvidenceRef: 'evidence://controlled/replay',
      rows,
    });
    const existing = {
      id: draftId,
      accountId,
      source: 'broker-pdf',
      imageHash: 'b'.repeat(64),
      scope: 'FULL',
      contentFingerprint,
      revisions: [],
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: object) => unknown) =>
        operation({ importDraft: { findUnique: vi.fn(async () => existing) } }),
      ),
    };
    const service = new BaselineImportService(prisma as never, {} as never);

    await expect(
      service.createImportDraft({
        command: 'CREATE_IMPORT_DRAFT_REVISION',
        draftId,
        accountId,
        sourceChannel: 'broker-pdf',
        idempotencyKey: 'draft-replay-after-revision',
        parserVersion: 'broker-pdf@1',
        rawEvidenceRef: 'evidence://controlled/replay',
        contentHash: 'b'.repeat(64),
        rows,
      }),
    ).resolves.toMatchObject({ draftId, revision: 1, idempotentReplay: true });
  });

  it('同一幂等键的任一内容字段变化都会返回稳定冲突', async () => {
    const command = {
      command: 'CREATE_IMPORT_DRAFT_REVISION' as const,
      draftId: '55555555-5555-4555-8555-555555555563',
      accountId,
      sourceChannel: 'broker-pdf',
      idempotencyKey: 'draft-full-fingerprint',
      parserVersion: 'broker-pdf@1',
      rawEvidenceRef: 'evidence://controlled/fingerprint',
      contentHash: 'b'.repeat(64),
      scope: 'FULL' as const,
      observedAt: '2026-08-20T01:00:00.000Z',
      capturedAt: '2026-08-20T01:01:00.000Z',
      timePrecision: 'INSTANT' as const,
      sourceTimezone: 'Asia/Shanghai',
      rows: [
        {
          rowId: 'line-1',
          kind: 'EXECUTION' as const,
          side: 'BUY' as const,
          occurredAt: '2026-08-20T01:00:00.000Z',
          symbol: 'AAPL.US',
          quantity: '1',
          price: '200',
          currency: 'USD',
          charges: [],
          issues: [],
        },
      ],
    };
    const existing = {
      id: command.draftId,
      accountId,
      source: command.sourceChannel,
      imageHash: command.contentHash,
      scope: command.scope,
      contentFingerprint: createImportDraftContentFingerprint(command),
      revisions: [],
    };
    const findUnique = vi.fn(async () => existing);
    const prisma = {
      $transaction: vi.fn(async (operation: (client: object) => unknown) =>
        operation({ importDraft: { findUnique, create: vi.fn() } }),
      ),
    };
    const service = new BaselineImportService(prisma as never, {} as never);
    const variants = [
      { accountId: '99999999-9999-4999-8999-999999999999' },
      { sourceChannel: 'another-broker' },
      { scope: 'PARTIAL' as const },
      { contentHash: 'c'.repeat(64) },
      { parserVersion: 'broker-pdf@2' },
      { rawEvidenceRef: 'evidence://controlled/other' },
      { observedAt: '2026-08-21T01:00:00.000Z' },
      { capturedAt: '2026-08-21T01:01:00.000Z' },
      { timePrecision: 'DATE' as const, observedAt: '2026-08-20' },
      { sourceTimezone: 'UTC' },
      { rows: [{ ...command.rows[0], quantity: '2' }] },
    ];

    for (const variant of variants)
      await expect(service.createImportDraft({ ...command, ...variant })).rejects.toThrow(
        '相同 Draft 幂等键的内容不同',
      );
    expect(findUnique).toHaveBeenCalledTimes(variants.length);
  });

  it('并发创建相同内容只保留一个 Draft，竞争方返回幂等重放', async () => {
    const command = {
      command: 'CREATE_IMPORT_DRAFT_REVISION' as const,
      draftId: '55555555-5555-4555-8555-555555555564',
      accountId,
      sourceChannel: 'broker-pdf',
      idempotencyKey: 'draft-concurrent-create',
      parserVersion: 'broker-pdf@1',
      rawEvidenceRef: 'evidence://controlled/concurrent',
      contentHash: 'd'.repeat(64),
      scope: 'FULL' as const,
      rows: [
        {
          rowId: 'line-1',
          kind: 'EXECUTION' as const,
          side: 'BUY' as const,
          occurredAt: '2026-08-20T01:00:00.000Z',
          symbol: 'AAPL.US',
          quantity: '1',
          price: '200',
          currency: 'USD',
          charges: [],
          issues: [],
        },
      ],
    };
    const competingCommand = { ...command, draftId: '55555555-5555-4555-8555-555555555565' };
    const drafts = new Map<string, Record<string, unknown>>();
    const createdDrafts: Record<string, unknown>[] = [];
    const createdRevisions: Record<string, unknown>[] = [];
    let findCount = 0;
    let releaseInitialFinds!: () => void;
    const initialFindsReleased = new Promise<void>((resolve) => {
      releaseInitialFinds = resolve;
    });
    const findUnique = vi.fn(async () => {
      findCount += 1;
      if (findCount === 2) releaseInitialFinds();
      if (findCount <= 2) await initialFindsReleased;
      return drafts.get(command.idempotencyKey) ?? null;
    });
    const importDraftCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (drafts.has(String(data.idempotencyKey))) throw { code: 'P2002' };
      createdDrafts.push(data);
      drafts.set(String(data.idempotencyKey), {
        id: data.id,
        accountId: data.accountId,
        source: data.source,
        imageHash: data.imageHash,
        scope: data.scope,
        contentFingerprint: data.contentFingerprint,
        revisions: [],
      });
      return data;
    });
    const revisionCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      createdRevisions.push(data);
      return data;
    });
    const prisma = {
      $transaction: vi.fn(async (operation: (client: object) => unknown) =>
        operation({
          importDraft: { findUnique, create: importDraftCreate },
          importDraftRevision: { create: revisionCreate },
        }),
      ),
    };
    const service = new BaselineImportService(prisma as never, {} as never);

    const results = await Promise.all([
      service.createImportDraft(command),
      service.createImportDraft(competingCommand),
    ]);

    expect(createdDrafts).toHaveLength(1);
    expect(createdRevisions).toHaveLength(1);
    expect(new Set(results.map((result) => result.draftId))).toEqual(new Set([command.draftId]));
    expect(results.map((result) => result.idempotentReplay).sort()).toEqual([false, true]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
