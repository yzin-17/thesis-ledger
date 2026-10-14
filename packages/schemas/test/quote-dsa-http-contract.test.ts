import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { quoteSchema } from '../src/market.js';

const dsaRoot = fileURLToPath(new URL('../../../../daily-stock-analysis/', import.meta.url));
const python = `${dsaRoot}.venv/bin/python`;

const bridge = String.raw`
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.thesis_ledger import router_v3
from src.services.thesis_ledger_control import ThesisLedgerControlStore
from src.services.thesis_ledger_hithink_quote import HiThinkSnapshotAdapter
from src.services.thesis_ledger_provider_runtime import ThesisLedgerDataGateway, ThesisLedgerProviderRuntime
from tests.test_thesis_ledger_hithink_quote_runtime import CASES, _admit, _policy

results = []
for asset, symbol, source in CASES:
    for value in [None, '--', -1, float('inf'), 0, 123.45]:
        with TemporaryDirectory(prefix='quote-contract-') as directory:
            store = ThesisLedgerControlStore(str(Path(directory) / 'control.sqlite'))
            store.apply_policy_v3(_policy(asset, source))
            _admit(store, asset, symbol, source)
            item = dict(thscode=symbol, last_price=10, open_price=10, high_price=11,
                        low_price=9, prev_price=9.5, volume=value, turnover=value)
            payload = dict(code=0, data=dict(timestamp=None, item=[item]))
            adapter = HiThinkSnapshotAdapter(
                api_key='synthetic-quote-key-v1',
                http_get=lambda *_a, **_k: SimpleNamespace(status_code=200, json=lambda: payload),
                clock=lambda: datetime(2026, 10, 6, 8, tzinfo=timezone.utc),
            )
            gateway = ThesisLedgerDataGateway(ThesisLedgerProviderRuntime(store, adapters={'hithink': adapter}))
            app = FastAPI()
            app.include_router(router_v3)
            with patch('src.services.thesis_ledger_provider_runtime.get_thesis_ledger_data_gateway', return_value=gateway):
                with TestClient(app) as client:
                    response = client.get('/thesis-ledger/market/quote', params={'symbol': symbol},
                                          headers={'Authorization': 'Bearer synthetic-quote-contract-token'})
            assert response.status_code == 200, response.text
            results.append(dict(asset=asset, expected=value if value in (0, 123.45) else None,
                                quote=response.json()))
print('QUOTE_CONTRACT=' + json.dumps(results, allow_nan=False))
`;

// 单仓 CI 不含 DSA Python 环境；跨仓验收必须提供该环境并实际执行。
describe.skipIf(!existsSync(python))('DSA 实际 HTTP 输出与共享 Quote 合同', () => {
  it('股票和 ETF 的缺失/异常/真实零量额跨语言保持一致', () => {
    const output = execFileSync(python, ['-c', bridge], {
      cwd: dsaRoot,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        HITHINK_API_KEY: 'synthetic-quote-key-v1',
        THESIS_LEDGER_DSA_SECRET_KEY: 'synthetic-quote-master-key',
        THESIS_LEDGER_DSA_TOKEN: 'synthetic-quote-contract-token',
        THESIS_LEDGER_FIXTURE_MODE: 'false',
      },
    });
    const line = output.split('\n').find((value) => value.startsWith('QUOTE_CONTRACT='));
    expect(line).toBeDefined();
    const results = JSON.parse(line!.slice('QUOTE_CONTRACT='.length)) as Array<{
      asset: string;
      expected: number | null;
      quote: unknown;
    }>;
    expect(results).toHaveLength(12);
    for (const result of results) {
      expect(quoteSchema.parse(result.quote)).toMatchObject({
        symbol: result.asset === 'ETF' ? '510300.SH' : '600519.SH',
        provider: 'hithink',
        volume: result.expected,
        amount: result.expected,
        marketTime: null,
        fetchedAt: '2026-10-06T08:00:00+00:00',
        freshness: 'unknown',
      });
    }
  }, 40_000);
});
