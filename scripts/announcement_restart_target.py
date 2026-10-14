"""在正式快更的重启前投递公告任务，核对重启后的持久任务结果；不操作 Docker。"""
import argparse
import json
from pathlib import Path
import time
import requests
from dotenv import dotenv_values


def main():
    parser = argparse.ArgumentParser(description="公告任务重启恢复验收")
    parser.add_argument("--sync-log", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    config = dotenv_values(Path(__file__).resolve().parents[2] / "thesis-ledger-infra/.env")
    headers = {"Authorization": "Bearer " + config["THESIS_LEDGER_CONTROL_TOKEN"]}
    payload = {"symbols": ["000881.SZ"], "start": "2024-04-01", "end": "2024-06-30"}
    url = "http://127.0.0.1:8000/api/v3/thesis-ledger/control/announcements/prepare"
    log = Path(args.sync_log)
    deadline = time.monotonic() + 600
    while "同步 DSA Python 与 WebUI 产物" not in (log.read_text() if log.exists() else ""):
        if time.monotonic() > deadline:
            raise RuntimeError("快更未进入 DSA 同步阶段")
        time.sleep(0.1)
    first = requests.post(url, json=payload, headers=headers, timeout=10)
    first.raise_for_status()
    first = first.json()
    assert first["status"] == "preparing", "该验收区间已有缓存，请选未使用的窗口"
    print(json.dumps({"queued": first["total"], "status": first["status"]}), flush=True)
    while "仅代码更新完成" not in log.read_text():
        if time.monotonic() > deadline:
            raise RuntimeError("快更未完成，请检查其日志")
        time.sleep(1)
    transient = 0
    while True:
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            final = response.json()
            if final["status"] == "ready":
                break
        except requests.RequestException:
            transient += 1
        if time.monotonic() > deadline:
            raise RuntimeError("重启后公告获取未收敛")
        time.sleep(2)
    assert first["jobIds"] == final["jobIds"] and not final["failed"], "任务身份或终态不符合预期"
    report = {"beforeRestart": first, "afterRestart": final, "transientResponses": transient,
              "entry": "thesis-ledger-infra/scripts/sync-code.sh dsa", "persistentJobIds": True}
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"recovered": final["completed"], "failed": final["failed"]}), flush=True)


if __name__ == "__main__":
    main()
