import assert from 'node:assert/strict';

const single = (node) => node.type === 'all' && node.conditions.length === 1 ? node.conditions[0] : node;

// 独立解释方向，不调用产品的交叉说明校验或信号执行器。
export function verifyDefinition(definition) {
  const signals = {};
  for (const path of ['entry', 'exit']) {
    const node = single(definition[path]);
    assert.equal(node.type, 'cross', `${path} 必须是单个交叉条件`);
    const isPrice = (n) => n.type === 'series' && n.field === 'close';
    const isEma = (n) => n.type === 'indicator' && n.name === 'EMA' && Number(n.params.period) === 20 && isPrice(n.input);
    const priceLeft = isPrice(node.left) && isEma(node.right);
    const priceRight = isPrice(node.right) && isEma(node.left);
    assert(priceLeft || priceRight, `${path} 必须比较收盘价与 EMA20`);
    const price = priceLeft ? node.left : node.right;
    const ema = priceLeft ? node.right : node.left;
    assert.equal(price.sourceId, ema.input.sourceId, '价格与指标必须使用同一来源');
    const source = definition.signalSources.find((s) => s.id === price.sourceId);
    assert(source && source.priceCoordinate === 'research', '价格和均线必须使用后复权研究坐标');
    let direction = node.direction;
    if (!priceLeft) direction = node.direction === 'above' ? 'below' : 'above';
    assert.equal(direction, path === 'entry' ? 'above' : 'below', `${path} 买卖方向反向`);
    signals[path] = { sourceId: price.sourceId, priceDirection: direction };
  }
  assert.equal(definition.schemaVersion, '3');
  assert.equal(definition.primaryTimeframe, '1d');
  assert.deepEqual(definition.executionInstrument, { symbol: '00700.HK', market: 'HK', assetType: 'stock' });
  assert.equal(definition.sizing.type, 'percentOfEquity');
  assert.equal(Number(definition.sizing.percent), 0.5);
  assert.equal(definition.risk.length, 2);
  assert(definition.risk.some((r) => r.type === 'fixedStop' && Number(r.percent) === 0.03));
  assert(definition.risk.some((r) => r.type === 'maxHoldingPeriod' && Number(r.periods) === 10));
  assert.equal(definition.execution.timing, 'nextEligibleBarOpen');
  assert.equal(Number(definition.cost.commissionRate), 0);
  assert.equal(Number(definition.cost.slippageRate), 0);
  if (definition.tradePlan) {
    assert.deepEqual(definition.tradePlan, { version: 1, evaluation: 'barClose', stages: [] }, '本次未要求额外交易计划动作');
  }
  return signals;
}

export function emaSeries(closes, period = 20) {
  const result = Array(closes.length).fill(null);
  if (closes.length < period) return result;
  result[period - 1] = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) result[i] = result[i - 1] + 2 / (period + 1) * (closes[i] - result[i - 1]);
  return result;
}

export function verifyFills(rows, fills) {
  const date = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const bars = [...rows].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const closes = bars.map((b) => Number(b.close));
  const ema = emaSeries(closes);
  const evidence = [];
  let position = false;
  let entry;
  for (const fill of fills) {
    const index = bars.findIndex((bar) => date(bar.occurredAt) === date(fill.occurredAt));
    assert(index >= 21, '成交缺少充分预热和前序信号日');
    assert(Math.abs(Number(fill.price) - Number(bars[index].open)) < 1e-7, '成交价格不是下一根 K 线开盘价');
    const signal = index - 1;
    const previousDelta = closes[signal - 1] - ema[signal - 1];
    const currentDelta = closes[signal] - ema[signal];
    let riskTrigger;
    if (fill.reason === 'signal') {
      const correct = fill.side === 'buy'
        ? previousDelta <= 0 && currentDelta > 0
        : previousDelta >= 0 && currentDelta < 0;
      assert(correct, `${fill.occurredAt} ${fill.side} 不是正确方向的前一日交叉`);
    } else {
      assert.equal(fill.reason, 'risk', '存在本次未验证的退出原因');
      assert.equal(fill.side, 'sell', '风险退出必须卖出');
      assert(entry, '风险退出缺少入场');
      if (closes[signal] <= entry.price * 0.97) riskTrigger = 'fixedStop';
      else if (index - entry.index >= 10) riskTrigger = 'maxHoldingPeriod';
      assert(riskTrigger, '风险退出未达到3%止损或10周期上限');
    }
    assert.equal(position, fill.side === 'sell', '出现重复买入或无持仓卖出');
    position = fill.side === 'buy';
    entry = position ? { index, price: Number(fill.price) } : undefined;
    evidence.push({ fillId: fill.fillId, side: fill.side, reason: fill.reason, ...(riskTrigger ? { riskTrigger } : {}), signalDate: date(bars[signal].occurredAt), fillDate: date(fill.occurredAt), previousDelta, currentDelta, price: fill.price, expectedOpen: bars[index].open });
  }
  assert(evidence.some((f) => f.reason === 'signal' && f.side === 'buy'), '必须有真实买入样本');
  assert(evidence.some((f) => f.reason === 'signal' && f.side === 'sell'), '必须有真实信号卖出样本');
  return { bars: bars.length, signalFills: evidence.filter((f) => f.reason === 'signal').length, riskExits: evidence.filter((f) => f.reason === 'risk').length, totalFills: evidence.length, endPositionOpen: position, evidence };
}
