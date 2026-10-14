"""复用现有研究模型验证公告自动准备；--run 才创建验收策略和回测，不改路由。"""
import argparse
import atexit
import copy
from hashlib import sha256
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from uuid import uuid4


def main():
    parser = argparse.ArgumentParser(description="公告自动准备的目标 API 验收")
    parser.add_argument("--base", default="http://127.0.0.1:3000")
    parser.add_argument("--baseline-run", required=True)
    parser.add_argument("--symbol", default="600774.SH")
    parser.add_argument("--report", required=True)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--temporary-tencent-route", action="store_true", help="验收期间临时选择腾讯原价主源，结束后恢复")
    args = parser.parse_args()

    def api(path, value=None, method=None):
        body = json.dumps(value).encode() if value is not None else None
        try:
            with urlopen(Request(args.base + path, data=body, method=method, headers={"content-type": "application/json"}), timeout=90) as response:
                return json.load(response)
        except HTTPError as exc:
            raise RuntimeError(f"{path}: {exc.code}: {exc.read().decode()[:1000]}") from exc

    old = api("/api/v1/backtests/runs/" + args.baseline_run)
    version = next(v for s in api("/api/v1/backtests/strategies") for v in s["versions"] if v["id"] == old["strategyVersionId"])
    strategy = copy.deepcopy(version["schema"])
    old_symbol = strategy["executionInstrument"]["symbol"]

    def replace_symbol(value):
        if isinstance(value, dict):
            return {key: replace_symbol(item) for key, item in value.items()}
        if isinstance(value, list):
            return [replace_symbol(item) for item in value]
        return args.symbol if value == old_symbol else value

    strategy = replace_symbol(strategy)
    strategy["name"] = f"公告自动准备验收 {args.symbol}"
    config = copy.deepcopy(old["runConfig"])
    protocol = config["executionPriceProtocol"]
    intent = {"contractVersion": 3, "requestId": str(uuid4()), "adjustment": protocol["priceBasis"]["adjustment"],
              "accountingBasis": protocol["accountingBasis"], "history": protocol["history"],
              "freezeTimePolicy": "after-acquisition", "runConfig": {key: config[key] for key in
              ("startDate", "endDate", "initialCash", "baseCurrency", "valuationPolicy", "executionModel")}}
    intent["runConfig"]["dataAsOf"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    intent["runConfig"]["executionModel"]["scope"]["symbol"] = args.symbol
    for key in ("cashEventResearch", "marketRuleResearch"):
        if key in protocol:
            intent[key] = protocol[key]
    if not args.run:
        print(json.dumps({"mode": "preview", "symbol": args.symbol, "range": [config["startDate"], config["endDate"]],
                          "baselineRun": args.baseline_run}, ensure_ascii=False))
        return
    policy = api("/api/market-data/policy")
    original_targets, restored = None, False
    route_key = {"kind": "bar", "market": "CN", "assetType": "STOCK", "capability": "DAILY_BAR",
                 "timeframe": "1d", "adjustment": protocol["priceBasis"]["adjustment"]}
    temporary_targets = [{"providerId": "tencent", "upstreamSource": "tencent"}]

    def restore():
        nonlocal restored
        if original_targets is None or restored:
            return
        current = api("/api/market-data/policy")
        route = next(row for row in current["routes"] if row["key"] == route_key)
        assert route["targets"] == temporary_targets, "价格路由被其他操作修改，不能覆盖"
        route["targets"] = original_targets
        api("/api/market-data/policy", {"contractVersion": 3, "consumer": "thesis-ledger", "requestId": str(uuid4()),
            "revision": current["revision"] + 1, "enabled": current["enabled"], "routes": current["routes"]}, "PUT")
        restored = True

    if args.temporary_tencent_route:
        routes = copy.deepcopy(policy["routes"])
        route = next(row for row in routes if row["key"] == route_key)
        original_targets = copy.deepcopy(route["targets"])
        atexit.register(restore)
        route["targets"] = temporary_targets
        api("/api/market-data/policy", {"contractVersion": 3, "consumer": "thesis-ledger", "requestId": str(uuid4()),
            "revision": policy["revision"] + 1, "enabled": policy["enabled"], "routes": routes}, "PUT")
    created = api("/api/v1/backtests/strategies", {"name": strategy["name"], "schema": strategy})
    intent["strategyVersionId"] = created["versions"][-1]["id"]
    responses = []
    deadline = time.monotonic() + 600
    while True:
        prepared = api("/api/v1/backtests/run-config/prepare", intent)
        responses.append({"status": prepared["status"], "progress": prepared.get("announcementPreparation")})
        if prepared["status"] != "preparing":
            break
        if time.monotonic() > deadline:
            raise RuntimeError("公告准备未在十分钟内完成")
        time.sleep(2)
    assert prepared["status"] == "prepared", json.dumps(prepared, ensure_ascii=False)[:2500]
    job = api("/api/v1/backtests/runs", {"contractVersion": 3, "strategyVersionId": intent["strategyVersionId"],
              "runConfig": prepared["runConfig"], "preparationStamp": prepared["executionPreflight"]["revisionStamp"],
              "idempotencyKey": "announcement-acceptance-" + str(uuid4())})
    while job["status"] not in ("succeeded", "failed", "cancelled"):
        if time.monotonic() > deadline:
            raise RuntimeError("回测未在十分钟内完成")
        time.sleep(2)
        job = api("/api/v1/backtests/runs/" + job["id"])
    assert job["status"] == "succeeded", json.dumps(job.get("errorSummary"))
    restore()
    assert old == api("/api/v1/backtests/runs/" + args.baseline_run), "原回测记录发生变化"
    after_policy = api("/api/market-data/policy")
    assert policy["routes"] == after_policy["routes"] and policy["enabled"] == after_policy["enabled"], "当前路由发生变化"
    manifest = job["snapshotManifest"]
    assert manifest.get("tradingStatus"), "新快照未纳入已配置状态来源"
    report = {"symbol": args.symbol, "strategyVersionId": intent["strategyVersionId"], "runId": job["id"],
              "statuses": responses, "terminal": job["status"], "snapshotId": job["snapshotId"],
              "tradingStatus": manifest["tradingStatus"], "oldRunPreserved": True, "policyPreserved": True,
              "policyRevisions": [policy["revision"], after_policy["revision"]],
              "oldRunDigest": sha256(json.dumps(old, sort_keys=True).encode()).hexdigest()}
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ("symbol", "runId", "terminal", "oldRunPreserved", "policyPreserved")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
