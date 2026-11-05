"""G1 专用隔离 DSA：真实数据应用，所有来源传输限定到本地受控服务。"""

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import logging
from pathlib import Path
import socket
import sys
from threading import Lock, Thread
from urllib.parse import urlsplit

import requests


def main():
    logging.disable(logging.CRITICAL)
    root = Path(sys.argv[1]).resolve()
    origin = sys.argv[2]
    if not root.name.startswith("ledger-research-g1-") or urlsplit(origin).hostname != "127.0.0.1":
        raise ValueError("仅允许 G1 临时目录与本地受控上游")
    output_lock = Lock()

    def emit(value):
        with output_lock:
            print(json.dumps(value, ensure_ascii=False), flush=True)

    original_send = requests.sessions.Session.send

    def local_transport(session, request, **kwargs):
        target = urlsplit(request.url)
        if target.hostname == "qt.gtimg.cn":
            request = request.copy()
            request.url = origin + "/tencent" + target.path
        elif (target.scheme, target.netloc) != (urlsplit(origin).scheme, urlsplit(origin).netloc):
            raise requests.RequestException("G1 不允许访问外部服务")
        kwargs["proxies"] = {}
        return original_send(session, request, **kwargs)

    requests.sessions.Session.send = local_transport
    from src.data_config import reset_data_config
    from src.services.thesis_ledger_control import ThesisLedgerControlStore, _provider_credential_revision_from_snapshot
    from data_provider.thesis_ledger_sources.news import ADAPTER_REVISION, SOURCE_REVISION
    from api.data_app import create_app
    import uvicorn

    reset_data_config()
    store = ThesisLedgerControlStore(str(root / "fixture-data.db"))
    key = {"kind": "data", "market": "CN", "assetType": "ETF", "capability": "NEWS_SEARCH"}
    target = {"providerId": "searxng", "upstreamSource": "searxng-news-search"}
    store.save_provider_config("searxng", {
        "contractVersion": 3, "consumer": "thesis-ledger", "requestId": "g1-config", "enabled": True,
        "credentials": {"method": "search", "values": {"baseUrls": json.dumps([origin + "/search-source"])}},
    })
    rows = [{"canonicalCode": "510300", "market": "SH", "instrumentType": "ETF", "displayName": "沪深300ETF"}]
    encoded = json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    with store._connect() as connection:
        connection.execute(
            "INSERT INTO thesis_ledger_catalog_generation "
            "(generation, checksum, cursor, complete, items_json, created_at) VALUES (1, ?, 'generation:1', 1, ?, ?)",
            (sha256(encoded.encode()).hexdigest(), encoded, datetime.now(timezone.utc).isoformat()),
        )

    def admit():
        now = datetime.now(timezone.utc)
        store.record_route_admission_v3(
            key=key, target=target, evidence_ref="g1-controlled-http-only", evidence_sha256="b" * 64,
            scope_symbols=["510300.SH"], scope_date_from=(now - timedelta(days=400)).date().isoformat(),
            scope_date_to=(now + timedelta(days=1)).date().isoformat(),
            adapter_revision=ADAPTER_REVISION, source_revision=SOURCE_REVISION,
            credential_revision=_provider_credential_revision_from_snapshot(store.provider_credential_snapshot("searxng")),
            valid_from=(now - timedelta(minutes=1)).isoformat(), valid_until=(now + timedelta(hours=1)).isoformat(),
            recorded_by="g1-controlled-fixture",
        )

    admit()
    store.apply_policy_v3({
        "contractVersion": 3, "consumer": "thesis-ledger", "requestId": "g1-policy", "revision": 1, "enabled": True,
        "routes": [
            {"key": {**key, "capability": "REALTIME_QUOTE"},
             "targets": [{"providerId": "tencent", "upstreamSource": "tencent"}]},
            {"key": key, "targets": [target], "enabled": True},
        ],
    })
    app = create_app()

    @app.middleware("http")
    async def record(request, call_next):
        raw = await request.body()
        emit({"event": "request", "path": str(request.url.path), "body": json.loads(raw) if raw else None,
              "dataAuthorized": request.headers.get("authorization") == "Bearer controlled-data-token"})
        return await call_next(request)

    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    service = uvicorn.Server(uvicorn.Config(app, log_level="critical", access_log=False, timeout_graceful_shutdown=5))

    def commands():
        for line in sys.stdin:
            value = json.loads(line)
            action = value["action"]
            try:
                if action == "stop":
                    service.should_exit = True
                    return
                if action == "reset":
                    with store._connect() as connection:
                        connection.execute("DELETE FROM thesis_ledger_provider_request_budget")
                        connection.execute("DELETE FROM thesis_ledger_provider_health")
                    admit()
                elif action == "revoke-news":
                    store.revoke_route_admission_v3(key=key, target=target, reason="g1-controlled-revoke")
                else:
                    raise ValueError("未知 G1 控制命令")
                emit({"event": "ack", "id": value["id"]})
            except Exception as error:
                emit({"event": "failure", "id": value["id"], "code": type(error).__name__})

    thread = Thread(target=commands, daemon=True)
    thread.start()
    emit({"event": "bound", "port": listener.getsockname()[1]})
    try:
        service.run(sockets=[listener])
        import multiprocessing
        forbidden = ("src.config", "src.analyzer", "src.core.pipeline", "src.notification", "openai", "litellm", "anthropic")
        loaded = [name for name in sys.modules if any(name == prefix or name.startswith(prefix + ".") for prefix in forbidden)]
        emit({"event": "stopped", "forbiddenImports": loaded, "children": len(multiprocessing.active_children()),
              "lifecycleActive": hasattr(app.state, "data_lifecycle_active")})
    finally:
        listener.close()
        requests.sessions.Session.send = original_send


if __name__ == "__main__":
    main()
