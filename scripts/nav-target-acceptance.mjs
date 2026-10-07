import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { deterministicResultChecksum } from '../packages/domain/dist/index.js';
import {
  backtestNavRunResponseV3Schema,
  backtestNavPreparationResultV3Schema,
} from '../packages/schemas/dist/index.js';

// 目标开发环境验收：实际来源与 Worker，费用和日期规则仍是显式研究配置。
const origin = process.env.NAV_ACCEPTANCE_ORIGIN ?? 'http://127.0.0.1:3000';
const symbol = process.env.NAV_ACCEPTANCE_SYMBOL ?? '161725.OF';
const fundType = process.env.NAV_ACCEPTANCE_FUND_TYPE ?? 'domestic';
const startDate = '2026-09-08';
const endDate = process.env.NAV_ACCEPTANCE_END_DATE ?? '2026-09-21';
const configuredAt = new Date().toISOString();
const headers = { 'content-type': 'application/json' };
if (process.env.THESIS_LEDGER_API_TOKEN)
  headers.authorization = `Bearer ${process.env.THESIS_LEDGER_API_TOKEN}`;
const request = async (path, body) => {
  const response = await fetch(new URL(`/api/v1${path}`, origin), {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(150000),
  });
  const payload = await response.json();
  return { status: response.status, payload };
};
const requireStatus = (reply, status) => {
  if (reply.status !== status)
    throw new Error(`HTTP ${reply.status}，预期 ${status}：${JSON.stringify(reply.payload)}`);
  return reply.payload;
};
const model = JSON.parse(
  await readFile(
    new URL('../packages/schemas/fixtures/backtest-execution-model.nav-fund.json', import.meta.url),
    'utf8',
  ),
);
model.id = `nav-target-research-${symbol}`;
model.scope.symbol = symbol;
model.scope.range.end = endDate;
model.segments[0].range.end = endDate;
model.segments[0].source = {
  kind: 'researchPreset',
  revision: 'target-acceptance-v1',
  configuredAt,
  description:
    '目标验收显式申赎研究模型：申购和赎回费率各 1%，确认 T+1、份额可卖 T+1、赎回现金再投资 T+2；费用不宣称来自基金真实渠道。',
  references: ['docs/specs/2026-10-01-n3-nav-worker.md'],
};
const schema = {
  schemaVersion: '2',
  name: `NAV 目标验收 ${symbol}`,
  signalSources: [
    {
      id: 'nav',
      asset: { symbol, market: 'CN', assetType: 'fund' },
      timeframe: '1d',
      series: ['nav'],
    },
  ],
  executionInstrument: { symbol, market: 'CN', assetType: 'fund' },
  primaryTimeframe: '1d',
  entry: {
    type: 'compare',
    operator: 'gt',
    left: {
      type: 'indicator',
      name: 'MA',
      params: { period: 4 },
      input: { type: 'series', sourceId: 'nav', field: 'nav' },
    },
    right: { type: 'constant', value: '0' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedQuantity', quantity: '10' },
  risk: [],
  execution: { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' },
  cost: { commissionRate: '0', slippageRate: '0' },
};
const created = requireStatus(
  await request('/backtests/strategies', {
    name: `N4 NAV ${symbol} ${configuredAt}`,
    description: 'N3/N4 目标验收记录，实际净值来源，显式研究假设。',
    schema,
  }),
  201,
);
const strategyVersionId = created.versions?.at(-1)?.id;
if (!strategyVersionId) throw new Error('创建策略未返回版本身份');
const intent = {
  contractVersion: 3,
  requestId: `nav-target-${randomUUID()}`,
  strategyVersionId,
  fundType,
  visibilityMode: 'research-assumption',
  freezeTimePolicy: 'after-acquisition',
  runConfig: {
    schemaVersion: '3',
    startDate,
    endDate,
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    executionModel: model,
    navInput: { kind: 'nav', symbol },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '20:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
  },
  calendarDecisionRaw: JSON.stringify({
    schemaVersion: 'nav-research-calendar-decision-v1',
    symbol,
    basis: 'nav-dates-xshg-intersection-v1',
    configuredAt,
    decision:
      '用户已选择研究假设；本次目标验收显式使用实际净值日期与 XSHG 工作日交集，不据此推断暂停、限购或渠道差异。',
  }),
  domesticRuleDecisionRaw:
    fundType === 'domestic'
      ? JSON.stringify({
          schemaVersion: 'nav-research-default-v1',
          symbol,
          fundType,
          delayWorkdays: 1,
          applicableRange: { startDate: '2026-09-02', endDate },
          configuredAt,
          decision:
            '用户已选择普通基金 T+1 一般研究假设；本次目标验收使用该假设，不宣称严格历史发布时间证据。',
        })
      : null,
};
const prepareStarted = Date.now();
const preparation = backtestNavPreparationResultV3Schema.parse(
  requireStatus(await request('/backtests/run-config/nav/prepare', intent), 200),
);
if (preparation.status !== 'prepared')
  throw new Error(`NAV 准备阻断：${JSON.stringify(preparation.diagnostics)}`);
if (!preparation.receipt) throw new Error('目标准备未返回持久化凭证');
const preparationMs = Date.now() - prepareStarted;
const createBody = {
  contractVersion: 3,
  preparationId: preparation.receipt.preparationId,
  preparationHash: preparation.receipt.preparationHash,
  idempotencyKey: `nav-target-${randomUUID()}`,
};
const initial = backtestNavRunResponseV3Schema.parse(
  requireStatus(await request('/backtests/runs/nav', createBody), 201),
);
const repeated = backtestNavRunResponseV3Schema.parse(
  requireStatus(await request('/backtests/runs/nav', createBody), 201),
);
if (initial.id !== repeated.id) throw new Error('创建幂等身份改变');
let run = initial;
const deadline = Date.now() + 120000;
while (!['succeeded', 'failed', 'cancelled'].includes(run.status) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  run = backtestNavRunResponseV3Schema.parse(
    requireStatus(await request(`/backtests/runs/nav/${run.id}`), 200),
  );
}
if (run.status !== 'succeeded' || !run.result)
  throw new Error(`NAV Worker 未成功：${run.status}/${run.errorCode}/${run.errorSummary}`);
const { resultChecksum, ...payload } = run.result;
if (deterministicResultChecksum(payload) !== resultChecksum)
  throw new Error('公开结果 checksum 不符');
if (run.result.simulationFills.length === 0)
  throw new Error('真实来源未产生经济事件，不能作为交易业务验收');
const malformed = await request('/backtests/runs/nav', { contractVersion: 2, strategyVersionId });
if (malformed.status !== 400) throw new Error(`旧创建合同未拒绝：${malformed.status}`);
const invalidDecision = await request('/backtests/run-config/nav/prepare', {
  ...intent,
  calendarDecisionRaw: '{}',
});
if (invalidDecision.status !== 400) throw new Error(`缺日期决策未拒绝：${invalidDecision.status}`);
if (
  run.result.executionSymbol !== symbol ||
  run.result.navVisibility.mode !== 'research-assumption' ||
  run.result.visibilityDisclosure.strictPit !== false ||
  run.result.navSource.target.providerId !== 'efinance' ||
  run.result.navSource.target.upstreamSource !== 'eastmoney'
)
  throw new Error('目标来源、基金或研究模式披露与请求不一致');
const evidence = {
  checkedAt: new Date().toISOString(),
  origin,
  symbol,
  fundType,
  preparationMs,
  strategyId: created.id,
  strategyVersionId,
  runId: run.id,
  initialStatus: initial.status,
  status: run.status,
  executionAttempt: run.executionAttempt,
  engineVersion: run.engineVersion,
  snapshotId: run.snapshotId,
  resultChecksum: run.resultChecksum,
  source: run.result.navSource,
  navVisibility: run.result.navVisibility,
  visibilityDisclosure: run.result.visibilityDisclosure,
  completeness: run.result.completeness,
  diagnostics: run.result.diagnostics,
  cash: run.result.cash,
  position: run.result.position,
  requests: run.result.requests,
  pendingRequestIds: run.result.pendingRequestIds,
  fills: run.result.simulationFills,
  trades: run.result.trades,
  equityCurve: run.result.equityCurve,
  benchmark: run.result.benchmark,
  idempotency: repeated.id === run.id,
  rejectedOldContractStatus: malformed.status,
  rejectedDecisionStatus: invalidDecision.status,
};
const output = process.env.NAV_ACCEPTANCE_OUTPUT ?? '/private/tmp/n4-nav-target-acceptance.json';
await writeFile(output, JSON.stringify(evidence, null, 2));
console.log(
  JSON.stringify({
    runId: run.id,
    symbol,
    status: run.status,
    executionAttempt: run.executionAttempt,
    preparationMs,
    fills: run.result.simulationFills.length,
    requests: run.result.requests.length,
    pending: run.result.pendingRequestIds.length,
    completeness: run.result.completeness,
    output,
  }),
);
