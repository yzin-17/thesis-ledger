"""在禁止网络和数据库的进程中验证 DSA 原生计算及原时点规则响应。"""

import json
import sys
from datetime import datetime

denied = []


def guard(event, _args):
    if event in {"socket.connect", "socket.getaddrinfo", "socket.sendto", "sqlite3.connect"}:
        denied.append(event)
        raise RuntimeError(f"离线验证禁止外部访问: {event}")


sys.addaudithook(guard)
request = json.load(sys.stdin)
if request["mode"] == "indicators":
    from api.thesis_ledger import _bar_series_fingerprint, calculate_indicators

    payload = request["payload"]
    if request.get("legacy"):
        try:
            calculate_indicators(payload)
        except Exception as error:
            assert "inputFingerprint" in str(error.detail["message"])
            print(json.dumps({"rejected": True, "reason": error.detail["message"]}))
        else:
            raise AssertionError("旧指纹必须在计算前拒绝")
    else:
        assert payload["inputFingerprint"] == _bar_series_fingerprint(payload["points"], payload["identity"])
        print(json.dumps(calculate_indicators(payload), ensure_ascii=False, allow_nan=False))
elif request["mode"] == "rules":
    from src.services import thesis_ledger_dependency_facts as dependencies

    arguments = request["arguments"]
    arguments["data_as_of"] = datetime.fromisoformat(arguments["data_as_of"].replace("Z", "+00:00"))
    result = dependencies.instrument_facts_response(**arguments)
    original = dependencies.real_cn_tradability
    try:
        # 独立证明规则缺失；受控完整覆盖不冒充真实历史事实。
        dependencies.real_cn_tradability = lambda *_args, **_kwargs: {
            "coverage": {"complete": True}, "tradable": True,
            "provider": "offline-controlled", "providerRevision": "controlled-complete",
        }
        controlled = dependencies.instrument_facts_response(**arguments)
    finally:
        dependencies.real_cn_tradability = original
    print(json.dumps({"actual": result, "controlledTradability": controlled}, ensure_ascii=False))
else:
    raise AssertionError("未知离线模式")

assert not denied, f"离线计算尝试访问外部依赖: {denied}"
