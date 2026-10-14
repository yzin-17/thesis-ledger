"""从实际冻结原价独立核对上市阶段、交易限制、现金与每日净值。"""
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP, localcontext
import json
from pathlib import Path
import sys

data = json.loads(Path(sys.argv[1]).read_text())
assert data["identicalReplay"] and data["replayCount"] == 2 and data["networkCalls"] == 0
inputs, result = data["inputs"], data["result"]
config, model = inputs["runConfig"], inputs["executionModel"]
protocol = config["executionPriceProtocol"]
assert protocol["marketRuleResearch"] == "raw-prices-no-corporate-actions-v1"
assert protocol["priceBasis"]["quantityBasis"] == "actual-units"
assert protocol["accountingBasis"] == "raw-events"
assert inputs["tradingStatus"]["freezeVersion"] == "frozen-trading-status-v3"
status = inputs["tradingStatus"]["disclosure"]["response"]
days = {day["date"]: day for day in status["days"]}
assert all(doc["sha256"] and doc["observedAt"] for doc in status["sourceDocuments"])
facts = inputs["instrumentFacts"][0]
assert facts["lotSize"] == "100" and facts["tickSize"] == "0.01"
bars = sorted(inputs["bars"], key=lambda bar: bar["occurredAt"])
active = [bar for bar in bars if config["startDate"] <= bar["occurredAt"][:10] <= config["endDate"]]
listing = model["scope"]["symbol"] == "603350.SH"
if listing:
    assert bars[0]["occurredAt"][:10] == "2024-07-03"
    assert len(bars) == 7
    for date in ["2024-07-04", "2024-07-05", "2024-07-08", "2024-07-09"]:
        assert days[date]["listingPhase"] == "initialListing" and days[date]["noDailyPriceLimit"]
        assert "dailyPriceLimit" not in days[date]
    for date in ["2024-07-10", "2024-07-11"]:
        assert days[date]["listingPhase"] == "listed"
        assert days[date]["dailyPriceLimit"]["maxUpRatio"] == "0.1"
else:
    assert len(active) == 3
    assert all(bar["occurredAt"][:10] <= "2025-07-14" for bar in bars)
    assert days["2025-07-14"]["listingPhase"] == "delistingPeriod"
    assert days["2025-07-15"]["state"] == "suspended"
    assert days["2025-07-21"]["listingPhase"] == "delisted"
    assert days["2025-07-21"]["state"] == "unknown"

with localcontext() as context:
    context.prec = 100
    cash, held = Decimal(config["initialCash"]["CNY"]), Decimal(0)
    initial = cash
    lot, tick = Decimal(facts["lotSize"]), Decimal(facts["tickSize"])
    amount = Decimal(inputs["strategy"]["sizing"]["amount"])
    expected, pending = [], None
    values = {}
    for bar in active:
        date = bar["occurredAt"][:10]
        day = days[date]
        assert day.get("listingPhase") not in ["notListed", "delisted"] and day["state"] != "suspended"
        price = Decimal(bar["open"])
        if pending:
            if "dailyPriceLimit" in day:
                previous = max((item for item in bars if item["occurredAt"] < bar["occurredAt"]), key=lambda item: item["occurredAt"])
                prior = Decimal(previous["close"])
                rule = day["dailyPriceLimit"]
                upper = (prior * (1 + Decimal(rule["maxUpRatio"])) / tick).quantize(Decimal(1), rounding=ROUND_HALF_UP) * tick
                lower = (prior * (1 - Decimal(rule["maxDownRatio"])) / tick).quantize(Decimal(1), rounding=ROUND_HALF_UP) * tick
                assert lower <= price <= upper
            quantity = (min(amount, cash) / price / lot).quantize(Decimal(1), rounding=ROUND_FLOOR) * lot if pending == "buy" else held
            gross = quantity * price
            if pending == "buy":
                cash -= gross
                held = quantity
            else:
                cash += gross
                held = Decimal(0)
            assert cash >= 0
            expected.append((date, pending, quantity, price))
        values[date] = cash + held * Decimal(bar["close"])
        pending = "sell" if held else "buy"
    fills = result["simulationFills"]
    assert len(fills) == len(expected)
    for fill, check in zip(fills, expected):
        assert (fill["occurredAt"][:10], fill["side"], Decimal(fill["quantity"]), Decimal(fill["price"])) == check
        assert all(Decimal(charge["amount"]) == 0 for charge in fill["charges"])
    for point in result["equityCurve"]:
        date = point["occurredAt"][:10]
        latest = max(value_date for value_date in values if value_date <= date)
        assert Decimal(point["value"]["amount"]) == values[latest]
    final = values[active[-1]["occurredAt"][:10]]
    total_return = (final / initial - 1).quantize(Decimal("1e-20"), rounding=ROUND_HALF_UP)
    assert Decimal(result["metrics"]["totalReturn"]["value"]) == total_return
    assert result["benchmark"]["totalReturn"]["status"] == "unavailable"
    print(json.dumps({"runId": data["runId"], "resultChecksum": data["resultChecksum"], "fillCount": len(fills),
        "firstRawDate": bars[0]["occurredAt"][:10], "lastRawDate": bars[-1]["occurredAt"][:10],
        "finalCash": str(cash), "finalQuantity": str(held), "finalEquity": str(final), "totalReturn": str(total_return),
        "equityPointsChecked": len(result["equityCurve"]), "phaseAndPriceLimitsChecked": True,
        "postDelistingPricesAbsent": None if listing else True, "benchmarkRemainsUnavailable": True}, ensure_ascii=False))
