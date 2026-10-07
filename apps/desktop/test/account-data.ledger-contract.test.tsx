import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiError, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import { CashSection } from '../src/features/account-data/AccountDataCashSections.js';
import { TransactionSection } from '../src/features/account-data/AccountDataSections.js';
import { cashDepositErrorMessage } from '../src/features/account-data/AccountDataCashDepositSheet.js';
import { cashTransferErrorMessage } from '../src/features/account-data/AccountDataCashTransferSheet.js';
import {
  ledgerContractRejected,
  ledgerContractErrorMessage,
} from '../src/features/account-data/account-data.ledger-contract.js';

const unsupported = new ThesisLedgerApiError(409, { error: 'UNSUPPORTED_CONTRACT_VERSION' });
const account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '测试账户',
  type: 'cash' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
};
const query = {
  data: { events: [], ledgerRevision: '1' },
  isError: true,
  error: unsupported,
  isPending: false,
  isFetching: false,
  refetch: vi.fn(async () => undefined),
};

describe('当前账本拒绝界面', () => {
  it('只将账本合同和持久旧行拒绝识别为不可消费，网络异常保持原路径', () => {
    expect(ledgerContractRejected(unsupported)).toBe(true);
    expect(ledgerContractRejected(new ThesisLedgerContractError('/ledger/a/events/audit'))).toBe(
      true,
    );
    expect(
      ledgerContractRejected(new ThesisLedgerApiError(503, { error: 'upstream_failure' })),
    ).toBe(false);
    expect(ledgerContractRejected(new ThesisLedgerContractError('/market/quote'))).toBe(false);
    expect(cashDepositErrorMessage(unsupported)).toBe(ledgerContractErrorMessage);
    expect(cashTransferErrorMessage(unsupported)).toBe(ledgerContractErrorMessage);
  });

  it('合同拒绝覆盖缓存成交，不显示缓存行、更正或创建入口', () => {
    const html = renderToStaticMarkup(
      <TransactionSection
        account={account}
        events={[]}
        query={query}
        filter="all"
        onFilterChange={vi.fn()}
        onCreate={vi.fn()}
        onCorrect={vi.fn()}
        onVoid={vi.fn()}
        onCorrectTransfer={vi.fn()}
        onVoidTransfer={vi.fn()}
        onAudit={vi.fn()}
        onOpenImport={vi.fn()}
        onOpenReconciliation={vi.fn()}
        findSnapshotPosition={() => undefined}
        onEditSnapshot={vi.fn()}
        onRemoveSnapshot={vi.fn()}
        resolveInstrumentName={() => undefined}
      />,
    );
    expect(html).toContain('账本记录格式不受支持');
    expect(html).not.toContain('记录成交');
    expect(html).not.toContain('显示的是上次成功读取的结果');
  });

  it('合同拒绝覆盖缓存现金，不把旧余额或入账划转入口当作可用结果', () => {
    const html = renderToStaticMarkup(
      <CashSection
        account={account}
        accounts={[account]}
        valuation={undefined}
        valuationQuery={{
          isError: false,
          isPending: false,
          isFetching: false,
          refetch: query.refetch,
        }}
        events={[]}
        eventsQuery={query}
        onCalibrate={vi.fn()}
        resolveInstrumentName={() => undefined}
      />,
    );
    expect(html).toContain('账本记录格式不受支持');
    expect(html).not.toContain('现金入账');
    expect(html).not.toContain('账户间划转');
    expect(html).not.toContain('现金流水可能陈旧');
  });
});
