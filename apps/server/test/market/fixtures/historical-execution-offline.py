"""受控原文经实际 DSA registry 输出；禁止网络与数据库副作用。"""

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from hashlib import sha256

denied = []


def guard(event, args):
    if event in {'socket.connect', 'socket.getaddrinfo', 'socket.sendto', 'sqlite3.connect'}:
        denied.append(event)
        raise AssertionError('离线执行验证禁止网络与数据库调用')


sys.addaudithook(guard)
from data_provider.thesis_ledger_sources.historical_execution import ExecutionArchive, context_key, SOURCE
from src.services.thesis_ledger_historical_execution import ExecutionRequest
from src.services.thesis_ledger_capability_sources import CAPABILITY_SOURCES
from src.services.thesis_ledger_capability_contracts import ReadContext

value = json.loads(Path(sys.argv[1]).read_text())
query = ExecutionRequest.model_validate(json.load(sys.stdin))
with TemporaryDirectory(prefix='execution-offline-') as directory:
    root = Path(directory)
    (root / 'contexts').mkdir()
    (root / 'originals').mkdir()
    for text in value['originals'].values():
        raw = text.encode()
        (root / 'originals' / sha256(raw).hexdigest()).write_bytes(raw)
    context = value['context']
    name = context_key(context['fact']['symbol'], context['fact']['instrumentType'], context['asOf'])
    path = root / 'contexts' / (name + '.json')
    path.write_text(json.dumps(context, ensure_ascii=False))
    (root / 'index.json').write_text(json.dumps({'version': 1, 'contexts': {name: {
        'assetType': context['fact']['instrumentType'], 'sha256': sha256(path.read_bytes()).hexdigest()}}}))
    result = CAPABILITY_SOURCES.query(SOURCE.bindings[0].contract, query, query.routeKey.model_dump(),
        query.routeTarget.model_dump(), ReadContext(ExecutionArchive(root)))
    assert not denied
    print(json.dumps({'result': result.model_dump(), 'deniedAttempts': denied}, ensure_ascii=False))
