"""官方停复牌查询经生产按日重建链输出；其余事实为受控样本。"""

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

denied = []


def guard(event, args):
    if event in {'socket.connect', 'socket.getaddrinfo', 'socket.sendto', 'sqlite3.connect'}:
        denied.append(event)
        raise AssertionError('离线重建禁止网络及数据库调用')


sys.addaudithook(guard)
from data_provider.thesis_ledger_sources.historical_execution import ExecutionArchive, SOURCE
from src.services.thesis_ledger_historical_execution import ExecutionRequest
from src.services.thesis_ledger_capability_sources import CAPABILITY_SOURCES
from src.services.thesis_ledger_capability_contracts import ReadContext
from tests.historical_reconstruction_sample import sample, write_archive, FIXTURES

query = ExecutionRequest.model_validate(json.load(sys.stdin))
_, material, originals = sample(query.symbol)
# 两仓使用相同的官方原文固定样本，防止仅验证某一仓副本。
shared = json.loads(Path(sys.argv[1]).read_text())
local = json.loads((FIXTURES / 'sse-halt-history.shared.json').read_text())
assert shared == local
with TemporaryDirectory(prefix='reconstruction-offline-') as directory:
    root = Path(directory)
    write_archive(root, query, material, originals)
    result = CAPABILITY_SOURCES.query(SOURCE.bindings[0].contract, query, query.routeKey.model_dump(),
        query.routeTarget.model_dump(), ReadContext(ExecutionArchive(root)))
    assert not denied
    print(json.dumps({'result': result.model_dump(), 'deniedAttempts': denied}, ensure_ascii=False))
