"""只读目标离线重放输入，独立复核 510300 实际现金分红账。"""

import json
import sys
from decimal import Decimal, ROUND_FLOOR
from pathlib import Path

capture = json.loads(Path(sys.argv[1]).read_text())
assert capture["identicalReplay"] and capture["networkCalls"] == 0
inputs = capture["inputs"]
config = inputs["runConfig"]
strategy = inputs["strategy"]
assert strategy["executionInstrument"]["symbol"] == "510300.SH"
assert config["executionPriceProtocol"]["priceBasis"]["adjustment"] == "none"
assert config["executionPriceProtocol"]["cashEventResearch"] == "ex-date-entitlement-payment-date-cash-v1"
bars = sorted(inputs["bars"], key=lambda row: row["occurredAt"])
fill = next(row for row in bars if row["occurredAt"][:10] > config["startDate"])
assert fill["occurredAt"][:10] == "2023-01-06"
quantity = (Decimal("50000") / Decimal(fill["open"]) / 100).to_integral_value(rounding=ROUND_FLOOR) * 100
spent = quantity * Decimal(fill["open"])
cash = Decimal("100000") - spent
gross = quantity * Decimal("0.6400") / 10
result = capture["result"]
record = result["cashDividendDisclosure"]["records"][0]
assert Decimal(record["eligibleQuantity"]) == quantity
assert Decimal(record["grossCashAmount"]) == gross
assert Decimal(record["amountPerFundUnit"]) == Decimal("0.064")
assert record["status"] == ("paid" if config["endDate"] >= "2023-01-19" else "receivable")
by_day = {row["occurredAt"][:10]: row for row in bars}
for point in result["equityCurve"]:
    day = point["occurredAt"][:10]
    expected = Decimal("100000")
    if day >= fill["occurredAt"][:10]:
        expected = cash + quantity * Decimal(by_day[day]["close"])
    if day >= "2023-01-16":
        expected += gross
    assert Decimal(point["value"]["amount"]) == expected, (day, expected, point)
final = Decimal(result["equityCurve"][-1]["value"]["amount"])
assert Decimal(result["metrics"]["totalReturn"]["value"]) == final / Decimal("100000") - 1
print(json.dumps({
    "runId": capture["runId"], "resultChecksum": capture["resultChecksum"],
    "quantity": str(quantity), "fillPrice": fill["open"], "spent": str(spent),
    "cashBeforePayment": str(cash), "grossCash": str(gross),
    "cashAfterPayment": str(cash + gross), "finalEquity": str(final),
    "allEquityPointsMatch": True, "cashStatus": record["status"],
}, ensure_ascii=False))
