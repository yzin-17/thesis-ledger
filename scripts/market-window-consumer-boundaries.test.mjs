import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marketWindowConsumerBoundaryViolation as check } from './market-window-consumer-boundaries.mjs';
test('研究、回测与 raw 派生消费方禁止退回单窗响应校验', () => {
  for (const file of ['apps/server/src/research/materials.ts', 'apps/server/src/backtest/preflight.ts', 'apps/server/src/market/market-derived-raw-window-v3.ts']) {
    assert(check(file, 'marketDataBarSeriesResponseV3Schema.safeParse(response)'));
    assert(check(file, 'marketDataBarSeriesRequestResponseV3Schema.parse({ request, response })'));
    assert.equal(check(file, 'safeParseMarketWindowEvidenceResponseV3(response, request)'), null);
  }
});
test('来源协议、Market 构造器、测试以及纯请求校验保持各自职责', () => {
  const source = 'marketDataBarSeriesResponseV3Schema.parse(raw)';
  for (const file of ['apps/server/src/integration/dsa/protocol.ts', 'apps/server/src/market/market-window-response-v3.ts', 'apps/server/src/market/market-event-free-reader.ts', 'apps/server/test/backtest/fixture.ts'])
    assert.equal(check(file, source), null);
  assert.equal(check('apps/server/src/backtest/preflight.ts', 'marketDataBarSeriesRequestV3Schema.parse(request)'), null);
});
test('交互结果缓存不进入跨领域或冻结读取', () => {
  for (const file of ['apps/server/src/backtest/preflight.ts', 'apps/server/src/research/materials.ts',
    'apps/server/src/market/market-bar-reader-v3.ts', 'apps/server/src/market/market-frozen-window-reader-v3.ts',
    'apps/server/src/market/market-event-free-reader.ts'])
    assert(check(file, "import { MarketChartResultCache } from './market-chart-result-cache.js'"));
  assert.equal(check('apps/server/src/market/market-chart-reader-v3.ts', 'private cache: MarketChartResultCache'), null);
});
