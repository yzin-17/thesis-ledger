import {
  normalizeResearchSubmissionV2,
  researchResultV2Schema,
  researchReportDetailSchema,
  researchReportSummarySchema,
  researchFrozenEvidenceV2Schema,
  researchResultSchema,
  type ResearchSubmissionV2,
  type ResearchResultV2,
  type ResearchReportDetail,
  type ResearchScopeSnapshotV2,
} from '@thesis-ledger/schemas';

export type ResearchBrowserScenario =
  'normal' | 'lost' | 'hold' | 'closed' | 'queued' | 'registered';
export type ResearchBrowserExamples = {
  input: unknown;
  result: unknown;
  frozen: { evidence: unknown[] };
};
export const browserResearchAccounts = [
  {
    id: 'a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: '受控实际账户',
    institution: null,
    type: 'securities',
    mode: 'actual',
    currency: 'CNY',
    active: true,
  },
  {
    id: 'b1111111-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: '受控模拟账户',
    institution: null,
    type: 'securities',
    mode: 'shadow',
    currency: 'CNY',
    active: true,
  },
];
const strategyId = 'c1111111-cccc-4ccc-8ccc-cccccccccccc';
const strategyVersionId = 'd1111111-dddd-4ddd-8ddd-dddddddddddd';
function snapshot(input: ResearchSubmissionV2, result: ResearchResultV2): ResearchScopeSnapshotV2 {
  if (result.scopeSnapshot.scope !== 'instrument') throw new Error('浏览器规范标的样例缺失');
  const instrument = result.scopeSnapshot.instrument;
  const base = {
    version: 'research-scope-v2' as const,
    mode: input.mode,
    confirmedAt: result.scopeSnapshot.confirmedAt,
  };
  const selected = input.scope;
  if (selected.scope === 'instrument')
    return {
      ...base,
      scope: selected.scope,
      instrument: { ...instrument, instrumentId: selected.instrumentId },
    };
  if (selected.scope === 'account') return { ...base, ...selected, instruments: [instrument] };
  if (selected.scope === 'position')
    return {
      ...base,
      scope: selected.scope,
      accountId: selected.accountId,
      instrument: { ...instrument, symbol: selected.symbol },
    };
  if (selected.scope === 'strategy') return { ...base, ...selected, instruments: [instrument] };
  return {
    ...base,
    scope: 'portfolio',
    portfolioId: null,
    accountIds: browserResearchAccounts
      .filter((account) => account.mode === input.mode)
      .map((account) => account.id),
    instruments: [instrument],
  };
}
function report(
  input: ResearchSubmissionV2,
  pending: boolean,
  result: ResearchResultV2,
): ResearchReportDetail {
  const frozenScope = snapshot(input, result);
  const savedResult = researchResultV2Schema.parse({
    ...structuredClone(result),
    scopeSnapshot: frozenScope,
    model: {
      providerId: 'controlled-browser',
      modelId: 'controlled-model',
      researchSettingsRevision: input.researchSettingsRevision,
    },
  });
  savedResult.evidenceBindings[0]!.toolCallId = crypto.randomUUID();
  return researchReportDetailSchema.parse({
    id: crypto.randomUUID(),
    status: pending ? 'queued' : 'succeeded',
    question: input.question,
    createdAt: savedResult.createdAt,
    updatedAt: savedResult.createdAt,
    historicalScope: { status: 'known', snapshot: frozenScope },
    resultVersion: 2,
    availability: pending ? 'pending' : 'available',
    summary: pending ? null : savedResult.inference.conclusion,
    quality: savedResult.quality,
    errorCode: null,
    errorSummary: null,
    result: pending ? null : savedResult,
    submission: input,
  });
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
const absent = () =>
  response({ error: 'not_found', message: '受控记录不存在或不属于当前范围' }, 404);

function seedReports(
  scenario: ResearchBrowserScenario,
  sample: ResearchBrowserExamples,
  result: ResearchResultV2,
) {
  const reports = new Map<string, ResearchReportDetail>();
  for (const mode of ['shadow', 'actual'] as const) {
    const input = normalizeResearchSubmissionV2({
      ...normalizeResearchSubmissionV2(sample.input),
      submissionId: crypto.randomUUID(),
      mode,
      researchSettingsRevision: 'controlled-browser-settings',
      question: mode === 'shadow' ? '受控模拟标的研究' : '受控实际标的研究',
    });
    const row = report(input, false, result);
    reports.set(row.id, row);
  }
  if (scenario !== 'registered') {
    const old = researchResultSchema.parse({
      version: 1,
      provider: 'controlled-history',
      createdAt: '2026-10-18T12:00:00Z',
      conclusion: '这是受控旧报告正文，范围和引用归属尚待核验。',
      evidence: [
        {
          claim: '合成历史陈述',
          citations: [
            {
              tool: 'portfolio',
              sourceId: 'controlled-history',
              provider: 'controlled-history',
              observedAt: '2026-10-18T12:00:00Z',
            },
          ],
        },
      ],
      risks: ['合成风险'],
      unknowns: ['历史模式未知'],
      disclaimer: '仅为浏览器合成样例',
    });
    const row = researchReportDetailSchema.parse({
      id: crypto.randomUUID(),
      status: 'succeeded',
      question: '受控历史兼容报告',
      createdAt: old.createdAt,
      updatedAt: old.createdAt,
      historicalScope: { status: 'unrecorded', snapshot: null, label: '历史范围未记录' },
      resultVersion: 1,
      availability: 'pending_verification',
      summary: old.conclusion,
      quality: null,
      errorCode: null,
      errorSummary: null,
      result: old,
      submission: null,
    });
    reports.set(row.id, row);
  }
  return reports;
}

function receipt(row: ResearchReportDetail, reused: boolean) {
  if (!row.submission || row.historicalScope.status !== 'known')
    throw new Error('受控提交收据缺失');
  return {
    version: 2,
    runId: row.id,
    submissionId: row.submission.submissionId,
    status: row.status,
    reused,
    scopeSnapshot: row.historicalScope.snapshot,
  };
}

/** 仅供真实浏览器和 UI 测试的序列化响应；所有请求均在内存处理，不访问业务库或模型。 */
export function createResearchBrowserApi(
  scenario: ResearchBrowserScenario,
  sample: ResearchBrowserExamples,
) {
  const result = researchResultV2Schema.parse(sample.result);
  if (result.scopeSnapshot.scope !== 'instrument') throw new Error('浏览器规范标的样例缺失');
  const instrument = result.scopeSnapshot.instrument;
  const evidence = researchFrozenEvidenceV2Schema.parse(sample.frozen.evidence[0]);
  const reports = seedReports(scenario, sample, result);
  const submitted = new Map<string, string>();
  const listeners = new Set<() => void>();
  const stats = {
    reads: 0,
    submitAttempts: 0,
    created: 0,
    finds: 0,
    cancels: 0,
    aborted: 0,
    blocked: 0,
  };
  let specialPending = true;
  let latest: ResearchSubmissionV2 | null = null;
  let statsSnapshot = JSON.stringify(stats);
  const publish = () => {
    statsSnapshot = JSON.stringify(stats);
    for (const listener of listeners) listener();
  };
  const scopes: ResearchSubmissionV2['scope']['scope'][] =
    scenario === 'registered'
      ? ['instrument', 'strategy']
      : ['instrument', 'portfolio', 'account', 'position', 'strategy'];
  const matches = (row: ResearchReportDetail, params: URLSearchParams) => {
    if (params.get('view') === 'legacy') return row.historicalScope.status === 'unrecorded';
    if (row.historicalScope.status !== 'known') return false;
    return (
      row.historicalScope.snapshot.mode === params.get('mode') &&
      (!params.get('kind') || row.historicalScope.snapshot.scope === params.get('kind'))
    );
  };
  function readReport(url: URL) {
    const parts = url.pathname.split('/');
    const row = reports.get(parts[5] ?? '');
    if (!row || !matches(row, url.searchParams)) return absent();
    if (parts[6] !== 'evidence') return response(row);
    if (row.result?.version !== 2 || row.result.evidenceBindings[0]?.audit.evidenceId !== parts[7])
      return absent();
    return response({
      version: 2,
      runId: row.id,
      scopeSnapshot: row.result.scopeSnapshot,
      evidence,
      toolCallId: row.result.evidenceBindings[0].toolCallId,
    });
  }
  async function submit(path: string, raw: unknown, signal?: AbortSignal | null) {
    const input = normalizeResearchSubmissionV2(raw);
    latest = input;
    if (path.endsWith('/find')) {
      stats.finds += 1;
      publish();
      const row = reports.get(submitted.get(input.submissionId) ?? '');
      return row ? response(receipt(row, true)) : absent();
    }
    if (path.endsWith('/cancel')) {
      stats.cancels += 1;
      const row = reports.get(submitted.get(input.submissionId) ?? '');
      if (!row) {
        publish();
        return absent();
      }
      if (['queued', 'running'].includes(row.status)) row.status = 'cancelled';
      publish();
      return response(receipt(row, true));
    }
    stats.submitAttempts += 1;
    publish();
    if (!scopes.includes(input.scope.scope) || scenario === 'closed')
      return response({ error: 'scope_unavailable', message: '受控创建资格不满足' }, 403);
    if (scenario === 'hold' && specialPending) {
      specialPending = false;
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => {
          stats.aborted += 1;
          publish();
          reject(new DOMException('controlled preparation aborted', 'AbortError'));
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      });
    }
    let row = reports.get(submitted.get(input.submissionId) ?? '');
    const reused = Boolean(row);
    if (!row) {
      row = report(input, scenario === 'queued', result);
      reports.set(row.id, row);
      submitted.set(input.submissionId, row.id);
      stats.created += 1;
    }
    publish();
    if (scenario === 'lost' && specialPending) {
      specialPending = false;
      throw new TypeError('controlled response lost after storing');
    }
    return response(receipt(row, reused));
  }
  const fetcher: typeof fetch = async (input, init) => {
    const href = input instanceof Request ? input.url : String(input);
    const url = new URL(href, 'http://controlled.invalid');
    const method = init?.method ?? 'GET';
    if (method === 'POST' && url.pathname.startsWith('/api/v1/research/submissions'))
      return submit(url.pathname, JSON.parse(String(init?.body)), init?.signal);
    stats.reads += 1;
    publish();
    if (method !== 'GET') {
      stats.blocked += 1;
      publish();
      throw new Error('受控页面阻止未声明的写入');
    }
    if (url.pathname === '/api/v1/research/capabilities')
      return response({
        version: 'research-capabilities-v2',
        canCreate: scenario !== 'closed',
        scopes,
      });
    if (url.pathname === '/api/v1/ai/runs/capabilities')
      return response({ canStart: true, providers: [], checkedAt: new Date().toISOString() });
    if (url.pathname === '/api/v1/ai/settings')
      return response({
        revision: 'controlled-browser-settings',
        researchDefault: { providerId: 'controlled-browser', model: 'controlled-model' },
        candidates: [],
      });
    if (url.pathname === '/api/market-data/instruments/search')
      return response([
        {
          id: instrument.instrumentId,
          symbol: instrument.symbol,
          canonicalCode: '600519',
          instrumentType: 'STOCK',
          market: 'SH',
          displayName: '受控目录标的',
          confirmable: true,
          disabledReason: null,
          generation: 0,
          active: true,
        },
      ]);
    if (url.pathname === '/api/v1/accounts') return response(browserResearchAccounts);
    if (url.pathname === '/api/v1/backtests/strategies')
      return response([
        {
          id: strategyId,
          name: '受控研究策略',
          schemaVersion: 2,
          versions: [{ id: strategyVersionId, version: 1, schemaVersion: 2, schema: {} }],
        },
      ]);
    if (url.pathname === '/api/v1/portfolio/valuation')
      return response({
        mode: url.searchParams.get('mode'),
        totalMarketValue: 1000,
        totalCost: 800,
        totalPnl: 200,
        cashValue: 0,
        partial: false,
        valuedAt: '2026-10-18T12:00:00Z',
        positions: [
          {
            id: 'fixture-position',
            accountId: url.searchParams.get('accountId'),
            symbol: instrument.symbol,
            quantity: 10,
            costPrice: 80,
            marketPrice: 100,
            marketValue: 1000,
            pnl: 200,
            stale: false,
            asset: { name: '受控目录标的', assetType: 'stock' },
          },
        ],
      });
    if (url.pathname === '/api/v1/research/reports') {
      const rows = [...reports.values()].filter(
        (row) =>
          matches(row, url.searchParams) &&
          (!url.searchParams.get('status') || row.status === url.searchParams.get('status')) &&
          (!url.searchParams.get('search') ||
            row.question?.includes(url.searchParams.get('search')!)),
      );
      return response({
        items: rows.map((row) => researchReportSummarySchema.strip().parse(row)),
        hasMore: false,
        nextCursor: null,
      });
    }
    if (url.pathname.startsWith('/api/v1/research/reports/')) return readReport(url);
    stats.blocked += 1;
    publish();
    throw new Error('受控页面阻止未声明的读取');
  };
  return {
    fetcher,
    stats: () => statsSnapshot,
    latest: () => latest,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
