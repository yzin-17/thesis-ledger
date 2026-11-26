import { ledgerEventEnvelopeSchema } from '@thesis-ledger/schemas';
import { createDefaultStrategySchema } from '../src/features/strategy/strategy.schema.js';
import { journalUiEvidenceFixture } from './journal-review.fixture.js';
import { browserJournalCandidate } from './browser-journal-candidate.fixture.js';

export const drawerAccount = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '隔离验收证券账户',
  type: 'securities' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
};
export const drawerPosition = {
  id: 'position-fixture',
  accountId: drawerAccount.id,
  instrumentId: '11111111-1111-4111-8111-111111111112',
  symbol: '510300.SH',
  quantity: 100,
  costPrice: 4.123456789,
  marketPrice: 4.3,
  marketValue: 430,
  pnl: 17.6543211,
  stale: false,
  currency: 'CNY' as const,
  asset: { name: '隔离验收基金', assetType: 'etf' as const },
};
export const drawerEvent = {
  version: 1 as const,
  eventId: '22222222-2222-4222-8222-222222222222',
  factId: '33333333-3333-4333-8333-333333333333',
  accountId: drawerAccount.id,
  ledgerRevision: '1',
  type: 'BUY_EXECUTION' as const,
  occurredAt: '2026-10-01T02:00:00.000Z',
  timePrecision: 'INSTANT' as const,
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'a0',
  recordedAt: '2026-10-01T02:00:00.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL' as const, channel: 'desktop' },
  actorId: 'fixture',
  revisionAction: 'CREATE' as const,
  payload: {
    symbol: drawerPosition.symbol,
    quantity: '100',
    price: '4.123456789',
    currency: 'CNY' as const,
    capabilityVerification: 'VERIFIED' as const,
    charges: [],
    note: '隔离验收说明。'.repeat(12),
  },
};
export const drawerTransfer = {
  ...drawerEvent,
  type: 'CASH_FLOW' as const,
  payload: {
    amount: '1000',
    currency: 'CNY',
    direction: 'OUTFLOW',
    category: 'TRANSFER',
    transfer: {
      leg: 'OUTFLOW',
      counterpartyAccountId: '44444444-4444-4444-8444-444444444444',
      transferId: '55555555-5555-4555-8555-555555555555',
    },
    note: '隔离现金划转说明。'.repeat(8),
  },
};
export const drawerQuery = (data: unknown, error = false) => ({
  data,
  isError: error,
  isPending: false,
  isFetching: false,
  dataUpdatedAt: 1,
  error: error ? new Error('隔离读取失败，原始数据保留。'.repeat(12)) : null,
  refetch: async () => ({ data }),
});
export const drawerAudit = {
  accountId: drawerAccount.id,
  events: Array.from({ length: 12 }, (_, i) => ({
    ...drawerEvent,
    eventId: `22222222-2222-4222-8222-${String(i + 1).padStart(12, '0')}`,
    revisionAction: i === 0 ? 'CREATE' : 'REPLACE',
    reason: '隔离修正原因与核验记录。'.repeat(8),
  })),
  instrumentDirectory: {
    generation: 1,
    items: [{ symbol: drawerPosition.symbol, name: drawerPosition.asset.name }],
    unresolvedSymbols: [],
  },
};
export const drawerCandidate = {
  candidateId: 'reconciliation-fixture',
  symbol: drawerPosition.symbol,
  baselineEventId: drawerEvent.eventId,
  observedQuantity: '100',
  coveredQuantity: '20',
  remainingQuantity: '80',
  observedCost: '400',
  coveredCost: '80',
  remainingCost: '320',
  status: 'AVAILABLE',
  matchBasis: ['EXACT_SYMBOL'],
  conflictReasons: [],
  executionFactIds: [drawerEvent.factId],
};
const schema = createDefaultStrategySchema('隔离验收策略');
schema.executionInstrument = { symbol: drawerPosition.symbol, market: 'CN', assetType: 'etf' };
schema.signalSources = [
  {
    id: 'execution',
    asset: { symbol: drawerPosition.symbol, market: 'CN', assetType: 'etf' },
    timeframe: '1d',
    series: ['open', 'close'],
  },
];
export const drawerStrategy = {
  id: 'fixture-strategy',
  name: '隔离验收策略',
  active: true,
  versions: [
    {
      id: 'fixture-version',
      version: 1,
      schema,
      createdAt: '2026-11-01T00:00:00Z',
      status: 'draft',
      description: '隔离验收版本',
    },
  ],
};
export const drawerJournalInput = journalUiEvidenceFixture();
export const drawerJournalCandidate = browserJournalCandidate(drawerJournalInput);
export const drawerProvider = {
  providerId: 'hithink',
  displayName: '隔离行情来源',
  version: 1,
  configVersion: 1,
  configured: true,
  enabled: true,
  credentialConfigured: true,
  requiresCredential: true,
  capabilities: {},
  credentialSource: 'configured',
  settings: {},
  upstreamSources: [],
  credentialSchema: {
    methods: [
      {
        method: 'api_key',
        label: '接口密钥',
        fields: [
          { name: 'apiKey', label: '接口密钥', secret: true, required: true },
          { name: 'endpoint', label: '服务地址', secret: false, required: true },
        ],
      },
    ],
  },
};
export const drawerLongRun = {
  id: 'fixture-long-research',
  question: '隔离研究问题。'.repeat(30),
  status: 'succeeded',
  provider: 'fixture',
  model: 'fixture-model',
  createdAt: '2026-11-01T00:00:00Z',
  durationMs: 1000,
  promptVersion: 'fixture',
  display: {
    primaryStatus: 'completed',
    resultAvailability: 'available',
    capabilities: { canRetry: false },
    source: { href: 'https://example.invalid/source', label: '隔离来源' },
  },
  result: {
    conclusion: '隔离长报告结论。'.repeat(80),
    risks: ['隔离风险。'.repeat(20)],
    unknowns: ['隔离未知项。'.repeat(20)],
    signals: [],
    evidence: Array.from({ length: 10 }, (_, i) => ({
      claim: `隔离证据 ${i + 1}`,
      citations: [
        {
          sourceId: 'fixture',
          tool: 'fixture',
          provider: 'fixture',
          observedAt: '2026-11-01T00:00:00Z',
        },
      ],
    })),
    disclaimer: '隔离样例，不连接真实服务。',
  },
};
export const drawerImportDraft = {
  id: '66666666-6666-4666-8666-666666666666',
  accountId: drawerAccount.id,
  source: 'unknown',
  status: 'pending',
  createdAt: '2026-11-01T00:00:00Z',
  review: {
    revision: 1,
    parserVersion: 'fixture@1',
    rawEvidenceRef: 'controlled://fixture',
    contentHash: 'a'.repeat(64),
    scope: 'PARTIAL',
    observedAt: '2026-11-01',
    capturedAt: '2026-11-01T00:00:00Z',
    timePrecision: 'DATE',
    sourceTimezone: 'Asia/Shanghai',
    frozenRowIds: [],
    rows: Array.from({ length: 12 }, (_, i) => ({
      rowId: `fixture-${i}`,
      kind: 'POSITION_BASELINE',
      symbol: i % 2 ? '159919.SZ' : '510300.SH',
      quantity: '1.123456789012345678',
      averageCost: '4.123456789',
      currency: 'CNY',
      costIncludesFees: 'UNKNOWN',
      assetType: 'etf',
      issues: [],
    })),
  },
};

const { payload: executionPayload, ...voidEnvelope } = drawerEvent;
void executionPayload;
export const drawerVoid = {
  ...voidEnvelope,
  eventId: '77777777-7777-4777-8777-777777777777',
  revisionAction: 'VOID' as const,
  supersedesEventId: drawerEvent.eventId,
  reason: '隔离作废记录',
};

ledgerEventEnvelopeSchema.parse(drawerTransfer);
ledgerEventEnvelopeSchema.parse(drawerVoid);
