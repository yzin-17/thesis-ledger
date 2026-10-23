export const ledgerAccountId = '00000000-0000-4000-8000-000000000001';
export const ledgerAccount = {
  id: ledgerAccountId,
  name: '受控模拟账户',
  institution: null,
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
  active: true,
};
export const emptyLedger = {
  accountId: ledgerAccountId,
  ledgerRevision: '7',
  projectionGeneration: '1',
  events: [],
  effective: true,
  instrumentDirectory: { generation: 1, items: [], unresolvedSymbols: [] },
};
export const ledgerWriteResult = {
  eventIds: ['00000000-0000-4000-8000-000000000003'],
  factIds: ['00000000-0000-4000-8000-000000000004'],
  ledgerRevisions: { [ledgerAccountId]: '8' },
  projectionGenerations: { [ledgerAccountId]: '2' },
  affectedSymbols: ['510300.SH'],
  idempotentReplay: false,
};
export const instrument = {
  id: '00000000-0000-4000-8000-000000000005',
  instrumentType: 'etf',
  market: 'CN',
  canonicalCode: '510300',
  displayName: '受控 ETF',
  symbol: '510300.SH',
  confirmable: true,
  disabledReason: null,
  generation: 1,
  active: true,
};
