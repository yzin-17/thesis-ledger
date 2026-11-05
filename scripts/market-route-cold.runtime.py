"""在现有 DSA 中执行一个新进程的正式路由冷态请求；不启动后台生命周期。"""

import time

_started = time.perf_counter()
import contextlib
import hashlib
import io
import json
import os
import sys


def main():
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
        from fastapi.testclient import TestClient
        from api.data_app import create_app
        import src.services.thesis_ledger_provider_runtime as runtime_module

        assert runtime_module._runtime is None
        request = json.load(sys.stdin)
        assert request["contractVersion"] == 3
        assert request["symbol"] == "510300.SH"
        assert request["start"] == "2024-07-15" and request["end"] == "2024-07-19"
        assert request["purpose"] == "interactive-chart"
        assert request["routeTarget"] == {
            "providerId": "hithink", "upstreamSource": "fund-market-historical", "routeIndex": 0,
        }
        expected_key = {"kind": "bar", "market": "CN", "assetType": "ETF",
                        "capability": "DAILY_BAR", "timeframe": "1d", "adjustment": "qfq"}
        assert request["routeKey"] == expected_key
        token = os.environ.get("THESIS_LEDGER_DSA_TOKEN", "").strip()
        assert token
        app = create_app()
        client = TestClient(app, raise_server_exceptions=False)
        app_ready = time.perf_counter()
        try:
            response = client.post("/api/v3/thesis-ledger/market/chart-bars", json=request,
                                   headers={"authorization": "Bearer " + token,
                                            "x-request-id": request["requestId"]})
            body = response.json()
        finally:
            client.close()
        finished = time.perf_counter()
        assert not getattr(app.state, "data_lifecycle_active", False)
        runtime = runtime_module._runtime
        assert runtime is not None
        modules = [name for name in sys.modules
                   if name == "litellm" or name.startswith(("litellm.", "openai", "anthropic", "src.analyzer"))]
        assert not modules
        paths = ["api/data_app.py", "api/thesis_ledger_chart_v3.py",
                 "src/services/thesis_ledger_provider_runtime.py",
                 "src/services/thesis_ledger_bar_route_execution.py",
                 "data_provider/thesis_ledger_sources/hithink.py"]
        hashes = {}
        for path in paths:
            with open(path, "rb") as source:
                hashes[path] = hashlib.sha256(source.read()).hexdigest()
        result = {"status": response.status_code, "body": body,
                  "processRuntimeMs": (finished - _started) * 1000,
                  "importAndAppMs": (app_ready - _started) * 1000,
                  "requestMs": (finished - app_ready) * 1000,
                  "runtimeInitiallyAbsent": True, "lifespanStarted": False,
                  "modelModulesLoaded": modules, "sourceHashes": hashes}
    print("ROUTE_COLD_RESULT=" + json.dumps(result, separators=(",", ":")))


try:
    main()
except BaseException as error:
    print("ROUTE_COLD_FAILURE=" + json.dumps({"type": type(error).__name__}))
    sys.exit(1)
