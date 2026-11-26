"""真实官方资料经过临时归档及生产 DSA 合同；禁止网络与业务数据库。"""

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

denied = []


def guard(event, args):
    if event in {'socket.connect', 'socket.getaddrinfo', 'socket.sendto', 'sqlite3.connect'}:
        denied.append(event)
        raise AssertionError('真实材料离线验证禁止网络及数据库调用')


sys.addaudithook(guard)
from scripts.arena_execution_materials import build_materials, write_package
from data_provider.thesis_ledger_sources.historical_execution import ExecutionArchive, SOURCE
from src.services.thesis_ledger_historical_execution import ExecutionRequest
from src.services.thesis_ledger_capability_sources import CAPABILITY_SOURCES
from src.services.thesis_ledger_capability_contracts import ReadContext

query = ExecutionRequest.model_validate(json.load(sys.stdin))
package = build_materials(Path(sys.argv[1]))
with TemporaryDirectory(prefix='real-execution-offline-') as directory:
    root = Path(directory) / 'archive'
    write_package(package, root)
    result = CAPABILITY_SOURCES.query(SOURCE.bindings[0].contract, query, query.routeKey.model_dump(),
        query.routeTarget.model_dump(), ReadContext(ExecutionArchive(root)))
    assert not denied
    print(json.dumps({'result': result.model_dump(), 'calendar': package['calendar'],
        'observation': package['observations'][query.symbol], 'audit': package['audit'][query.symbol],
        'deniedAttempts': denied}, ensure_ascii=False))
