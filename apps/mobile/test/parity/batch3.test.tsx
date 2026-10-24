// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { button, click, field, flush, input, mount, setApi, view } from './mobile-view-harness';
import { journalEvidenceFixture } from '../../../../packages/schemas/test/fixtures/journal-review.fixture';
import { journalReviewCandidateContractSchema } from '@thesis-ledger/schemas';
import { JournalObjectScreen } from '../../src/features/journal-trade/JournalObjectScreen';
import { ResearchReportScreen } from '../../src/features/research-read/ResearchReportScreen';
import { ResearchNewScreen } from '../../src/features/research-submit/ResearchSubmitScreen';
import { journalWindow } from '../../src/features/journal-trade/journal-model';
import { JournalEvidenceScreen } from '../../src/features/journal-ai/JournalEvidenceScreen';
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      storage.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      storage.delete(k);
    }),
  },
}));
const id = '00000000-0000-4000-8000-000000000010';
const respond = (v: unknown, status = 200) =>
  new Response(
    JSON.stringify(status >= 400 ? { error: 'controlled_failure', ...(v as object) } : v),
    { status },
  );
const report = {
  id,
  status: 'succeeded',
  question: '受控报告',
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z',
  historicalScope: { status: 'unrecorded', snapshot: null, label: '历史范围未记录' },
  resultVersion: 1,
  availability: 'pending_verification',
  summary: '保留正文',
  quality: null,
  errorCode: null,
  errorSummary: null,
  submission: null,
  result: {
    version: 1,
    provider: 'controlled',
    conclusion: '已有正文完整保留',
    evidence: [],
    risks: [],
    unknowns: [],
    signals: [],
    disclaimer: '受控验收',
    createdAt: '2026-10-24T00:00:00Z',
  },
};
beforeEach(() => {
  storage.clear();
  view.runtime.baseUrl = 'https://ledger.test/api/v1';
});
describe('第 3 批手机异常保护', () => {
  it('解读引用必须先核对账户归属，拒绝后不读取工具审计', async () => {
    view.params = {
      accountId: '00000000-0000-4000-8000-000000000001',
      mode: 'shadow',
      kind: 'object',
      runId: id,
      toolCallId: id,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respond({ error: 'forbidden', message: '引用不属于当前账户' }, 403));
    setApi(fetcher);
    await mount(<JournalEvidenceScreen />);
    expect(document.body.textContent).toContain('引用不属于当前账户');
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('tool-calls'))).toBe(false);
  });
  it('时间带时区且左闭右开，反向窗口拒绝', () => {
    expect(journalWindow('2026-10-01T08:00:00+08:00', '2026-10-02T08:00:00+08:00')).toEqual({
      start: '2026-10-01T00:00:00.000Z',
      end: '2026-10-02T00:00:00.000Z',
    });
    expect(() => journalWindow('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z')).toThrow();
    expect(() => journalWindow('2026-10-01T00:00:00', '2026-10-02T00:00:00')).toThrow();
  });
  it('分析错误保留草稿，成功后草稿修改禁止保存旧结果', async () => {
    const evidence = journalEvidenceFixture();
    const candidate = journalReviewCandidateContractSchema.parse({
      input: evidence,
      openedAt: evidence.trade.openedAt,
      effectiveClosedAt: evidence.trade.closedAt,
      executedAt: null,
      statisticsEligibility: { eligible: true, reasons: [] },
      reviewStatus: 'CURRENT',
      missingEvidence: [],
    });
    view.runtime.mode = 'actual';
    view.params = {
      accountId: evidence.trade.accountId,
      mode: 'actual',
      reviewObjectId: evidence.reference.reviewObjectId,
    };
    let fail = true;
    let saves = 0;
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        const p = String(url);
        if (p.includes('/capabilities'))
          return respond({ canStart: false, providers: [], checkedAt: '2026-10-24T00:00:00Z' });
        if (p.includes('/analysis/object')) {
          if (fail) return respond({ message: '事实已变化' }, 409);
          const body = JSON.parse(String(init?.body));
          return respond({
            candidate: {
              ...candidate,
              input: { ...candidate.input, analysisDraft: body.analysisDraft },
            },
            result: {
              reviewObjectId: evidence.reference.reviewObjectId,
              algorithmVersion: 'controlled',
              statisticsEligibility: { eligible: true, reasons: [] },
              metrics: {},
              behaviorNotes: [],
              rounding: { mode: 'HALF_UP', amountFractionDigits: 8, ratioFractionDigits: 8 },
            },
          });
        }
        if (p.includes('/review-snapshots')) {
          saves++;
          return respond({});
        }
        return respond(candidate);
      }),
    );
    await mount(<JournalObjectScreen />);
    await input(field('本次复盘备注'), '不能丢失');
    await click(button('开始复盘'));
    expect(field('本次复盘备注').value).toBe('不能丢失');
    expect(document.body.textContent).toContain('事实已变化');
    fail = false;
    await click(button('开始复盘'));
    expect(button('保存复盘快照').disabled).toBe(false);
    await input(field('本次复盘备注'), '修改后的草稿');
    await flush();
    expect(button('保存复盘快照').disabled).toBe(true);
    expect(saves).toBe(0);
  });
  it('报告刷新失败保留已经读取的正文与来源范围', async () => {
    view.params = { id, locator: { view: 'legacy' } };
    let fail = false;
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        if (String(url).includes('/tool-calls'))
          return respond({ items: [], nextCursor: null, hasMore: false });
        if (fail) return respond({ message: '暂时断线' }, 503);
        return respond(report);
      }),
    );
    await mount(<ResearchReportScreen />);
    expect(document.body.textContent).toContain('已有正文完整保留');
    fail = true;
    await click(button('刷新报告'));
    expect(document.body.textContent).toContain('暂时断线');
    expect(document.body.textContent).toContain('已有正文完整保留');
  });
  it('受控能力不提交模型，也不改服务端设置', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes('/research/capabilities'))
        return respond({
          version: 'research-capabilities-v2',
          canCreate: false,
          scopes: ['portfolio'],
        });
      if (String(url).includes('/ai/settings'))
        return respond({ researchDefault: null, revision: 'r1', candidates: [] });
      if (String(url).includes('/accounts')) return respond([]);
      return respond({});
    });
    setApi(fetcher);
    await mount(<ResearchNewScreen />);
    expect(button('准备并提交研究').disabled).toBe(true);
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(
      true,
    );
  });
  it('不确定提交在重开后复用原输入和标识，找回不创建新请求', async () => {
    const pending = {
      version: 2,
      submissionId: id,
      mode: 'shadow',
      scope: { scope: 'portfolio' },
      question: '原问题',
      researchSettingsRevision: 'r1',
    };
    storage.set(
      JSON.stringify(['mobile-research-pending-v1', view.runtime.baseUrl, 'shadow']),
      JSON.stringify(pending),
    );
    const posts: unknown[] = [];
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        if (String(url).endsWith('/submissions/find')) {
          posts.push(JSON.parse(String(init?.body)));
          return respond({ message: '尚未找到' }, 404);
        }
        if (String(url).includes('/research/capabilities'))
          return respond({
            version: 'research-capabilities-v2',
            canCreate: false,
            scopes: ['portfolio'],
          });
        if (String(url).includes('/ai/settings'))
          return respond({ researchDefault: null, revision: 'r1', candidates: [] });
        return respond([]);
      }),
    );
    await mount(<ResearchNewScreen />);
    await click(button('找回原提交'));
    expect(posts).toEqual([pending]);
    expect([...storage.values()]).toEqual([JSON.stringify(pending)]);
    expect(document.body.textContent).toContain('原问题');
  });
});
