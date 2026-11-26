"""受控富途快照经正式标准结果与 Data HTTP 输出，禁止外部网络及数据库连接。"""
import asyncio
from datetime import datetime
import json
from types import SimpleNamespace
import sys

denied = []
def deny_external_state(event, args):
    if event in {'socket.connect', 'socket.getaddrinfo', 'socket.sendto', 'sqlite3.connect'}:
        denied.append(event)
        raise AssertionError('当前输入隔离验证禁止外部网络及数据库连接')

sys.addaudithook(deny_external_state)
import httpx
import pandas as pd
from fastapi import FastAPI
from pytest import MonkeyPatch
from api.thesis_ledger import router_v3
from data_provider.futu_market import read_futu_quote
from src.services.thesis_ledger_capability_sources import CAPABILITY_SOURCES
from src.services.thesis_ledger_capability_contracts import QuoteQuery, ReadContext
from tests.test_futu_market import sdk_for
from api import thesis_ledger_current_trading as trading_api
from data_provider.futu_market import FutuMarketAdapter
from data_provider.futu_query_worker import _read as worker_read

sdk, context = sdk_for(
    'HK.00700', update_time='2026-11-23 09:31:35',
    last_price=336.4, prev_close_price=336.4, open_price=336.4,
    high_price=336.4, low_price=336.4, suspension=False, sec_status='NORMAL', lot_size=100,
)
context.get_stock_basicinfo.return_value = 0, pd.DataFrame([{
    'code': 'HK.00700', 'stock_type': 'STOCK', 'stock_id': 123,
    'exchange_type': 'HK_MAINBOARD', 'delisting': False,
}])
with MonkeyPatch.context() as patch:
    patch.setenv('THESIS_LEDGER_DSA_TOKEN', 'controlled-current-inputs')
    patch.setenv('THESIS_LEDGER_FIXTURE_MODE', 'false')
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.fromisoformat('2026-11-23T01:31:36+00:00').astimezone(tz)
    patch.setattr('data_provider.futu_market.datetime', Clock)
    patch.setattr('api.thesis_ledger_quote_fields.datetime', Clock)
    patch.setattr('data_provider.futu_trading_state.datetime', Clock)
    native = read_futu_quote(sdk, 'localhost', 11111, '00700.HK', 'STOCK')

    class Adapter:
        def get_realtime_quote(self, *args, **kwargs):
            return native

    standard = CAPABILITY_SOURCES.quote(
        QuoteQuery(symbol='00700.HK', instrument_type='STOCK'),
        {'kind': 'data', 'market': 'HK', 'assetType': 'STOCK', 'capability': 'REALTIME_QUOTE'},
        {'providerId': 'futu', 'upstreamSource': 'futu'}, ReadContext(Adapter()))
    reads = []
    def read_quote(symbol, **kwargs):
        reads.append(symbol)
        return SimpleNamespace(data=standard, provider='futu', fallback_used=False)
    patch.setattr('src.services.thesis_ledger_provider_runtime.get_thesis_ledger_data_gateway',
                  lambda: SimpleNamespace(quote=read_quote))
    app = FastAPI()
    app.include_router(router_v3)
    async def consume():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://isolated') as client:
            response = await client.get('/thesis-ledger/market/quote',
                params={'symbol': '00700.HK', 'assetType': 'STOCK'},
                headers={'authorization': 'Bearer controlled-current-inputs'})
            assert response.status_code == 200, response.text
            return response.json()
    payload = asyncio.run(consume())
    assert payload['upstreamSource'] == 'futu' and payload['freshness'] == 'live'
    context.get_stock_basicinfo.assert_called_once()
    context.get_market_snapshot.assert_called_once_with(['HK.00700'])
    assert reads == ['00700.HK'] and not denied
    # 深市采用同样的受控盘中时钟；真实收市样本单独保留，不回写其原始时刻。
    cn_sdk, cn_context = sdk_for('SZ.159915', 'ETF', update_time='2026-11-23 09:31:35',
        suspension=False, sec_status='NORMAL', lot_size=100, last_price=2.295)
    patch.setitem(sys.modules, 'futu', cn_sdk)
    patch.setattr(FutuMarketAdapter, '_query', lambda self, request: worker_read({
        'host': self.host, 'port': self.port, **request}))
    policy = {'contractVersion': 1, 'enabled': True, 'revision': 202, 'sourceDesiredRevision': 202,
        'routes': [{'key': {'kind': 'data', 'market': 'CN', 'assetType': 'ETF', 'capability': 'REALTIME_QUOTE'},
                    'targets': [{'providerId': 'hithink', 'upstreamSource': 'fund-market-snapshot',
                                 'routeIndex': 0, 'eligible': True, 'reason': None}]}]}
    patch.setattr(trading_api, 'ThesisLedgerControlStore', lambda: SimpleNamespace(
        effective_policy_v3=lambda: policy,
        provider_registry=lambda: [{'providerId': 'futu', 'enabled': True, 'configVersion': 1}],
        provider_credential_snapshot=lambda name: SimpleNamespace(values={'host': 'localhost', 'port': '11111'})))
    app.include_router(trading_api.router)

    async def state_http():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://isolated') as client:
            response = await client.get('/thesis-ledger/market/trading-observation',
                params={'symbol': '159915.SZ', 'assetType': 'ETF'},
                headers={'authorization': 'Bearer controlled-current-inputs'})
            assert response.status_code == 200, response.text
            state = response.json()
            facts = await client.get('/thesis-ledger/backtest/instrument-facts', params={
                'symbol': '159915.SZ', 'market': 'CN', 'instrumentType': 'ETF',
                'dataAsOf': '2026-11-23T01:31:36+00:00', 'start': '2026-11-23', 'end': '2026-11-23',
                'executionStart': '2026-11-23', 'executionEnd': '2026-11-23', 'identityOnly': 'true'},
                headers={'authorization': 'Bearer controlled-current-inputs'})
            assert facts.status_code == 200, facts.text
            return state, facts.json()
    state, facts = asyncio.run(state_http())
    assert state['state'] == 'normal' and state['evidence']['provider'] == 'futu'
    cn_context.get_market_snapshot.assert_called_once_with(['SZ.159915'])
    assert not denied
    print(json.dumps({'quote':payload,'szEtfState':state,'szEtfFacts':facts,'deniedAttempts':denied,'quoteReads':len(reads),
                      'inputKind':'controlled-snapshot'},ensure_ascii=False))
