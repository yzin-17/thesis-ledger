"""真实归档经实际注册、临时控制库和事件合同输出；禁止外部网络及真实库。"""

import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

allowed = None
denied = []


def guard(event, args):
    if event in {'socket.connect', 'socket.getaddrinfo', 'socket.sendto'}:
        denied.append(event)
        raise AssertionError('离线官方事件验证禁止网络')
    if event == 'sqlite3.connect':
        path = Path(args[0]).resolve()
        if allowed is None or allowed not in path.parents:
            denied.append(event)
            raise AssertionError('禁止读取真实数据库')


sys.addaudithook(guard)
os.environ['THESIS_LEDGER_DSA_SECRET_KEY'] = 'synthetic-sse-event-offline-key'
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from data_provider.thesis_ledger_sources import sse_event_coverage as source
from src.services.thesis_ledger_control import ThesisLedgerControlStore
from src.services.thesis_ledger_provider_runtime import ThesisLedgerProviderRuntime
from src.services.thesis_ledger_mapping_evidence_store import MappingEvidenceStore
from src.services.thesis_ledger_event_v3 import execute_event_request

root = Path(sys.argv[1]).resolve()
source.ROOT = root
source.REVISION = sha256((root / 'proof.json').read_bytes()).hexdigest()
target = {'providerId': source.PROVIDER, 'upstreamSource': source.UPSTREAM}
keys = [{'kind': 'data', 'market': 'CN', 'assetType': 'ETF', 'capability': cap}
        for cap in ['CASH_DISTRIBUTION', 'SPLIT_EVENT']]
with TemporaryDirectory(prefix='sse-events-real-offline-') as directory:
    allowed = Path(directory).resolve()
    store = ThesisLedgerControlStore(str(allowed / 'control.db'))
    proof = MappingEvidenceStore(allowed / 'thesis-ledger-mapping-evidence').put((root / 'proof.json').read_bytes())
    now = datetime.now(timezone.utc)
    for key in keys:
        store.record_route_admission_v3(key=key, target=target, evidence_ref=proof, evidence_sha256=proof[7:],
            scope_symbols=['510300.SH', '588000.SH'], scope_date_from='2026-11-02', scope_date_to='2026-11-16',
            adapter_revision=source.ADAPTER_REVISION, source_revision=source.revisions()['sourceRevision'],
            credential_revision='not-required', valid_from=now.isoformat(),
            valid_until=(now + timedelta(hours=24)).isoformat(), recorded_by='offline-fixture')
    store.save_provider_config(source.PROVIDER, {'requestId': 'offline-enable', 'enabled': True})
    store.apply_policy_v3({'contractVersion': 1, 'consumer': 'thesis-ledger', 'requestId': 'offline-policy',
        'revision': 1, 'enabled': True, 'routes': [{'key': key, 'targets': [target]} for key in keys]})
    runtime = ThesisLedgerProviderRuntime(store)
    catalog = runtime.market_route_catalog_v3()
    import exchange_calendars as xcals
    days = [x.date().isoformat() for x in xcals.get_calendar('XSHG').sessions_in_range('2026-11-02', '2026-11-16')]
    exchanges = []
    for day in days:
        for symbol in ['588000.SH', '510300.SH']:
            for key in keys:
                query = {'contractVersion': 1, 'requestId': 'offline-real-event', 'symbol': symbol,
                    'routeKey': key, 'routeTarget': {**target, 'routeIndex': 0}, 'desiredRevision': 1,
                    'effectivePolicyRevision': 1, 'catalogRevision': catalog['catalogRevision'],
                    'start': '2026-11-02', 'end': day, 'dataAsOf': day + 'T05:01:00.000Z'}
                exchanges.append({'request': query, 'response': execute_event_request(runtime, query)})
    print(json.dumps({'policy': {'projection': {'effective': store.effective_policy_v3()}},
        'catalog': catalog, 'exchanges': exchanges, 'deniedAttempts': denied, 'realModelCalls': 0}, ensure_ascii=False))
