"""只读目标000995快照输入，独立计算原价整手、限制边界与逐日现金账。"""

import json
import sys
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text())
assert data["identicalReplay"] and data["networkCalls"] == 0
inputs, outcome = data["inputs"], data["result"]
config = inputs["runConfig"]
assert config["executionPriceProtocol"]["marketRuleResearch"] == "raw-prices-no-corporate-actions-v1"
assert inputs["strategy"]["executionInstrument"]["symbol"] == "000995.SZ"
assert inputs["tradingStatus"]["freezeVersion"] == "frozen-trading-status-v2"
response = inputs["tradingStatus"]["disclosure"]["response"]
states = {item["date"]: item for item in response["days"]}
bars = sorted(inputs["bars"], key=lambda row: row["occurredAt"])
cash, quantity = Decimal("100000"), Decimal("0")
pending = None
expected_fills = []
expected_equity = {}
previous = None
for bar in bars:
    day = bar["occurredAt"][:10]
    if day < config["startDate"]:
        previous = bar
        continue
    if day > config["endDate"]:
        break
    if pending and states[day]["state"] != "suspended":
        price = Decimal(bar["open"]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        limit = states[day]["dailyPriceLimit"]
        reference = Decimal(previous["close"])
        upper = (reference * (1 + Decimal(limit["maxUpRatio"]))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        lower = (reference * (1 - Decimal(limit["maxDownRatio"]))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        assert lower <= price <= upper, (day, price, lower, upper)
        if pending == "buy":
            quantity = (Decimal("50000") / price / 100).to_integral_value(rounding=ROUND_FLOOR) * 100
            cash -= quantity * price
            filled_quantity = quantity
        else:
            filled_quantity = quantity
            cash += quantity * price
            quantity = Decimal("0")
        expected_fills.append({"date": day, "side": pending, "quantity": str(filled_quantity), "price": str(price)})
        pending = None
    expected_equity[day] = cash + quantity * Decimal(bar["close"])
    pending = "sell" if quantity else "buy"
    previous = bar
assert [item["date"] for item in expected_fills] == ["2023-08-18", "2023-08-21"]
assert len(outcome["simulationFills"]) == 2
for expected, actual in zip(expected_fills, outcome["simulationFills"]):
    assert actual["occurredAt"][:10] == expected["date"]
    assert actual["side"] == expected["side"]
    assert Decimal(actual["quantity"]) == Decimal(expected["quantity"])
    assert Decimal(actual["price"]) == Decimal(expected["price"])
    assert all(Decimal(charge["amount"]) == 0 for charge in actual["charges"])
for point in outcome["equityCurve"]:
    day = point["occurredAt"][:10]
    balance, held = Decimal("100000"), Decimal("0")
    for fill in expected_fills:
        if fill["date"] > day:
            break
        shares, price = Decimal(fill["quantity"]), Decimal(fill["price"])
        if fill["side"] == "buy":
            balance -= shares * price
            held += shares
        else:
            balance += shares * price
            held -= shares
    latest = next(bar for bar in reversed(bars) if bar["occurredAt"][:10] <= day)
    expected = balance + held * Decimal(latest["close"])
    assert Decimal(point["value"]["amount"]) == expected
assert quantity == 0
assert Decimal(outcome["metrics"]["totalReturn"]["value"]) == cash / Decimal("100000") - 1
print(json.dumps({"runId": data["runId"], "checksum": data["resultChecksum"],
                  "fills": expected_fills, "finalCash": str(cash),
                  "totalReturn": str(cash / Decimal("100000") - 1),
                  "allEquityPointsMatch": True, "priceLimitChecksPassed": True}, ensure_ascii=False))
