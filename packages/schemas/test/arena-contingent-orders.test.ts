import { describe, expect, it } from 'vitest';
import { arenaLiveDecisionSchema } from '../src/arena-live-protocol.js';
import { arenaLiveAccountSchema } from '../src/arena-live-state.js';
import { arenaGenerationContracts } from '../src/arena-generation-contracts.js';

const decision = () => ({ summary: '受控配置', orders: [{ clientId: 'entry', symbol: 'AAPL.US', side: 'buy', kind: 'limit',
  quantity: '27', price: '359.50', expiresOn: '2026-11-13', exitGroup: null,
  onFill: { activation: 'on_full_fill', activateOrders: [{ clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '355',
    quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'activation_session_close' } }] },
}], cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'price', symbol: 'AAPL.US', operator: 'lte', price: '357' }] });

describe('竞技场正式生成合同', () => {
  it('实际模型信封接受空仓父子配置，生成合同显式升级', () => {
    const contract = arenaGenerationContracts.arenaLiveResearch;
    expect(contract.ref.version).toBe('arena-live-research-v1');
    const generated = decision();
    Object.assign(generated.orders[0]!.onFill, { afterExit: 'cancel_entry_remainder', exitPolicy: 'single' });
    expect(contract.schema.safeParse({ action: 'decision', decision: generated }).success).toBe(true);
    expect(contract.schema.safeParse({ action: 'decision', decision: decision() }).success).toBe(false);
    expect(arenaLiveDecisionSchema.safeParse(decision()).success).toBe(true);
  });
  it('全局校验父子标识，逐次保护必须声明退出后处置', () => {
    const d = decision(); d.orders[0]!.onFill.activateOrders[0]!.clientId = 'entry';
    expect(arenaLiveDecisionSchema.safeParse(d).success).toBe(false);
    const each = decision(); each.orders[0]!.onFill.activation = 'on_each_fill';
    const result = arenaLiveDecisionSchema.safeParse(each);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['orders', 0, 'onFill', 'afterExit']);
    expect(arenaLiveDecisionSchema.safeParse({ ...each, orders: [{ ...each.orders[0], onFill: { ...each.orders[0]!.onFill, afterExit: 'cancel_entry_remainder' } }] }).success).toBe(true);
    const sell = decision(); sell.orders[0]!.side = 'sell';
    expect(arenaLiveDecisionSchema.safeParse(sell).success).toBe(false);
  });
  it('附属OCO要求独立同组同期限的两腿', () => {
    const d = decision();
    const stop = { ...d.orders[0]!.onFill.activateOrders[0]!, exitGroup: 'attached' };
    d.orders[0]!.onFill.activateOrders = [stop, { ...stop, clientId: 'take', kind: 'take_profit', price: '375' }];
    expect(arenaLiveDecisionSchema.safeParse(d).success).toBe(true);
    d.orders[0]!.onFill.activateOrders[1]!.validUntil = { kind: 'date', expiresOn: '2026-11-16' } as never;
    expect(arenaLiveDecisionSchema.safeParse(d).success).toBe(false);
  });
  it('拒绝跨批引用、超额分档和止盈腿上的移动止损，完整动态与分批合同可生成', () => {
    const d = decision(), parent = d.orders[0]!;
    const stop = parent.onFill.activateOrders[0]!;
    const trailing = { priceSource: 'executable_quote', reference: 'highest_since_activation', distance: { kind: 'percent', value: '2' }, breakEven: null };
    const staged = { ...parent, onFill: { ...parent.onFill, exitPolicy: 'staged', activateOrders: [{ ...stop, trailing },
      { ...stop, clientId: 'take', kind: 'take_profit', price: '375', quantity: { basis: 'parent_filled_fraction', numerator: 1, denominator: 3 } }] } };
    expect(arenaLiveDecisionSchema.safeParse({ ...d, orders: [staged] }).success).toBe(true);
    const each = { ...staged, onFill: { ...staged.onFill, activation: 'on_each_fill', afterExit: 'keep_entry_remainder' } };
    expect(arenaGenerationContracts.arenaLiveResearch.schema.safeParse({ action: 'decision', decision: { ...d, orders: [each] } }).success).toBe(true);
    expect(arenaLiveDecisionSchema.safeParse({ ...d, orders: [{ ...staged, entryAfter: { clientId: 'missing', activation: 'on_full_fill' } }] }).success).toBe(false);
    const invalid = structuredClone(staged); invalid.onFill.activateOrders.push({ ...invalid.onFill.activateOrders[1]!, clientId: 'take2', quantity: { basis: 'parent_filled_fraction', numerator: 1, denominator: 1 } });
    expect(arenaLiveDecisionSchema.safeParse({ ...d, orders: [invalid] }).success).toBe(false);
    const wrongKind = structuredClone(staged); Object.assign(wrongKind.onFill.activateOrders[1]!, { trailing });
    expect(arenaLiveDecisionSchema.safeParse({ ...d, orders: [wrongKind] }).success).toBe(false);
  });
  it('旧决策及旧账户可直接读取，不回填或改写历史含义', () => {
    const d = decision(); const legacy = { ...d.orders[0]! }; Reflect.deleteProperty(legacy, 'onFill');
    expect(arenaLiveDecisionSchema.parse({ ...d, orders: [legacy] }).orders[0]).toEqual(legacy);
    const book = { revision: 0, cash: '10000', positions: [], orders: [], fills: [], wakeups: [], watchedSymbols: [], cashSettlements: [] };
    expect(arenaLiveAccountSchema.parse(book)).toEqual(book);
  });
  it('原先把买卖单放同一exitGroup仍非法，旧持仓OCO继续有效', () => {
    const d = decision(); const buy = { ...d.orders[0]! }; Reflect.deleteProperty(buy, 'onFill');
    const stop = { ...buy, clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '355', exitGroup: 'exit' };
    expect(arenaLiveDecisionSchema.safeParse({ ...d, orders: [{ ...buy, exitGroup: 'exit' }, stop] }).success).toBe(false);
    expect(arenaLiveDecisionSchema.safeParse({ ...d, orders: [stop, { ...stop, clientId: 'take', kind: 'take_profit', price: '370' }] }).success).toBe(true);
  });
});
