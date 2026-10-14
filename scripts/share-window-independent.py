"""从冻结原响应独立复算整股成交、逐项费用、现金净值和基准。"""

from copy import deepcopy
from datetime import datetime
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP, localcontext
import json
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

data = json.loads(Path(sys.argv[1]).read_text())
assert data["identicalReplay"] and data["replayCount"] == 2 and data["networkCalls"] == 0
inputs, result = data["inputs"], data["result"]
config, model = inputs["runConfig"], inputs["executionModel"]
assert config["executionPriceProtocol"]["accountingBasis"] == "raw-events"
assert config["executionPriceProtocol"]["priceBasis"]["quantityBasis"] == "actual-units"
assert config["executionPriceProtocol"]["priceBasis"]["adjustment"] == "none"
assert model["scope"]["symbol"] == "GME.US" and model["scope"]["currency"] == "USD"
assert inputs["instrumentFacts"][0]["lotSize"] == "1" and inputs["instrumentFacts"][0]["tickSize"] == "0.01"
fees = inputs["publicFees"]["disclosure"]["response"]
states = inputs["tradingStatus"]["disclosure"]["response"]
assert all(day["state"] == "unknown" for day in states["days"])
assert result["tradingStatusDisclosure"].get("executionInterpretation", {}).get("excludedDates", []) == []
assert fees["provenance"]["chargeDatePolicy"]["effectiveTradeDate"] == "2024-05-20"
raw = json.loads((Path(__file__).parent / "../../daily-stock-analysis/data_provider/market_reference/us-gme-share-window.raw.json").resolve().read_text())["chart"]["result"][0]
quotes = raw["indicators"]["quote"][0]
original = {datetime.fromtimestamp(timestamp, ZoneInfo("America/New_York")).date().isoformat(): index
            for index, timestamp in enumerate(raw["timestamp"])}
for bar in inputs["bars"]:
    index = original[bar["occurredAt"][:10]]
    for field in ("open", "high", "low", "close"):
        assert Decimal(bar[field]) == Decimal(str(quotes[field][index])).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    assert Decimal(bar["volume"]) == quotes["volume"][index] and bar.get("amount") is None


def charges(day, side, quantity, price):
    table = deepcopy(next(segment["fees"] for segment in model["segments"]
                          if segment["range"]["start"] <= day <= segment["range"]["end"]))
    segment = next(segment for segment in fees["segments"] if segment["range"]["start"] <= day < segment["range"]["endExclusive"])
    for item in segment["charges"]:
        table[item["code"]].update({key: value for key, value in item.items() if key not in ("code", "sourceDocumentIds")})
    gross = quantity * price
    broker = table["brokerCommission"]
    assert broker["basis"]["kind"] == "actualShares" and quantity == quantity.to_integral_value()
    parts = []
    for code, item in (("commission", broker["commission"]), ("platformFee", broker["platformFee"])):
        value = quantity * Decimal(item["rate"])
        if item["maximumTurnoverRatio"] is not None:
            value = min(value, gross * Decimal(item["maximumTurnoverRatio"]))
        parts.append((code, max(value, Decimal(item["minimumAmount"])).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)))
    if side == "sell":
        parts.append(("regulatoryFee", (gross * Decimal(table["regulatoryFee"]["rate"])).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)))
    taf = table["tradingActivityFee"]
    value = Decimal(0) if side != "sell" or price < Decimal(taf["rate"]) else min(quantity * Decimal(taf["rate"]), Decimal(taf["maximumAmount"]))
    parts.append(("tradingActivityFee", value.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)))
    return parts


def fit(day, maximum, price, cash):
    low, high = 0, int(maximum.to_integral_value(rounding=ROUND_FLOOR))
    while low < high:
        middle = (low + high + 1) // 2
        quantity = Decimal(middle)
        debit = quantity * price + sum((value for _, value in charges(day, "buy", quantity, price)), Decimal(0))
        if debit <= cash:
            low = middle
        else:
            high = middle - 1
    return Decimal(low)


with localcontext() as context:
    context.prec = 100
    bars = sorted((bar for bar in inputs["bars"] if config["startDate"] <= bar["occurredAt"][:10] <= config["endDate"]), key=lambda bar: bar["occurredAt"])
    initial = Decimal(config["initialCash"]["USD"])
    cash, held, pending, previous_entry = initial, Decimal(0), None, False
    allocation = Decimal(inputs["strategy"]["sizing"]["amount"])
    expected, equities = [], {}
    for bar in bars:
        day, price = bar["occurredAt"][:10], Decimal(bar["open"])
        if pending:
            quantity = fit(day, allocation / price, price, cash) if pending == "buy" else held
            assert quantity > 0
            parts = charges(day, pending, quantity, price)
            total = sum((value for _, value in parts), Decimal(0))
            if pending == "buy":
                cash -= quantity * price + total
                held = quantity
            else:
                cash += quantity * price - total
                held = Decimal(0)
            assert cash >= 0
            expected.append({"date": day, "side": pending, "quantity": quantity, "price": price, "charges": parts})
        equities[day] = cash + held * Decimal(bar["close"])
        previous = max((item for item in inputs["bars"] if item["occurredAt"] < bar["occurredAt"]), key=lambda item: item["occurredAt"])
        entry = held == 0 and Decimal(bar["close"]) <= (Decimal(previous["close"]) + Decimal(bar["close"])) / 2
        pending = "sell" if held else ("buy" if entry and not previous_entry else None)
        previous_entry = entry
    assert len(result["simulationFills"]) == len(expected)
    for actual, wanted in zip(result["simulationFills"], expected):
        assert actual["occurredAt"][:10] == wanted["date"] and actual["side"] == wanted["side"]
        assert Decimal(actual["quantity"]) == wanted["quantity"] and Decimal(actual["price"]) == wanted["price"]
        assert [Decimal(part["amount"]) for part in actual["charges"]] == [value for _, value in wanted["charges"]]
        assert all(part["currency"] == "USD" for part in actual["charges"])
    for point in result["equityCurve"]:
        assert Decimal(point["value"]["amount"]) == equities[point["occurredAt"][:10]]
    final = equities[bars[-1]["occurredAt"][:10]]
    returned = (final / initial - 1).quantize(Decimal("1e-20"), rounding=ROUND_HALF_UP)
    assert Decimal(result["metrics"]["totalReturn"]["value"]) == returned
    first, last = bars[0], bars[-1]
    buy_price, sell_price = Decimal(first["close"]), Decimal(last["close"])
    quantity = fit(first["occurredAt"][:10], initial / buy_price, buy_price, initial)
    buy_fees = sum((value for _, value in charges(first["occurredAt"][:10], "buy", quantity, buy_price)), Decimal(0))
    sell_fees = sum((value for _, value in charges(last["occurredAt"][:10], "sell", quantity, sell_price)), Decimal(0))
    residual = initial - quantity * buy_price - buy_fees
    benchmark_final = residual + quantity * sell_price - sell_fees
    benchmark_return = (benchmark_final / initial - 1).quantize(Decimal("1e-20"), rounding=ROUND_HALF_UP)
    assert result["benchmarkCompatibility"]["status"] == "compatible"
    assert Decimal(result["benchmark"]["totalReturn"]["value"]) == benchmark_return
    assert Decimal(result["benchmark"]["excessReturn"]["value"]) == returned - benchmark_return
    print(json.dumps({"runId": data["runId"], "checksum": data["resultChecksum"], "fillCount": len(expected),
        "finalCash": str(cash), "finalQuantity": str(held), "finalEquity": str(final), "return": str(returned),
        "equityPointsChecked": len(result["equityCurve"]), "ledger": expected,
        "benchmark": {"quantity": str(quantity), "buyFees": str(buy_fees), "sellFees": str(sell_fees),
            "residualCash": str(residual), "finalCash": str(benchmark_final), "return": str(benchmark_return)}},
        default=str, ensure_ascii=False, indent=2))
