import { expect, it } from 'vitest';
import { z } from 'zod';
import { arenaLiveGeneratedOrderSchema } from '../src/arena-live-generated-orders.js';
import { arenaOrderInputSchema } from '../src/arena-live-protocol.js';
import { arenaGenerationRefSchemas } from '../src/arena-generation-contracts.js';

const sell = { clientId: 'sell', symbol: '510300.SH', side: 'sell', kind: 'market',
  quantity: '5000', price: null, expiresOn: null, exitGroup: null, onFill: null };
const single = { activation: 'on_full_fill', afterExit: 'cancel_entry_remainder', exitPolicy: 'single',
  activateOrders: [{ clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '4',
    quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'activation_session_close' } }] };

it('市价卖单无需保护或到期日，非法字段组合不能生成', () => {
  expect(arenaLiveGeneratedOrderSchema.safeParse(sell).success).toBe(true);
  for (const patch of [{ onFill: single }, { expiresOn: '2026-11-02' },
    { entryAfter: { clientId: 'entry', activation: 'on_full_fill' } }])
    expect(arenaLiveGeneratedOrderSchema.safeParse({ ...sell, ...patch }).success).toBe(false);
  expect(arenaLiveGeneratedOrderSchema.safeParse({ ...sell, side: 'buy', onFill: single }).success).toBe(true);
  expect(arenaLiveGeneratedOrderSchema.safeParse({ ...sell, side: 'buy', kind: 'stop_loss', price: '4' }).success).toBe(false);
});
it('单一保护只允许止损，保留合法 OCO 和历史省略字段的读取', () => {
  const buy = { ...sell, side: 'buy', kind: 'limit', price: '4', onFill: single };
  expect(arenaLiveGeneratedOrderSchema.safeParse(buy).success).toBe(true);
  const take = { ...single.activateOrders[0], kind: 'take_profit' };
  expect(arenaLiveGeneratedOrderSchema.safeParse({ ...buy, onFill: { ...single, activateOrders: [take] } }).success).toBe(false);
  const oco = { ...single, exitPolicy: 'oco', activateOrders: [
    { ...single.activateOrders[0], exitGroup: 'g' }, { ...take, clientId: 'take', exitGroup: 'g' },
  ] };
  expect(arenaLiveGeneratedOrderSchema.safeParse({ ...buy, onFill: oco }).success).toBe(true);
  const legacy = { ...single, afterExit: undefined, exitPolicy: undefined };
  expect(arenaOrderInputSchema.safeParse({ ...buy, onFill: legacy }).success).toBe(true);
  expect(arenaLiveGeneratedOrderSchema.safeParse({ ...buy, onFill: legacy }).success).toBe(false);
  expect(arenaGenerationRefSchemas[1].safeParse({ id: 'arena_live_research', version: 'arena-live-research-v1' }).success).toBe(true);
  for (const version of [2, 3, 4, 5, 6])
    expect(arenaGenerationRefSchemas[1].safeParse({ id: 'arena_live_research', version: `arena-live-research-v${version}` }).success).toBe(false);
});
it('导出给模型的 JSON Schema 直接限制卖单、到期日和单一保护', () => {
  const document = z.toJSONSchema(arenaLiveGeneratedOrderSchema);
  type Node = { properties: Record<string, Node>; type?: string; const?: unknown;
    minItems?: number; maxItems?: number; items?: Node };
  const objects: Node[] = [];
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if ('properties' in value) objects.push(value as Node);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit); else visit(child);
    }
  }
  visit(document);
  const orders = objects.filter(o => o.properties.symbol && o.properties.kind?.const);
  expect(orders).toHaveLength(6);
  const sells = orders.filter(o => o.properties.side.const === 'sell');
  expect(sells).toHaveLength(4);
  for (const order of sells) {
    expect(order.properties.onFill.type).toBe('null');
    expect(order.properties.entryAfter.type).toBe('null');
  }
  for (const order of orders.filter(o => o.properties.kind.const === 'market'))
    expect(order.properties.expiresOn.type).toBe('null');
  const protection = objects.find(o => o.properties.exitPolicy?.const === 'single');
  expect(protection!.properties.activateOrders.minItems).toBe(1);
  expect(protection!.properties.activateOrders.maxItems).toBe(1);
    expect(protection!.properties.activateOrders.items!.properties.kind.const).toBe('stop_loss');
});
