import { journalAnalyze } from '@thesis-ledger/domain';
import {
  journalAiExplanationSchema,
  journalPeriodAiExplanationSchema,
  journalReviewExplanationRequestSchema,
  journalPeriodExplanationRequestSchema,
  researchResultSchema,
  type JournalAiExplanation,
  type JournalPeriodAiExplanation,
  type JournalReviewCandidateContract,
} from '@thesis-ledger/schemas';
import { journalBrowserStateFixture } from './browser-journal-state.fixture.js';

const runs = new Map<
  string,
  {
    kind: 'object' | 'period';
    reads: number;
    value: JournalAiExplanation | JournalPeriodAiExplanation;
  }
>();
export const journalBrowserAiFixture = { enabled: false };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

export function browserJournalAiResponse(
  url: URL,
  raw: unknown,
  candidate: (accountId: string) => JournalReviewCandidateContract,
) {
  const period = url.pathname.includes('/period-explanations');
  if (!period && !url.pathname.includes('/explanations')) return null;
  if (raw !== undefined) {
    if (!journalBrowserAiFixture.enabled)
      return json({ error: 'Bad Request', message: '请先选择研究默认模型' }, 400);
    const common = {
      id: crypto.randomUUID(),
      provider: '固定浏览器验收',
      model: '固定模型',
      status: 'queued' as const,
      errorCode: null,
      errorSummary: null,
      result: null,
      createdAt: new Date().toISOString(),
    };
    if (period) {
      const request = journalPeriodExplanationRequestSchema.parse(raw);
      const value = journalPeriodAiExplanationSchema.parse({
        ...common,
        accountId: request.accountId,
        mode: request.mode,
        symbol: request.symbol ?? null,
        start: request.start,
        end: request.end,
        ledgerRevision: request.expectedLedgerRevision,
        projectionGeneration: request.expectedProjectionGeneration,
        algorithmVersion: request.expectedAlgorithmVersion,
        objectFingerprints: request.objectFingerprints,
        promptVersion: '固定周期验收-v1',
      });
      runs.set(value.id, { kind: 'period', reads: 0, value });
      return json(value);
    }
    const request = journalReviewExplanationRequestSchema.parse(raw);
    const current = candidate(request.accountId);
    current.input.analysisDraft = request.analysisDraft ?? null;
    if (current.input.projection.evidenceFingerprint !== request.evidenceFingerprint)
      return json({ error: 'Conflict', message: '固定输入已变化' }, 409);
    const value = journalAiExplanationSchema.parse({
      ...common,
      accountId: request.accountId,
      mode: request.mode,
      reviewObjectId: request.reference.reviewObjectId,
      evidenceFingerprint: request.evidenceFingerprint,
      analysisDraft: current.input.analysisDraft,
      algorithmVersion: journalAnalyze(current).algorithmVersion,
      promptVersion: '固定单笔验收-v1',
    });
    runs.set(value.id, { kind: 'object', reads: 0, value });
    return json(value);
  }
  const entry = runs.get(url.pathname.split('/').at(-1) ?? '');
  if (
    !entry ||
    entry.kind !== (period ? 'period' : 'object') ||
    entry.value.accountId !== url.searchParams.get('accountId') ||
    entry.value.mode !== url.searchParams.get('mode')
  )
    return json({ error: 'Not Found', message: '固定解读不存在' }, 404);
  entry.reads += 1;
  entry.value.status = entry.reads === 1 ? 'running' : 'succeeded';
  if (journalBrowserStateFixture.state === 'ai-error') {
    entry.value.status = 'failed';
    entry.value.errorCode = 'FIXTURE_AI_FAILED';
    entry.value.errorSummary = '固定验收：AI 执行失败';
  }
  if (entry.value.status === 'succeeded')
    entry.value.result = researchResultSchema.parse({
      version: 1,
      provider: entry.value.provider,
      conclusion: '固定浏览器解读已完成，仅验证轮询和元数据展示。',
      evidence: [],
      risks: ['固定输入不能证明真实模型能力'],
      unknowns: [],
      disclaimer: '本页不调用 Provider。',
      createdAt: entry.value.createdAt,
    });
  return json(entry.value);
}

export function browserJournalAiMetadata(id: string | undefined) {
  if (!id) return null;
  const run = runs.get(id)?.value;
  if (!run) throw new Error('固定解读不存在');
  return {
    id: run.id,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    status: run.status,
  };
}
