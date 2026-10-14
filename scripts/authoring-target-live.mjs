import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  authoringDraftReadSchema,
  authoringStrategySchema,
  backtestResultSchemaV3,
} from '../packages/schemas/dist/index.js';

assert.deepEqual(process.argv.slice(2), ['--confirm=thesis-ledger-dev/thesis_ledger']);
const origin = 'http://127.0.0.1:3000';
const providerId = 'lmstudio';
const model = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m';
const tag = `nla6_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}_${randomUUID().slice(0, 8)}`;
const prefix = `${tag}.`;
const checks = [];
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const ownUsers = `SELECT id::text FROM "IdentityUser" WHERE starts_with(username,${literal(prefix)})`;
function sql(query) {
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'exec',
        'thesis-ledger-dev-postgres-1',
        'psql',
        '-U',
        'thesis_ledger',
        '-d',
        'thesis_ledger',
        '-Atq',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `BEGIN READ ONLY; ${query}; COMMIT;`,
      ],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
    ).trim(),
  );
}
function witness() {
  const tables = sql(
    "SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'",
  );
  const filters = new Map([
    ['IdentityUser', `id::text NOT IN (${ownUsers})`],
    ['IdentitySession', `"userId"::text NOT IN (${ownUsers})`],
    ...[
      'StrategyAuthoringDraft',
      'StrategyAuthoringRevision',
      'StrategyAuthoringOperation',
      'StrategyAuthoringProposal',
      'StrategyAuthoringSource',
      'AiInvocation',
    ].map((table) => [table, `"ownerId"::text NOT IN (${ownUsers})`]),
    ['Strategy', `coalesce("ownerId"::text,'') NOT IN (${ownUsers})`],
    [
      'StrategyVersion',
      `"strategyId" NOT IN (SELECT id FROM "Strategy" WHERE "ownerId"::text IN (${ownUsers}))`,
    ],
    [
      'AiInvocationFact',
      `"requestId" NOT IN (SELECT "requestId" FROM "AiInvocation" WHERE "ownerId"::text IN (${ownUsers}))`,
    ],
  ]);
  const rows = tables
    .filter((table) => !['AutomationJob', 'ProviderHealth', 'ProviderHealthCheck'].includes(table))
    .map(
      (table) =>
        `SELECT ${literal(table)} AS name,count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest
    FROM "${table}" t ${filters.has(table) ? `WHERE ${filters.get(table)}` : ''}`,
    );
  return sql(
    `SELECT json_object_agg(name,json_build_object('count',count,'digest',digest)) FROM (${rows.join(' UNION ALL ')})w`,
  );
}
async function request(label, path, status, body, token, method) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${origin}${path.startsWith('/api/') ? path : `/api/v1${path}`}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-thesis-ledger-session': token } : {}),
        ...(process.env.THESIS_LEDGER_LAN_TOKEN
          ? { authorization: `Bearer ${process.env.THESIS_LEDGER_LAN_TOKEN}` }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(180000),
    });
    if (response.status === 429 && attempt < 3) {
      const waitMs = Number(response.headers.get('retry-after') ?? 60) * 1000;
      assert(Number.isFinite(waitMs) && waitMs > 0 && waitMs <= 60000);
      console.log(JSON.stringify({ stage: '遵守限流窗口', label, waitMs }));
      await delay(waitMs);
      continue;
    }
    const data = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, `${label}：${JSON.stringify(data).slice(0, 1200)}`);
    checks.push({ label, status });
    return data;
  }
  throw new Error(`${label}仍被限流`);
}
async function finished(operation, token) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const row = await request(
      '读取原编写操作',
      `/strategy-authoring/operations/${operation.id}`,
      200,
      undefined,
      token,
    );
    if (!['queued', 'running'].includes(row.status)) {
      console.log(
        JSON.stringify({
          stage: '编写操作终态',
          id: row.id,
          kind: row.input.selection.kind,
          status: row.status,
          attempt: row.attempt,
          outcome: { ...row.outcome, outputText: undefined },
          invocations: row.invocations.map((invocation) => ({
            requestId: invocation.requestId,
            requestedModel: invocation.requestedModel,
            facts: invocation.facts.map((fact) => ({
              kind: fact.kind,
              details: { ...fact.details, outputText: undefined },
            })),
          })),
        }),
      );
      assert.equal(
        row.status,
        'succeeded',
        `${row.input.selection.kind}：${JSON.stringify(row.outcome)}`,
      );
      assert.equal(row.invocations.length, 1);
      assert.equal(row.invocations[0].requestedModel, model);
      assert.equal(Number(row.outcome.cost.amount), 0);
      assert.equal(row.outcome.cost.currency, 'USD');
      return row;
    }
    await delay(5000);
  }
  throw new Error(`操作 ${operation.id}未收敛；保留原意图，不重新提交`);
}
let alice;
let bob;
let draft;
let before;
let protectedChecked = false;
try {
  assert.equal(
    sql('SELECT to_json(version) FROM "SchemaVersion" WHERE id=1'),
    '20261006030000_strategy_authoring_save',
  );
  assert.equal(
    sql(`SELECT (SELECT count(*) FROM "BacktestJob" WHERE status IN ('queued','running'))+
    (SELECT count(*) FROM "AiRun" WHERE status IN ('queued','running'))+(SELECT count(*) FROM "StrategyAuthoringOperation" WHERE status IN ('queued','running'))`),
    0,
    '存在其他在途工作，先等待其结束再采集数据保护基线',
  );
  const providers = await request('读取现行模型', '/ai/providers', 200);
  const selected = providers.find((provider) => provider.name === providerId);
  assert(selected?.enabled && selected.models.includes(model));
  assert.equal(selected.modelPricing[model].costPer1kInput, 0);
  assert.equal(selected.modelPricing[model].costPer1kOutput, 0);
  assert.equal(selected.modelPricing[model].costCurrency, 'USD');
  before = witness();
  const password = randomBytes(24).toString('base64url');
  alice = await request('创建标记用户甲', '/identity/users', 201, {
    username: `${prefix}alice`,
    password,
    displayName: '自然语言纵向验收甲',
  });
  bob = await request('创建标记用户乙', '/identity/users', 201, {
    username: `${prefix}bob`,
    password,
    displayName: '自然语言纵向验收乙',
  });
  const directory = await request(
    '只读目录检索',
    '/api/market-data/instruments/search?q=159516&limit=5',
    200,
  );
  const instrument = directory.find(
    (item) =>
      item.active &&
      item.market === 'SZ' &&
      item.instrumentType === 'ETF' &&
      item.canonicalCode === '159516',
  );
  assert(instrument, '目录缺少明确 ETF 标的');
  const description =
    '只交易159516.SZ这一只ETF，使用1d日线，收盘价上穿20根K线的简单移动均线时买入、下穿同一均线时退出，每次使用权益的50%，固定止损3%，信号确认后的下一个可交易开盘执行市价DAY订单，佣金和滑点均明确为零，不增加其他规则。';
  draft = authoringDraftReadSchema.parse(
    await request(
      '创建完整输入草稿',
      '/strategy-authoring/drafts',
      201,
      {
        title: '自然语言真实纵向验收',
        description,
        questions: [],
        requirements: [],
        runtimeIntents: [],
        removedRequirements: [],
        definitionText: '',
        manualChanges: [],
      },
      alice.token,
    ),
  );
  console.log(
    JSON.stringify({
      stage: '本次范围',
      tag,
      draftId: draft.id,
      ownerId: alice.principal.id,
      instrumentId: instrument.id,
    }),
  );
  const submit = (kind, key, extra = {}) =>
    request(
      `提交 ${kind}`,
      `/strategy-authoring/drafts/${draft.id}/operations`,
      201,
      {
        kind,
        expectedRevision: draft.revision,
        idempotencyKey: key,
        providerId,
        model,
        intent: '',
        unknownCostAcknowledgedAt: null,
        ...extra,
      },
      alice.token,
    );
  const analysisKey = randomUUID();
  const analysis = await submit('analyze', analysisKey);
  assert.equal((await submit('analyze', analysisKey)).id, analysis.id);
  await request(
    '跨用户操作隔离',
    `/strategy-authoring/operations/${analysis.id}`,
    404,
    undefined,
    bob.token,
  );
  await finished(analysis, alice.token);
  await request(
    '明确应用分析',
    `/strategy-authoring/operations/${analysis.id}/apply-analysis`,
    201,
    { expectedRevision: draft.revision },
    alice.token,
  );
  draft = authoringDraftReadSchema.parse(
    await request(
      '读取分析后修订',
      `/strategy-authoring/drafts/${draft.id}`,
      200,
      undefined,
      alice.token,
    ),
  );
  const confirmation = {
    instrumentId: instrument.id,
    instrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
    timeframe: '1d',
    entrySummary: '收盘价上穿20根K线的简单移动均线时买入',
    exitSummary: '收盘价下穿同一20根K线均线时退出',
    sizing: { type: 'percentOfEquity', percent: '0.5' },
    risk: [{ type: 'fixedStop', percent: '0.03' }],
    noExtraRiskConfirmed: false,
    execution: {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    },
    cost: { commissionRate: '0', slippageRate: '0' },
    periodsAreBarsConfirmed: true,
  };
  // 受控验收作者提供完整明确答案；不能把模型建议自动当作用户确认。
  const content = {
    ...draft.content,
    confirmation: null,
    questions: draft.content.questions.map((question) => ({
      ...question,
      answer: description,
      answerState: 'confirmed',
    })),
    requirements: [
      {
        id: 'explicit-rules',
        quote: description,
        interpretation: description,
        state: 'understood',
        definitionPaths: [],
      },
    ],
  };
  draft = authoringDraftReadSchema.parse(
    await request(
      '作者确认全部交易含义',
      `/strategy-authoring/drafts/${draft.id}`,
      200,
      { expectedRevision: draft.revision, content },
      alice.token,
      'PATCH',
    ),
  );
  draft = authoringDraftReadSchema.parse(
    await request(
      '问题完成后明确确认交易条件',
      `/strategy-authoring/drafts/${draft.id}`,
      200,
      { expectedRevision: draft.revision, content: { ...draft.content, confirmation } },
      alice.token,
      'PATCH',
    ),
  );
  const generation = await submit('generate', randomUUID());
  await finished(generation, alice.token);
  const applied = await request(
    '明确应用生成',
    `/strategy-authoring/operations/${generation.id}/apply-generation`,
    201,
    { expectedRevision: draft.revision },
    alice.token,
  );
  assert.equal(
    (
      await request(
        '生成应用幂等重放',
        `/strategy-authoring/operations/${generation.id}/apply-generation`,
        201,
        { expectedRevision: draft.revision },
        alice.token,
      )
    ).appliedRevision,
    applied.appliedRevision,
  );
  draft = authoringDraftReadSchema.parse(
    await request(
      '恢复生成结果',
      `/strategy-authoring/drafts/${draft.id}`,
      200,
      undefined,
      alice.token,
    ),
  );
  const definitionBefore = authoringStrategySchema.parse(draft.content.definitionText);
  for (const [condition, direction] of [
    [definitionBefore.entry, 'above'],
    [definitionBefore.exit, 'below'],
  ]) {
    assert.equal(condition.type, 'cross');
    assert.equal(condition.direction, direction);
    assert.equal(condition.left.type, 'series');
    assert.equal(condition.left.field, 'close');
    assert.equal(condition.right.type, 'indicator');
    assert.equal(condition.right.name, 'MA');
    assert.equal(condition.right.params.period, 20);
  }
  const modification = await submit('modify', randomUUID(), {
    intent: '固定止损改为5%，其他不变',
    modificationTarget: 'risk',
  });
  await finished(modification, alice.token);
  const proposal = await request(
    '创建范围内建议',
    `/strategy-authoring/operations/${modification.id}/proposal`,
    201,
    { expectedRevision: draft.revision },
    alice.token,
  );
  const proposalId = proposal.id;
  await request(
    '跨用户建议隔离',
    `/strategy-authoring/proposals/${proposalId}`,
    404,
    undefined,
    bob.token,
  );
  await request(
    '作者确认止损差异',
    `/strategy-authoring/proposals/${proposalId}/apply`,
    201,
    { expectedRevision: draft.revision },
    alice.token,
  );
  draft = authoringDraftReadSchema.parse(
    await request(
      '恢复修改后定义',
      `/strategy-authoring/drafts/${draft.id}`,
      200,
      undefined,
      alice.token,
    ),
  );
  const definitionAfter = authoringStrategySchema.parse(draft.content.definitionText);
  assert.deepEqual({ ...definitionAfter, risk: definitionBefore.risk }, definitionBefore);
  assert.deepEqual(definitionAfter.risk, [{ type: 'fixedStop', percent: '0.05' }]);
  const review = await request(
    '读取明确修订最终审核',
    `/strategy-authoring/drafts/${draft.id}/review`,
    200,
    undefined,
    alice.token,
  );
  const save = {
    expectedRevision: review.revision,
    name: `自然语言验收 ${tag}`,
    reviewedDefinitionHash: review.definitionHash,
  };
  const saved = await request(
    '确认正式保存',
    `/strategy-authoring/drafts/${draft.id}/save`,
    201,
    save,
    alice.token,
  );
  assert.deepEqual(
    await request(
      '响应重试只返回同一v1',
      `/strategy-authoring/drafts/${draft.id}/save`,
      201,
      save,
      alice.token,
    ),
    saved,
  );
  assert.equal(saved.version, 1);
  const source = await request(
    '读取固定创建来源',
    `/strategy-authoring/versions/${saved.versionId}/source`,
    200,
    undefined,
    alice.token,
  );
  assert.equal(source.snapshot.kind, 'ai_assisted');
  assert.equal(source.snapshot.content.description, description);
  await request(
    '跨用户来源隔离',
    `/strategy-authoring/versions/${saved.versionId}/source`,
    404,
    undefined,
    bob.token,
  );
  const list = await request(
    '归属用户正式策略列表',
    '/backtests/strategies',
    200,
    undefined,
    alice.token,
  );
  assert(
    list.some(
      (item) =>
        item.id === saved.strategyId &&
        item.versions.some(
          (version) => version.id === saved.versionId && version.source.kind === 'ai_assisted',
        ),
    ),
  );
  assert(
    !(await request('匿名不可列出私有策略', '/backtests/strategies', 200)).some(
      (item) => item.id === saved.strategyId,
    ),
  );
  await request(
    '跨用户不可给私有策略发布版本',
    `/backtests/strategies/${saved.strategyId}/versions`,
    404,
    { schema: definitionAfter },
    bob.token,
  );
  const jobs = () =>
    sql(
      `SELECT count(*)::int FROM "BacktestJob" WHERE "strategyVersionId"=${literal(saved.versionId)}`,
    );
  assert.equal(jobs(), 0, '保存不能自动产生回测');
  assert.deepEqual(witness(), before);
  protectedChecked = true;
  console.log(
    JSON.stringify({
      stage: '描述到正式v1完成',
      tag,
      ...saved,
      draftId: draft.id,
      revision: draft.revision,
      definitionHash: review.definitionHash,
      definition: definitionAfter,
      protectedTables: Object.keys(before).length,
      automaticBacktests: jobs(),
      checks,
    }),
  );

  // 验收作者明确发起一次真实数据回测，复用现行共同价格研究模型的公开假设。
  const seed =
    sql(`SELECT row_to_json(t) FROM (SELECT input FROM "BacktestJob" WHERE mode='V3' AND status='succeeded'
    AND input->'runConfig'->'executionModel'->>'id' LIKE 'common-price-tencent%' ORDER BY "createdAt" DESC LIMIT 1)t`);
  assert(seed, '缺少真实共同价格研究执行模型');
  const runConfig = structuredClone(seed.input.runConfig);
  assert.equal(runConfig.executionModel.scope.symbol, definitionAfter.executionInstrument.symbol);
  const {
    priceBasis: { adjustment },
    accountingBasis,
    history,
  } = runConfig.executionPriceProtocol;
  for (const key of [
    'schemaVersion',
    'executionPriceProtocol',
    'priceInputBindings',
    'frozenExecutionWindow',
    'frozenWarmupBudgetSessions',
  ])
    delete runConfig[key];
  runConfig.dataAsOf = new Date().toISOString();
  const prepared = await request(
    '作者明确准备真实回测数据',
    '/backtests/run-config/prepare',
    201,
    {
      contractVersion: 3,
      requestId: `${tag}-prepare`,
      strategyVersionId: saved.versionId,
      runConfig,
      adjustment,
      accountingBasis,
      history,
      freezeTimePolicy: 'after-acquisition',
    },
    alice.token,
  );
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared.diagnostics));
  await request(
    '跨用户回测版本门禁',
    '/backtests/run-config/preflight',
    404,
    { strategyVersionId: saved.versionId },
    bob.token,
  );
  const runInput = {
    contractVersion: 3,
    strategyVersionId: saved.versionId,
    runConfig: prepared.runConfig,
    preparationStamp: prepared.executionPreflight.revisionStamp,
    idempotencyKey: `${tag}-explicit-backtest`,
  };
  const run = await request('作者明确创建回测', '/backtests/runs', 201, runInput, alice.token);
  assert.equal(
    (await request('回测意图幂等', '/backtests/runs', 201, runInput, alice.token)).id,
    run.id,
  );
  await request('跨用户回测读取隔离', `/backtests/runs/${run.id}`, 404, undefined, bob.token);
  let terminal;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const row = await request(
      '读取已有回测',
      `/backtests/runs/${run.id}`,
      200,
      undefined,
      alice.token,
    );
    if (!['queued', 'running'].includes(row.status)) {
      terminal = row;
      break;
    }
    await delay(5000);
  }
  assert(terminal, '真实回测未在窗口内收敛');
  assert.equal(terminal.status, 'succeeded', JSON.stringify(terminal));
  const record = sql(`SELECT row_to_json(t) FROM "BacktestJob" t WHERE id=${literal(run.id)}`);
  const result = backtestResultSchemaV3.parse(record.result);
  assert(result.equityCurve.length > 1, '真实结果必须有可读取的权益曲线');
  console.log(
    JSON.stringify({
      stage: '真实回测完成',
      tag,
      runId: run.id,
      versionId: saved.versionId,
      status: terminal.status,
      dataSource: prepared.actualSource,
      actualSources: result.actualSources,
      completeness: result.completeness,
      equityCurvePoints: result.equityCurve.length,
      firstEquityPoint: result.equityCurve[0],
      lastEquityPoint: result.equityCurve.at(-1),
      trades: result.trades.length,
      fills: result.simulationFills.length,
      rejectedOrders: result.rejectedOrders,
      warnings: result.warnings,
      metrics: result.metrics,
      checks: checks.length,
    }),
  );
} finally {
  try {
    if (before && !protectedChecked) {
      const after = witness();
      const changed = Object.keys(before).filter(
        (table) => JSON.stringify(after[table]) !== JSON.stringify(before[table]),
      );
      console.log(JSON.stringify({ stage: '失败窗口数据保护检查', changedTables: changed }));
      assert.equal(changed.length, 0, '失败过程也必须保留原业务数据');
    }
  } finally {
    const results = await Promise.allSettled(
      [alice, bob]
        .filter(Boolean)
        .map((identity) =>
          request('撤销本次标记会话', '/identity/session/revoke', 204, {}, identity.token),
        ),
    );
    for (const result of results)
      if (result.status === 'rejected') console.error('本次标记会话撤销失败，保留其原审计记录');
  }
}
