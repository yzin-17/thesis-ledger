// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  importExistingJournalReferences,
  journalExistingRuns,
  journalExistingScope,
} from './browser-journal-existing-reference.js';
import {
  armJournalExistingReadFailure,
  installJournalExistingAudit,
  journalExistingRequestAllowed,
  readJournalExistingAudit,
} from './browser-journal-existing-audit.js';
import { browserJournalCandidate } from './browser-journal-candidate.fixture.js';
import { journalUiEvidenceFixture } from './journal-review.fixture.js';

const api = vi.hoisted(() => ({
  explanation: vi.fn(),
  periodExplanation: vi.fn(),
  object: vi.fn(),
  candidates: vi.fn(),
}));
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));
const input = journalUiEvidenceFixture();
input.trade.accountId = journalExistingScope.accountId;
const candidate = browserJournalCandidate(input);
const objectRun = {
  ...journalExistingScope,
  id: journalExistingRuns.object,
  status: 'succeeded',
  promptVersion: 'journal-review-v2',
  reviewObjectId: input.reference.reviewObjectId,
  evidenceFingerprint: input.projection.evidenceFingerprint,
  analysisDraft: null,
  algorithmVersion: 'journal-decimal-1',
};
const periodRun = {
  ...journalExistingScope,
  id: journalExistingRuns.period,
  status: 'succeeded',
  promptVersion: 'journal-period-review-v2',
  symbol: null,
  start: '2026-01-01T00:00:00Z',
  end: '2026-02-01T00:00:00Z',
  ledgerRevision: '12',
  projectionGeneration: '7',
  algorithmVersion: 'journal-decimal-1',
  objectFingerprints: {
    [input.reference.reviewObjectId]: input.projection.evidenceFingerprint,
  },
};
const page = {
  items: [candidate],
  nextCursor: null,
  ledgerRevision: '12',
  projectionGeneration: '7',
};

describe('既有报告验收入口的数据保护', () => {
  const originalFetch = window.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    api.explanation.mockImplementation(async (id: string) =>
      id === journalExistingRuns.failed ? { ...objectRun, id, status: 'failed' } : objectRun,
    );
    api.periodExplanation.mockResolvedValue(periodRun);
    api.object.mockResolvedValue(candidate);
    api.candidates.mockResolvedValue(page);
  });
  afterEach(() => {
    window.fetch = originalFetch;
    vi.unstubAllGlobals();
  });
  it('只读取既有任务并保存 ID 和摘要键，导入成功前不写引用', async () => {
    await importExistingJournalReferences();
    expect(api.explanation.mock.calls.map((row) => row[0])).toEqual([
      journalExistingRuns.object,
      journalExistingRuns.failed,
    ]);
    expect(api.periodExplanation).toHaveBeenCalledWith(
      journalExistingRuns.period,
      journalExistingScope,
    );
    expect(sessionStorage.length).toBe(3);
    const stored = Array.from({ length: sessionStorage.length }, (_, index) =>
      JSON.parse(sessionStorage.getItem(sessionStorage.key(index)!)!),
    );
    expect(stored).toContainEqual({ version: 1, id: journalExistingRuns.object });
    expect(stored).toContainEqual({ version: 1, id: journalExistingRuns.period });
    expect(stored).toContainEqual([
      { id: journalExistingRuns.object, kind: 'object' },
      { id: journalExistingRuns.period, kind: 'period' },
      { id: journalExistingRuns.failed, kind: 'object' },
    ]);
  });
  it.each([
    { ledgerRevision: '13' },
    { projectionGeneration: '8' },
    { nextCursor: '另一页' },
    { items: [] },
  ])('事实范围变化时拒绝导入，不覆盖本机引用：%j', async (change) => {
    api.candidates.mockResolvedValue({ ...page, ...change });
    await expect(importExistingJournalReferences()).rejects.toThrow('目标事实已变化');
    expect(sessionStorage.length).toBe(0);
  });
  it.each([
    ['/api/v1/journal/explanations', 'POST'],
    ['/api/v1/journal/period-explanations', 'POST'],
    ['/api/v1/journal/review-snapshots', 'POST'],
    ['/api/v1/ledger/events', 'DELETE'],
  ])('阻止目标写入且记录被阻止请求：%s %s', async (path, method) => {
    const forward = vi.fn();
    window.fetch = forward;
    installJournalExistingAudit();
    expect((await window.fetch(path, { method })).status).toBe(405);
    expect(forward).not.toHaveBeenCalled();
    expect(readJournalExistingAudit()[0]).toMatchObject({ method, source: 'blocked' });
  });
  it('一次读取失败只注入本页，后续读取使用真实请求并分开记录', async () => {
    const forward = vi.fn(async () => Response.json({ id: journalExistingRuns.object }));
    window.fetch = forward;
    installJournalExistingAudit();
    armJournalExistingReadFailure();
    const path = `/api/v1/journal/explanations/${journalExistingRuns.object}`;
    expect((await window.fetch(path)).status).toBe(503);
    expect((await window.fetch(path)).status).toBe(200);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(readJournalExistingAudit().map((row) => row.source)).toEqual(['injected', 'target']);
    expect(journalExistingRequestAllowed('/api/v1/journal/analysis/period', 'POST')).toBe(true);
    expect(journalExistingRequestAllowed(path, 'GET')).toBe(true);
  });
  it('重新安装请求记录器不会重复代理或重复计数', async () => {
    const forward = vi.fn(async () => Response.json({ ok: true }));
    window.fetch = forward;
    installJournalExistingAudit();
    installJournalExistingAudit();
    await window.fetch('/api/v1/accounts');
    expect(forward).toHaveBeenCalledTimes(1);
    expect(readJournalExistingAudit()).toHaveLength(1);
  });
});
