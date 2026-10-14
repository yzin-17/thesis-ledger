"""从目标冻结输入独立复算归一化数量、部分费用、暂停解释与逐日现金账。"""
from copy import deepcopy
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP, ROUND_FLOOR, ROUND_CEILING, localcontext
import json
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

data = json.loads(Path(sys.argv[1]).read_text())
assert data["identicalReplay"] and data["replayCount"] == 2 and data["networkCalls"] == 0
inputs, result = data["inputs"], data["result"]
config = inputs["runConfig"]
model = inputs["executionModel"]
market, currency = model["scope"]["market"], model["scope"]["currency"]
assert config["executionPriceProtocol"]["accountingBasis"] == "normalized-series"
assert config["executionPriceProtocol"]["priceBasis"]["quantityBasis"] == "normalized-units"
state = inputs["tradingStatus"]["disclosure"]["response"]
fees = inputs["publicFees"]["disclosure"]["response"]
calendar = next(fact for fact in inputs["calendar"] if fact["market"] == market)
assert calendar["timezone"] == state["provenance"]["timezone"] == model["scope"]["timezone"]
assert all(day["state"] == "unknown" for day in state["days"])
assert all(doc["sha256"] and doc["observedAt"] for doc in state["sourceDocuments"] + fees["sourceDocuments"])
halts = [halt for day in state["days"] for halt in day.get("intradayHalts", [])]
assert len(halts) == (1 if market == "HK" else 3)
tz = ZoneInfo(calendar["timezone"])
overrides = {item["date"]: item["sessions"] for item in calendar["sessionOverrides"]}
excluded = []
for day in state["days"]:
    date = datetime.fromisoformat(day["date"]).date()
    if date.weekday() >= 5 or day["date"] in calendar["holidays"]:
        continue
    sessions = overrides.get(day["date"], calendar["sessions"])
    for session in sessions:
        first = datetime.combine(date, time(), tz) + timedelta(minutes=session["startMinute"])
        last = datetime.combine(date, time(), tz) + timedelta(minutes=session["endMinute"])
        if any(datetime.fromisoformat(halt["startedAt"]) < last and
               (halt["endedAt"] is None or datetime.fromisoformat(halt["endedAt"]) > first) for halt in halts):
            excluded.append(day["date"])
            break
assert excluded == (["2025-08-07"] if market == "HK" else ["2024-05-13"])
assert result["tradingStatusDisclosure"]["executionInterpretation"]["excludedDates"] == excluded
if market == "HK":
    record = inputs["instrumentFacts"][0]
    windows = json.loads(record["historicalTradabilityWindows"])
    day = next(day for window in windows for day in window["days"] if day["date"] == "2025-08-07")
    assert day["state"] == "assumed-untradable-no-bar" and day["excludedZeroVolumeObservation"]["volume"] == "0"
    assert len(day["excludedZeroVolumeObservation"]["sourceResponseSha256"]) == 64
    assert not any(bar["occurredAt"].startswith("2025-08-07") for bar in inputs["bars"])
    assert any("零成交量" in warning for warning in result["warnings"])
if market == "US":
    policy = fees["provenance"]["chargeDatePolicy"]
    assert policy["basis"] == "exchangeSettlement" and policy["settlementLagSessions"] == 2
    assert policy["rateChangeChargeDate"] == "2024-05-22" and policy["effectiveTradeDate"] == "2024-05-20"
    assert fees["segments"][1]["range"]["start"] == "2024-05-20"


def fee_table(day):
    original = next(part for part in model["segments"] if part["range"]["start"] <= day <= part["range"]["end"])
    table = deepcopy(original["fees"])
    source = next(part for part in fees["segments"] if part["range"]["start"] <= day < part["range"]["endExclusive"])
    assert len(source["charges"]) in (1, 4)
    for charge in source["charges"]:
        selected = table[charge["code"]]
        assert selected["treatment"] == "charged"
        selected.update({key: charge[key] for key in ("side", "basis", "currency", "rate")})
        if "amountRounding" in charge:
            selected["amountRounding"] = charge["amountRounding"]
    return table


def amounts(day, side, gross):
    table = fee_table(day)
    assert table["rounding"] == {"mode": "halfUp", "decimalPlaces": 2}
    assert table["collection"] == "perFillPerCharge"
    calculated = []
    broker = table.get("brokerCommission")
    if broker:
        assert broker["collection"] == "single-fill-order-v1"
        basis = gross
        if broker["basis"]["kind"] == "referencePrice":
            basis = gross / Decimal(broker["basis"]["price"])
        else:
            assert broker["basis"]["kind"] == "turnover"
        for code, item in (("commission", broker["commission"]), ("platformFee", broker["platformFee"])):
            if item.get("kind") == "fixed":
                amount = Decimal(item["amount"])
            else:
                amount = basis * Decimal(item["rate"])
                if item["maximumTurnoverRatio"] is not None:
                    amount = min(amount, gross * Decimal(item["maximumTurnoverRatio"]))
                amount = max(amount, Decimal(item["minimumAmount"]))
            calculated.append({"code": code, "amount": amount.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)})
    for code in ("commission", "stampDuty", "transferFee", "regulatoryFee", "handlingFee", "afrcLevy"):
        if broker and code == "commission":
            continue
        charge = table.get(code)
        if charge is None:
            continue
        if charge["treatment"] != "charged" or charge["side"] not in (side, "both"):
            continue
        assert charge["currency"] == currency and charge["basis"] == "turnover"
        amount = gross * Decimal(charge["rate"])
        if charge["minimum"]["kind"] == "amount":
            amount = max(amount, Decimal(charge["minimum"]["amount"]))
        rounding = charge.get("amountRounding")
        if rounding:
            assert rounding == {"mode": "ceil", "decimalPlaces": 0}
            rounded = amount.quantize(Decimal(1), rounding=ROUND_CEILING)
        else:
            rounded = amount.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
        calculated.append({"code": code, "amount": rounded})
    return calculated


with localcontext() as context:
    context.prec = 200
    bars = [bar for bar in inputs["bars"] if config["startDate"] <= bar["occurredAt"][:10] <= config["endDate"]]
    bars.sort(key=lambda bar: bar["occurredAt"])
    initial = Decimal(config["initialCash"][currency])
    cash, held, pending = initial, Decimal(0), None
    previous_entry = False
    expected, equities, total_fees = [], {}, Decimal(0)
    amount = Decimal(inputs["strategy"]["sizing"]["amount"])
    unit = Decimal("1e-40")
    for bar in bars:
        day, price = bar["occurredAt"][:10], Decimal(bar["open"])
        if pending and day not in excluded:
            quantity = (amount / price).quantize(unit, rounding=ROUND_HALF_UP) if pending == "buy" else held
            parts = amounts(day, pending, quantity * price)
            fee = sum((item["amount"] for item in parts), Decimal(0))
            if pending == "buy" and quantity * price + fee > cash:
                low, high = 0, int((quantity / unit).to_integral_value(rounding=ROUND_FLOOR))
                while low < high:
                    middle = (low + high + 1) // 2
                    q = Decimal(middle) * unit
                    debit = q * price + sum((item["amount"] for item in amounts(day, pending, q * price)), Decimal(0))
                    if debit <= cash: low = middle
                    else: high = middle - 1
                quantity = Decimal(low) * unit
                parts = amounts(day, pending, quantity * price)
                fee = sum((item["amount"] for item in parts), Decimal(0))
            gross = quantity * price
            if pending == "buy": cash -= gross + fee; held = quantity
            else: cash += gross - fee; held = Decimal(0)
            assert cash >= 0
            expected.append({"date": day, "side": pending, "quantity": quantity, "price": price, "charges": parts})
            total_fees += fee
        equities[day] = cash + held * Decimal(bar["close"])
        previous_bar = max((item for item in inputs["bars"] if item["occurredAt"] < bar["occurredAt"]), key=lambda item: item["occurredAt"])
        eligible_entry = market == "HK" or Decimal(bar["close"]) <= (Decimal(previous_bar["close"]) + Decimal(bar["close"])) / 2
        entry = eligible_entry and held == 0
        pending = "sell" if held else ("buy" if entry and not previous_entry else None)
        previous_entry = entry
    actual = result["simulationFills"]
    assert len(actual) == len(expected)
    for fill, check in zip(actual, expected):
        assert fill["occurredAt"][:10] == check["date"] and fill["side"] == check["side"]
        assert Decimal(fill["quantity"]) == check["quantity"] and Decimal(fill["price"]) == check["price"]
        assert [Decimal(charge["amount"]) for charge in fill["charges"]] == [charge["amount"] for charge in check["charges"]]
        assert all(charge["currency"] == currency for charge in fill["charges"])
    for point in result["equityCurve"]:
        day = point["occurredAt"][:10]
        balance, held_at = initial, Decimal(0)
        for fill in expected:
            if fill["date"] > day: break
            gross = fill["quantity"] * fill["price"]
            fee = sum((item["amount"] for item in fill["charges"]), Decimal(0))
            if fill["side"] == "buy": balance -= gross + fee; held_at = fill["quantity"]
            else: balance += gross - fee; held_at = Decimal(0)
        latest = max((bar for bar in inputs["bars"] if bar["occurredAt"][:10] <= day), key=lambda bar: bar["occurredAt"])
        value = balance + held_at * Decimal(latest["close"])
        assert Decimal(point["value"]["amount"]) == value, (day, point, value)
    final = equities[bars[-1]["occurredAt"][:10]]
    returned = (final / initial - 1).quantize(Decimal("1e-20"), rounding=ROUND_HALF_UP)
    assert Decimal(result["metrics"]["totalReturn"]["value"]) == returned
    eligible = [bar for bar in bars if bar["occurredAt"][:10] not in excluded]
    buy, sell = eligible[0], eligible[-1]
    buy_price, sell_price = Decimal(buy["close"]), Decimal(sell["close"])
    low, high = 0, int((initial / buy_price / unit).to_integral_value(rounding=ROUND_FLOOR))
    while low < high:
        middle = (low + high + 1) // 2
        q = Decimal(middle) * unit
        debit = q * buy_price + sum((part["amount"] for part in amounts(buy["occurredAt"][:10], "buy", q * buy_price)), Decimal(0))
        if debit <= initial: low = middle
        else: high = middle - 1
    q = Decimal(low) * unit
    buy_fees = sum((part["amount"] for part in amounts(buy["occurredAt"][:10], "buy", q * buy_price)), Decimal(0))
    sell_fees = sum((part["amount"] for part in amounts(sell["occurredAt"][:10], "sell", q * sell_price)), Decimal(0))
    benchmark_final = initial - q * buy_price - buy_fees + q * sell_price - sell_fees
    benchmark_return = (benchmark_final / initial - 1).quantize(Decimal("1e-20"), rounding=ROUND_HALF_UP)
    assert result["benchmarkCompatibility"]["status"] == "compatible"
    assert Decimal(result["benchmark"]["totalReturn"]["value"]) == benchmark_return
    assert Decimal(result["benchmark"]["excessReturn"]["value"]) == returned - benchmark_return
    print(json.dumps({"market": market, "runId": data["runId"], "resultChecksum": data["resultChecksum"],
        "sourceStateRemainsUnknown": True, "independentExcludedDates": excluded, "fillCount": len(expected),
        "totalFees": str(total_fees), "finalCash": str(cash), "finalQuantity": str(held),
        "finalEquity": str(final), "return": str(returned), "equityPointsChecked": len(result["equityCurve"]),
        "benchmark": {"buyDate": buy["occurredAt"][:10], "sellDate": sell["occurredAt"][:10],
            "quantity": str(q), "buyFees": str(buy_fees), "sellFees": str(sell_fees),
            "finalEquity": str(benchmark_final), "return": str(benchmark_return)},
        "ledger": expected}, default=str, ensure_ascii=False, indent=2))
