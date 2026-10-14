"""只读实际冻结输入，以独立Decimal核对已知方案现金资格、账本及每日权益。"""

import json
import sys
from datetime import date, timedelta, datetime
from zoneinfo import ZoneInfo
from decimal import Decimal, ROUND_FLOOR
from pathlib import Path


def record_close_quantity(fills, record_date, calendar):
    closing_minutes = max(session["endMinute"] for session in calendar["sessions"])
    cutoff = datetime.combine(date.fromisoformat(record_date), datetime.min.time(), ZoneInfo(calendar["timezone"])) + timedelta(minutes=closing_minutes)
    eligible = Decimal(0)
    for fill in fills:
        if any(datetime.fromisoformat(fill[key].replace("Z", "+00:00")) > cutoff for key in ("occurredAt", "availableAt")):
            continue
        amount = Decimal(fill["quantity"])
        eligible += amount if fill["side"] == "buy" else -amount
    assert eligible >= 0
    return eligible


def verify_business_cases():
    calendar = {"timezone": "Asia/Shanghai", "sessions": [{"endMinute": 900}]}
    def fill(side, quantity, day):
        return {"side": side, "quantity": quantity, "occurredAt": day + "T01:30:00Z", "availableAt": day + "T01:30:00Z"}
    cases = [
        ("A", [fill("buy", "100", "2025-06-17")], "100", "8.8"),
        ("B", [fill("buy", "100", "2025-06-16"), fill("sell", "40", "2025-06-17")], "60", "5.28"),
        ("C", [fill("buy", "100", "2025-06-18")], "0", "0"),
        ("D", [fill("buy", "100", "2025-06-16"), fill("sell", "100", "2025-06-18")], "100", "8.8"),
        ("E", [fill("buy", "100", "2025-06-27")], "0", "0"),
        ("F", [fill("buy", "100", "2025-06-17")], "100", "8.8"),
    ]
    results = []
    for name, fills, expected_quantity, expected_cash in cases:
        actual = record_close_quantity(fills, "2025-06-17", calendar)
        assert actual == Decimal(expected_quantity)
        assert actual * Decimal("0.088") == Decimal(expected_cash)
        results.append({"case": name, "quantity": str(actual), "cash": expected_cash})
    return results


def verify(path):
    capture = json.loads(Path(path).read_text())
    assert capture["identicalReplay"] and capture["networkCalls"] == 0
    inputs = capture["inputs"]
    config = inputs["runConfig"]
    policy = config["knownCashPreparation"]["input"]
    result = capture["result"]
    disclosure = result["knownCashDividendDisclosure"]
    assert policy["coverage"]["complete"] is False
    assert disclosure["policy"] == policy["policy"]
    assert disclosure["source"] == policy["source"]
    assert config["executionPriceProtocol"]["priceBasis"]["adjustment"] == "none"
    assert config["executionPriceProtocol"]["priceBasis"]["quantityBasis"] == "actual-units"
    assert result["benchmark"]["totalReturn"]["status"] == "unavailable"
    calendar = inputs["calendar"][0]
    def decoded(value):
        return json.loads(value) if isinstance(value, str) else value
    holidays = set(decoded(calendar["holidays"]))
    assert decoded(calendar["sessionOverrides"]) == [], "特殊交易日需要另行支持，不能猜日历"

    def next_session(day):
        current = date.fromisoformat(day) + timedelta(days=1)
        while current.weekday() >= 5 or current.isoformat() in holidays:
            current += timedelta(days=1)
        return current.isoformat()

    fills = sorted(capture["ledger"]["fills"], key=lambda fill: fill["occurredAt"])
    assert not capture["ledger"]["rejects"], "独立正例不接受隐藏拒绝"
    facts = inputs["instrumentFacts"]
    fact = facts[0] if isinstance(facts[0], dict) else facts[0][1][0]
    lot = Decimal(fact["lotSize"])
    sizing = inputs["strategy"]["sizing"]
    budget = Decimal(sizing["amount"]) if sizing["type"] == "fixedAmount" else None
    bars = {bar["occurredAt"][:10]: bar for bar in inputs["bars"]}
    cash = Decimal(config["initialCash"]["CNY"])
    quantity = Decimal(0)
    receipts = []
    for record in disclosure["records"]:
        if record["status"] == "not-adopted":
            assert record["eligibleQuantity"] is None and record["grossCashAmount"] is None
            assert not any(action["mutation"]["fact"]["effectiveDate"] == record["effectiveDate"]
                           for action in capture["ledger"]["cashEvents"]["actions"])
            continue
        source = record["sourceAmount"]
        unit_amount = Decimal(source["value"])
        if source["unit"] == "per-ten-fund-units":
            unit_amount /= 10
        assert unit_amount == Decimal(record["amountPerFundUnit"])
        legacy = policy["policy"]["entitlement"] == "settled-record-date-holdings"
        eligible = Decimal(0)
        if not legacy:
            assert policy["policy"]["entitlement"] == "cn-etf-record-close-holdings-v2"
            eligible = record_close_quantity(fills, record["recordDate"], {**calendar, "sessions": decoded(calendar["sessions"])})
        for fill in fills if legacy else []:
            day = fill["occurredAt"][:10]
            amount = Decimal(fill["quantity"])
            if fill["side"] == "buy" and next_session(day) <= record["recordDate"]:
                eligible += amount
            elif fill["side"] == "sell" and day <= record["recordDate"]:
                eligible -= amount
        assert eligible >= 0
        assert Decimal(record["eligibleQuantity"]) == eligible
        gross = eligible * unit_amount
        assert Decimal(record["grossCashAmount"]) == gross
        expected_status = "simulated-paid" if record["paymentDate"] <= config["endDate"] else "receivable"
        assert record["status"] == expected_status
        action = next(action for action in capture["ledger"]["cashEvents"]["actions"] if action["mutation"]["fact"]["effectiveDate"] == record["effectiveDate"])
        assert action["applied"]
        assert Decimal(action["mutation"]["ledgerEvent"]["payload"]["eligibleQuantity"]) == eligible
        assert Decimal(action["ledger"]["state"]["cash"]["CNY"]["unsettled"]) == gross
        payment = [event for event in capture["ledger"]["cashEvents"]["ledger"] if event["eventId"] == action["eventId"] + ":payment"]
        assert bool(payment) == (expected_status == "simulated-paid")
        receipts.append({"recordDate": record["recordDate"], "effectiveDate": record["effectiveDate"], "paymentDate": record["paymentDate"], "eligibleQuantity": str(eligible), "grossCash": str(gross), "status": expected_status})
    points = []
    processed = set()
    paid = set()
    for point in result["equityCurve"]:
        day = point["occurredAt"][:10]
        for index, receipt in enumerate(receipts):
            if index not in paid and receipt["paymentDate"] <= day:
                cash += Decimal(receipt["grossCash"])
                paid.add(index)
        for fill in fills:
            if fill["fillId"] in processed or fill["occurredAt"][:10] > day:
                continue
            processed.add(fill["fillId"])
            fill_quantity = Decimal(fill["quantity"])
            price = Decimal(fill["price"])
            assert price == Decimal(bars[fill["occurredAt"][:10]]["open"])
            assert all(Decimal(charge["amount"]) == 0 for charge in fill["charges"])
            if fill["side"] == "buy":
                if sizing["type"] == "fixedQuantity":
                    expected_quantity = Decimal(sizing["quantity"])
                    assert cash >= expected_quantity * price
                else:
                    expected_quantity = (min(budget, cash) / price / lot).to_integral_value(rounding=ROUND_FLOOR) * lot
                assert fill_quantity == expected_quantity, (day, fill_quantity, expected_quantity)
                quantity += fill_quantity
                cash -= fill_quantity * price
            else:
                assert fill_quantity == quantity
                quantity -= fill_quantity
                cash += fill_quantity * price
        outstanding = sum((Decimal(receipt["grossCash"]) for index, receipt in enumerate(receipts) if receipt["effectiveDate"] <= day and index not in paid), Decimal(0))
        expected = cash + outstanding + quantity * Decimal(bars[day]["close"])
        assert Decimal(point["value"]["amount"]) == expected, (day, expected, point)
        points.append({"date": day, "settledCash": str(cash), "receivable": str(outstanding), "quantity": str(quantity), "equity": str(expected)})
    final = points[-1]
    initial = Decimal(config["initialCash"]["CNY"])
    assert Decimal(result["metrics"]["totalReturn"]["value"]) == Decimal(final["equity"]) / initial - 1
    # 公司行动直接记账与常规Ledger mutation分别捕获；不能把较早的最后一条
    # 常规mutation当作除息后的最终应收状态。按冻结日历及显式T+1/T+0时序合并。
    candidates = []
    times = {}
    for fill in fills:
        day = fill["occurredAt"][:10]
        times[fill["fillId"]] = (day, 3)
        times[fill["orderId"] + ":fill-event"] = (day, 3)
        times[fill["orderId"] + ":cash-settlement"] = (day, 4)
        times[fill["orderId"] + ":position-settlement"] = (next_session(day), 0)
    for action in capture["ledger"]["cashEvents"]["actions"]:
        fact = action["mutation"]["fact"]
        candidates.append((fact["effectiveDate"], 1, 0, action["ledger"]["state"]))
        times[action["eventId"] + ":payment"] = (fact["paymentDate"], 2)
    for index, event in enumerate(capture["ledger"]["cashEvents"]["ledger"]):
        assert event["eventId"] in times, "未知账本时序不能猜测"
        day, phase = times[event["eventId"]]
        candidates.append((day, phase, index, event["state"]))
    final_ledger = max(candidates, key=lambda item: item[:3])[3]
    assert Decimal(final_ledger["cash"]["CNY"]["settled"]) == Decimal(final["settledCash"])
    assert Decimal(final_ledger["cash"]["CNY"]["unsettled"]) == Decimal(final["receivable"])
    return {"runId": capture["runId"], "snapshotId": capture["snapshotId"], "resultChecksum": result["resultChecksum"], "records": receipts, "fills": [{key: fill[key] for key in ["side", "quantity", "price", "occurredAt"]} for fill in fills], "final": final, "equityPointsChecked": len(points), "allEquityPointsMatch": True, "networkCalls": 0}


if "--rule-cases" in sys.argv:
    print(json.dumps({"businessRuleCases": verify_business_cases(), "basis": "一手登记截止规则的独立期望，非真实成交验收"}, ensure_ascii=False))
else:
    for filename in sys.argv[1:]:
        result = verify(filename)
        original = json.loads(Path(filename).read_text())["inputs"]["runConfig"]["knownCashPreparation"]["input"]["policy"]
        result["entitlementVersion"] = original["entitlement"]
        result["verificationPurpose"] = "historical-replay-compatibility" if original["entitlement"] == "settled-record-date-holdings" else "record-close-business-rule"
        print(json.dumps(result, ensure_ascii=False))
