import { describe, expect, it } from 'vitest';
import {
  createBaselineObservationBatchCommandSchemaV2,
  createImportDraftRevisionCommandSchemaV2,
  submitImportDraftRevisionCommandSchemaV2,
} from '../src/baseline-import.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

describe('历史基线与导入契约', () => {
  it('接受 FULL 多资产基线并拒绝重复标的', () => {
    const command = {
      command: 'CREATE_BASELINE_OBSERVATION_BATCH',
      batchId: '22222222-2222-4222-8222-222222222222',
      accountId,
      scope: 'FULL',
      observedAt: '2026-08-26T02:30:00.000Z',
      capturedAt: '2026-08-26T02:31:00.000Z',
      sourceTimezone: 'Asia/Shanghai',
      source: { category: 'IMPORT', channel: 'screenshot', externalId: 'baseline-1' },
      actorId: 'user-1',
      evidenceRef: 'evidence://controlled/1',
      contentHash: hash,
      observations: [
        {
          symbol: 'AAPL.US',
          quantity: '10',
          averageCost: '200',
          currency: 'USD',
          costIncludesFees: 'UNKNOWN',
        },
      ],
    };
    expect(createBaselineObservationBatchCommandSchemaV2.parse(command).scope).toBe('FULL');
    expect(() =>
      createBaselineObservationBatchCommandSchemaV2.parse({
        ...command,
        observations: [...command.observations, ...command.observations],
      }),
    ).toThrow('标的不能重复');
  });

  it('允许 DATE 业务观察时间且拒绝伪造的 INSTANT 精度', () => {
    const command = {
      command: 'CREATE_BASELINE_OBSERVATION_BATCH',
      batchId: '22222222-2222-4222-8222-222222222223',
      accountId,
      scope: 'PARTIAL',
      observedAt: '2026-08-26',
      capturedAt: '2026-08-26T02:31:00.000Z',
      sourceTimezone: 'Asia/Shanghai',
      source: { category: 'IMPORT', channel: 'screenshot', externalId: 'baseline-date' },
      actorId: 'user-1',
      evidenceRef: 'evidence://controlled/date',
      contentHash: hash,
      observations: [
        {
          symbol: 'AAPL.US',
          quantity: '10',
          currency: 'USD',
          costIncludesFees: 'UNKNOWN',
        },
      ],
    };
    expect(createBaselineObservationBatchCommandSchemaV2.parse(command).observedAt).toBe(
      '2026-08-26',
    );
    expect(() =>
      createBaselineObservationBatchCommandSchemaV2.parse({
        ...command,
        timePrecision: 'INSTANT',
      }),
    ).toThrow('INSTANT');
  });

  it('允许业务时间和采集时间未知，并要求 UNKNOWN 精度', () => {
    const command = {
      command: 'CREATE_BASELINE_OBSERVATION_BATCH',
      batchId: '22222222-2222-4222-8222-222222222224',
      accountId,
      scope: 'PARTIAL',
      observedAt: null,
      capturedAt: null,
      timePrecision: 'UNKNOWN',
      sourceTimezone: 'UNKNOWN',
      source: { category: 'IMPORT', channel: 'screenshot', externalId: 'baseline-unknown-time' },
      actorId: 'user-1',
      evidenceRef: 'evidence://controlled/unknown-time',
      contentHash: hash,
      observations: [
        {
          symbol: 'AAPL.US',
          quantity: '10',
          currency: 'USD',
          costIncludesFees: 'UNKNOWN',
        },
      ],
    };

    expect(createBaselineObservationBatchCommandSchemaV2.parse(command)).toMatchObject({
      observedAt: null,
      capturedAt: null,
      timePrecision: 'UNKNOWN',
    });
    expect(() =>
      createBaselineObservationBatchCommandSchemaV2.parse({ ...command, timePrecision: 'INSTANT' }),
    ).toThrow('未知业务时间必须使用 UNKNOWN 精度');
  });

  it('导入草稿保留来源行、原始证据与问题列表', () => {
    const parsed = createImportDraftRevisionCommandSchemaV2.parse({
      command: 'CREATE_IMPORT_DRAFT_REVISION',
      draftId: '33333333-3333-4333-8333-333333333333',
      accountId,
      sourceChannel: 'broker-pdf',
      idempotencyKey: 'draft-1',
      parserVersion: 'broker-pdf@1',
      rawEvidenceRef: 'evidence://controlled/raw.pdf',
      contentHash: hash,
      rows: [
        {
          rowId: 'line-8',
          kind: 'EXECUTION',
          side: 'SELL',
          occurredAt: '2026-08-20T01:00:00.000Z',
          symbol: 'AAPL.US',
          quantity: '1',
          price: '210',
          currency: 'USD',
          charges: [],
          issues: ['ORPHAN_SELL'],
        },
      ],
    });
    expect(parsed.rows[0]).toMatchObject({ rowId: 'line-8', issues: ['ORPHAN_SELL'] });
  });

  it('历史成交可保留 DATE 精度和来源时区', () => {
    const parsed = createImportDraftRevisionCommandSchemaV2.parse({
      command: 'CREATE_IMPORT_DRAFT_REVISION',
      draftId: '33333333-3333-4333-8333-333333333334',
      accountId,
      sourceChannel: 'broker-pdf',
      idempotencyKey: 'draft-date-precision',
      parserVersion: 'broker-pdf@1',
      rawEvidenceRef: 'evidence://controlled/raw.pdf',
      contentHash: hash,
      rows: [
        {
          rowId: 'line-date',
          kind: 'EXECUTION',
          side: 'BUY',
          occurredAt: '2026-08-20',
          timePrecision: 'DATE',
          sourceTimezone: 'Asia/Shanghai',
          symbol: 'AAPL.US',
          quantity: '1',
          price: '200',
          currency: 'USD',
          charges: [],
          issues: [],
        },
      ],
    });
    expect(parsed.rows[0]).toMatchObject({
      occurredAt: '2026-08-20',
      timePrecision: 'DATE',
      sourceTimezone: 'Asia/Shanghai',
    });
  });

  it('提交命令要求唯一选中行和预期 Ledger Revision', () => {
    expect(() =>
      submitImportDraftRevisionCommandSchemaV2.parse({
        command: 'SUBMIT_IMPORT_DRAFT_REVISION',
        draftId: '33333333-3333-4333-8333-333333333333',
        revision: 1,
        expectedLedgerRevision: 0,
        selectedRowIds: ['line-1', 'line-1'],
        actorId: 'user-1',
      }),
    ).toThrow();
  });
});
