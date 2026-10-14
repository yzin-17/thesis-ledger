"""独立按冻结每手参数复算真实HK原价、整手预算、费用与现金/基准。"""

from copy import deepcopy
from datetime import datetime
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, localcontext
import json
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

data = json.loads(Path(sys.argv[1]).read_text())
assert data["identicalReplay"] and data["replayCount"] == 2 and data["networkCalls"] == 0
inputs, result = data["inputs"], data["result"]
config, model = inputs["runConfig"], inputs["executionModel"]
preset = model["researchLotSize"]
assert model["scope"]["symbol"] == "00147.HK" and model["scope"]["currency"] == "HKD"
assert config["executionPriceProtocol"]["priceBasis"]["quantityBasis"] == "actual-units"
assert config["executionPriceProtocol"]["priceBasis"]["adjustment"] == "none"
assert preset["historicalChanges"] == "unverified" and preset["defaultSharesPerLot"] == "5000"
assert inputs["instrumentFacts"][0]["lotSize"] == "5000"
step = Decimal(preset["sharesPerLot"])
assert step > 0 and step == step.to_integral_value()
assert data["benchmarkCostVersion"] == "research-lot-share-window-cost-v1"
public = inputs["publicFees"]["disclosure"]["response"]
raw = json.loads((Path(__file__).parent / "../../daily-stock-analysis/data_provider/market_reference/hk00147-share-window.raw.json").resolve().read_text())["chart"]["result"][0]
quote = raw["indicators"]["quote"][0]
original = {datetime.fromtimestamp(t, ZoneInfo("Asia/Hong_Kong")).date().isoformat(): i for i, t in enumerate(raw["timestamp"])}
for bar in inputs["bars"]:
    index = original[bar["occurredAt"][:10]]
    assert quote["volume"][index] > 0
    for field in ("open", "high", "low", "close"):
        source = Decimal(str(quote[field][index]))
        tick = Decimal(".001") if source <= Decimal(".25000005") else Decimal(".005")
        price = (source / tick).quantize(Decimal(1), rounding=ROUND_HALF_UP) * tick
        assert abs(source - price) <= Decimal(".00000005") and Decimal(bar[field]) == price
    assert Decimal(bar["volume"]) == quote["volume"][index] and bar.get("amount") is None


def charges(day, side, quantity, price):
    table = deepcopy(next(s["fees"] for s in model["segments"] if s["range"]["start"] <= day <= s["range"]["end"]))
    selected = next(s for s in public["segments"] if s["range"]["start"] <= day < s["range"]["endExclusive"])
    for item in selected["charges"]:
        table[item["code"]].update({k: v for k, v in item.items() if k not in ("code", "sourceDocumentIds")})
    gross = quantity * price
    broker = table["brokerCommission"]
    assert broker["basis"]["kind"] == "turnover" and broker["platformFee"]["kind"] == "fixed"
    commission = gross * Decimal(broker["commission"]["rate"])
    maximum = broker["commission"]["maximumTurnoverRatio"]
    if maximum is not None:
        commission = min(commission, gross * Decimal(maximum))
    parts = [("commission", max(commission, Decimal(broker["commission"]["minimumAmount"])).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)),
             ("platformFee", Decimal(broker["platformFee"]["amount"]).quantize(Decimal(".01"), rounding=ROUND_HALF_UP))]
    for code in ("stampDuty", "regulatoryFee", "handlingFee", "afrcLevy"):
        item = table[code]
        assert item["basis"] == "turnover" and item["currency"] == "HKD"
        if item["side"] not in (side, "both"):
            continue
        value = gross * Decimal(item["rate"])
        if item["minimum"]["kind"] == "amount":
            value = max(value, Decimal(item["minimum"]["amount"]))
        rounding = item.get("amountRounding", {"mode": "halfUp", "decimalPlaces": 2})
        unit = Decimal(1).scaleb(-rounding["decimalPlaces"])
        value = value.quantize(unit, rounding=ROUND_CEILING if rounding["mode"] == "ceil" else ROUND_HALF_UP)
        parts.append((code, value))
    return parts


def fit(day, maximum, price, cash):
    low, high = 0, int((maximum / step).to_integral_value(rounding=ROUND_FLOOR))
    while low < high:
        middle = (low + high + 1) // 2
        qty = Decimal(middle) * step
        debit = qty * price + sum((v for _, v in charges(day, "buy", qty, price)), Decimal(0))
        if debit <= cash:
            low = middle
        else:
            high = middle - 1
    return Decimal(low) * step


with localcontext() as ctx:
    ctx.prec = 100
    bars = sorted((b for b in inputs["bars"] if config["startDate"] <= b["occurredAt"][:10] <= config["endDate"]), key=lambda b: b["occurredAt"])
    initial = Decimal(config["initialCash"]["HKD"])
    cash, held, pending = initial, Decimal(0), None
    allocation = Decimal(inputs["strategy"]["sizing"]["amount"])
    ledger, values = [], {}
    for bar in bars:
        day, price = bar["occurredAt"][:10], Decimal(bar["open"])
        if pending:
            qty = fit(day, allocation / price, price, cash) if pending == "buy" else held
            if qty > 0:
                parts = charges(day, pending, qty, price)
                total = sum((v for _, v in parts), Decimal(0))
                cash += qty * price - total if pending == "sell" else -(qty * price + total)
                held = Decimal(0) if pending == "sell" else qty
                ledger.append({"date": day, "side": pending, "quantity": qty, "price": price, "charges": parts})
        assert cash >= 0 and held % step == 0
        values[day] = cash + held * Decimal(bar["close"])
        pending = "sell" if held else "buy"
    assert len(result["simulationFills"]) == len(ledger)
    for actual, wanted in zip(result["simulationFills"], ledger):
        assert actual["occurredAt"][:10] == wanted["date"] and actual["side"] == wanted["side"]
        assert Decimal(actual["quantity"]) == wanted["quantity"] and Decimal(actual["price"]) == wanted["price"]
        assert [Decimal(p["amount"]) for p in actual["charges"]] == [v for _, v in wanted["charges"]]
        assert all(p["currency"] == "HKD" for p in actual["charges"])
    for point in result["equityCurve"]:
        assert Decimal(point["value"]["amount"]) == values[point["occurredAt"][:10]]
    final = values[bars[-1]["occurredAt"][:10]]
    returned = (final / initial - 1).quantize(Decimal("1e-20"), rounding=ROUND_HALF_UP)
    assert Decimal(result["metrics"]["totalReturn"]["value"]) == returned
    first, last = bars[0], bars[-1]
    buy_price, sell_price = Decimal(first["close"]), Decimal(last["close"])
    qty = fit(first["occurredAt"][:10], initial / buy_price, buy_price, initial)
    benchmark = {"quantity": str(qty)}
    if qty == 0:
        assert result["benchmark"]["totalReturn"]["status"] == "unavailable"
        assert "BENCHMARK_INSUFFICIENT_CASH" in str(result["benchmark"])
    else:
        buy_fees = sum((v for _, v in charges(first["occurredAt"][:10], "buy", qty, buy_price)), Decimal(0))
        sell_fees = sum((v for _, v in charges(last["occurredAt"][:10], "sell", qty, sell_price)), Decimal(0))
        residual = initial - qty * buy_price - buy_fees
        end = residual + qty * sell_price - sell_fees
        bench_return = (end / initial - 1).quantize(Decimal("1e-20"), rounding=ROUND_HALF_UP)
        assert residual >= 0 and result["benchmarkCompatibility"]["status"] == "compatible"
        assert Decimal(result["benchmark"]["totalReturn"]["value"]) == bench_return
        assert Decimal(result["benchmark"]["excessReturn"]["value"]) == returned - bench_return
        benchmark.update({"buyFees": str(buy_fees), "sellFees": str(sell_fees), "residualCash": str(residual), "finalCash": str(end), "return": str(bench_return)})
    print(json.dumps({"runId": data["runId"], "checksum": data["resultChecksum"], "sharesPerLot": str(step),
        "fillCount": len(ledger), "finalCash": str(cash), "finalQuantity": str(held), "finalEquity": str(final),
        "return": str(returned), "equityPointsChecked": len(result["equityCurve"]), "ledger": ledger, "benchmark": benchmark},
        default=str, ensure_ascii=False, indent=2))
