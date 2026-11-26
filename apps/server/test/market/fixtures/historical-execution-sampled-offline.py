"""临时归档与控制库经真实 DSA 运行时输出采样回执。"""

import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

os.environ['THESIS_LEDGER_DSA_SECRET_KEY'] = 'synthetic-offline-archive-key'
os.environ.pop('HITHINK_API_KEY', None)

with TemporaryDirectory(prefix='sampled-execution-') as directory:
    root = Path(directory).resolve()
    connections = []

    def guard(event, args):
        if event in {'socket.connect', 'socket.getaddrinfo', 'socket.sendto'}:
            raise AssertionError('隔离合同检查禁止外网')
        if event == 'sqlite3.connect':
            path = Path(args[0]).resolve()
            if not path.is_relative_to(root):
                raise AssertionError('隔离合同检查禁止连接非临时数据库')
            connections.append(str(path.relative_to(root)))

    sys.addaudithook(guard)
    from data_provider.thesis_ledger_sources.historical_execution import ExecutionArchive
    from src.services.thesis_ledger_control import ThesisLedgerControlStore
    from src.services.thesis_ledger_historical_execution import ExecutionRequest
    from src.services.thesis_ledger_historical_reconstruction import sampled_daily_material
    from src.services.thesis_ledger_provider_runtime import ThesisLedgerProviderRuntime
    from tests.test_historical_execution import admit, configure, outer, write_archive
    from tests.test_historical_execution_sampled import minimal_sample
    from tests.historical_reconstruction_sample import sample, write_archive as write_daily

    query = ExecutionRequest.model_validate(json.load(sys.stdin))
    archive = root / 'archive'
    if sys.argv[1] == 'native':
        value = minimal_sample()
        assert query.asOf == value['context']['asOf'] and query.symbol == value['context']['fact']['symbol']
        value['request'] = query.model_dump()
        write_archive(archive, value)
    else:
        _, material, originals = sample(query.symbol)
        material = sampled_daily_material(material).model_dump()
        write_daily(archive, query, material, originals)
    store = ThesisLedgerControlStore(str(root / 'control.db'))
    admit(store, query, valid_until=None)
    configure(store, query)
    runtime = ThesisLedgerProviderRuntime(store, adapters={
        'historical-execution-archive': ExecutionArchive(archive),
    })
    result = runtime.execute_request(outer(query)).value
    print(json.dumps({'result': result, 'temporaryDatabaseConnections': len(connections),
                      'externalCalls': 0, 'modelCalls': 0}, ensure_ascii=False))
