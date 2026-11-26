import assert from 'node:assert/strict';

export async function driveFrozenDecision(account, decision, sdk, build, command) {
  const original = JSON.stringify({ account, decision });
  const D = sdk.DecimalValue;
  const at = '2026-11-10T05:01:00.000Z', nextAt = '2026-11-10T05:02:00.000Z';
  const day = '2026-11-10', nextDay = '2026-11-11';
  assert.equal(account.cash, '100000');
  assert.equal(account.positions.length + account.fills.length + account.orders.length, 0);
  assert.equal(decision.orders.length, 1);
  const submittedInput = decision.orders[0];
  assert.deepEqual({ symbol: submittedInput.symbol, side: submittedInput.side, kind: submittedInput.kind,
    quantity: submittedInput.quantity, price: submittedInput.price },
  { symbol: '588000.SH', side: 'buy', kind: 'limit', quantity: '14800', price: '1.345' });
  const prepared = await build([account], decision, at);
  assert.equal(prepared.session.state, 'open');
  assert.deepEqual(prepared.context.fees, { version: 'fixed-v1', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 });
  const scoped = command(decision);
  const accepted = sdk.arenaSubmitDecision(account, account.revision, scoped, prepared.context);
  assert.equal(accepted.revision, account.revision + 1);
  assert.equal(accepted.orders.length, 2);
  assert.equal(accepted.fills.length, 0);
  const early = sdk.arenaMatchOrders(accepted, prepared.context, true);
  assert.deepEqual(early, accepted, '提交时已存在的行情不能倒填成交');
  const observed = await build([accepted], undefined, nextAt);
  assert.equal(observed.session.state, 'open');
  const quote = observed.context.quotes.find(q => q.symbol === submittedInput.symbol);
  assert(quote && Date.parse(quote.marketTime) > Date.parse(at) && Date.parse(quote.observedAt) <= Date.parse(nextAt), '缺少提交后的真实可见行情');
  assert(D.from(quote.price).compareTo(submittedInput.price) <= 0, '原限价尚未触发，不改价促成成交');
  assert.equal(quote.positionAvailableOn, nextDay);
  assert.equal(quote.cashAvailableOn, day);
  assert.equal(quote.lot, '100');
  assert.equal(quote.tick, '0.001');
  assert.deepEqual(quote.evidence.fact.executionRules.statutoryCharges,
    [{ code: 'sseFundHandling', side: 'both', rate: '0.00004', minimum: null }]);
  const filled = sdk.arenaMatchOrders(accepted, observed.context, true);
  assert.equal(filled.fills.length, 1, '原数量必须在真实冻结撮合参数下完整成交');
  const fill = filled.fills[0];
  const notional = D.from('14800').times(quote.price);
  const expectedFee = notional.times('0.00004').toString();
  const expectedCash = D.from(account.cash).minus(notional).minus(expectedFee).toString();
  const expectedNav = D.from(account.cash).minus(expectedFee).toString();
  assert.equal(fill.quantity, '14800');
  assert.equal(fill.price, quote.price);
  assert.equal(fill.fee, expectedFee);
  assert.equal(fill.cashDelta, notional.plus(expectedFee).times('-1').toString());
  assert.equal(fill.sourceRef, quote.sourceRef);
  assert.equal(fill.marketTime, quote.marketTime);
  assert.equal(filled.cash, expectedCash);
  assert.equal(sdk.arenaAvailableCash(filled, day), expectedCash);
  assert.equal(sdk.arenaReservedCash(filled), '0');
  assert.deepEqual(filled.cashSettlements, []);
  assert.equal(sdk.arenaAccountNav(filled, new Map([[submittedInput.symbol, quote.price]])), expectedNav);
  assert.equal(filled.positions.length, 1);
  assert.equal(filled.positions[0].quantity, '14800');
  assert.equal(filled.positions[0].acquiredOn, day);
  assert.equal(filled.positions[0].availableOn, nextDay);
  const parent = filled.orders.find(o => o.clientId === scoped.orders[0].clientId);
  const child = filled.orders.find(o => o.parentOrderId === parent.id);
  assert.equal(parent.state, 'filled');
  assert.equal(child.state, 'active');
  assert.equal(child.price, '1.340');
  assert.equal(child.remainingQuantity, '14800');
  assert.equal(child.validUntil.kind, 'activation_session_close');
  assert.equal(child.activeSince, nextAt);
  assert.equal(sdk.arenaOrderSellableShares(filled, child, day).toString(), '0');
  assert.equal(sdk.arenaOrderSellableShares(filled, child, nextDay).toString(), '14800');
  const repeated = sdk.arenaMatchOrders(filled, observed.context, true);
  assert.deepEqual(repeated, filled, '重复观察不能重复扣款或计费');
  const close = prepared.session.sessions.map(s => s.endAt).sort().at(-1);
  assert.equal(Date.parse(child.expiresAt), Date.parse(close));
  const expired = sdk.arenaExpireOrders(filled, close);
  assert.equal(expired.orders.find(o => o.id === child.id).state, 'expired');
  assert.equal(expired.fills.length, 1);
  assert.equal(expired.cash, expectedCash);
  assert.equal(sdk.arenaAvailableShares(expired, submittedInput.symbol, day), '0');
  assert.equal(sdk.arenaAvailableShares(expired, submittedInput.symbol, nextDay), '14800');
  assert.equal(sdk.arenaAvailableCash(expired, nextDay), expectedCash);
  assert.equal(JSON.stringify({ account, decision }), original, '原冻结账户或决策被修改');
  return { status: 'passed', persistence: 'memory_only', asOf: at, executionAt: nextAt,
    accountBefore: account, accountSubmitted: accepted, accountFilled: filled, accountAfterExpiry: expired,
    quote, evidence: observed.evidence, matching: observed.context.matching ?? null,
    feeAudit: { configuredCommission: '0', statutoryRate: '0.00004', notional: notional.toString(),
      charged: fill.fee, expectedFee, sellFeeForSameNotional: quote.statutorySellFee(notional.toString(), '14800', quote.price) },
    accountResult: { cash: expectedCash, navAtFill: expectedNav, quantity: '14800', positionAvailableOn: nextDay },
    settlement: { sameDaySellable: '0', nextDaySellableAfterExpiry: '14800', cashAvailableOn: day },
    protection: { activated: true, expiresAt: child.expiresAt, availableOn: nextDay,
      outcome: 'expired_before_position_sellable', sellFills: 0 },
    checks: ['submission', 'no_backfill', 'new_observation_fill', 'fee_once', 'cash', 'nav',
      't_plus_one', 'protection_activation', 'protection_expiry', 'original_input_preserved'] };
}

export async function runIsolatedBusiness(input, raw, assemble) {
  const runtime = await assemble();
  try {
    const schema = await import('@thesis-ledger/schemas');
    const sdk = await import('@thesis-ledger/domain');
    const protection = await import(new URL('./arena-live-protection.js', import.meta.resolve('@thesis-ledger/domain')));
    const { LiveExecutionContext } = await import('./dist/src/model-arena/live/live-execution-context.js');
    const { liveOrderCommand } = await import('./dist/src/model-arena/live/live-order-identities.js');
    const account = schema.arenaLiveAccountSchema.parse(input.account);
    const protocol = schema.arenaLiveProtocolSchema.parse(input.protocol);
    const decision = schema.arenaLiveDecisionSchema.parse(raw);
    assert.deepEqual(protocol.fees, input.protocol.fees);
    const reader = new LiveExecutionContext(runtime.blocked, runtime.blocked, runtime.blocked, runtime.replay);
    return await driveFrozenDecision(account, decision, { ...sdk, ...protection },
      (books, nextDecision, at) => reader.build(protocol, books, nextDecision, [], at),
      value => liveOrderCommand(crypto.randomUUID(), value));
  } finally { await runtime.close(); }
}
