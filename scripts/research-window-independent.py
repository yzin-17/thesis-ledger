"""用 Python Decimal 独立核对冻结研究数据；不读取网络或调用产品计算器。"""

import json
import sys
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP, localcontext
from pathlib import Path


def charges(table, side, turnover):
    assert table["currency"] == "CNY"
    assert table["collection"] == "perFillPerCharge"
    assert table["rounding"] == {"mode": "halfUp", "decimalPlaces": 2}
    amounts = []
    for key in ["commission", "stampDuty", "transferFee", "regulatoryFee", "handlingFee"]:
        item = table[key]
        if item["treatment"] != "charged":
            assert item["treatment"] in ["includedInCommission", "notApplicable"]
            continue
        if item["side"] not in [side, "both"]:
            continue
        assert item["currency"] == "CNY" and item["basis"] == "turnover"
        amount = turnover * Decimal(item["rate"])
        if item["minimum"]["kind"] == "amount":
            amount = max(amount, Decimal(item["minimum"]["amount"]))
        else:
            assert item["minimum"]["kind"] == "none"
        amounts.append(amount.quantize(Decimal(".01"), rounding=ROUND_HALF_UP))
    return amounts


def net_return(final, initial):
    return (final / initial - 1).quantize(Decimal("1e-20"), rounding=ROUND_HALF_UP)


def verify_strategy(data, table, bars, expected_equity_count=34):
    result = data["result"]
    config = data["inputs"]["runConfig"]
    strategy = data["inputs"]["strategy"]
    initial = Decimal(config["initialCash"]["CNY"])
    cash, held, total_fees = initial, Decimal(0), Decimal(0)
    fills = sorted(result["simulationFills"], key=lambda fill: fill["occurredAt"])
    cursor, cash_ledger, equity_checks = 0, [], []
    assert len(result["equityCurve"]) == len(bars) == expected_equity_count
    assert strategy["sizing"]["type"] == "fixedAmount"
    assert strategy["cost"]["slippageRate"] == "0"
    assert not result["rejectedOrders"]
    for bar, point in zip(bars, result["equityCurve"]):
        date = bar["occurredAt"][:10]
        assert point["occurredAt"][:10] == date
        while cursor < len(fills) and fills[cursor]["occurredAt"][:10] == date:
            fill = fills[cursor]
            quantity, price = Decimal(fill["quantity"]), Decimal(fill["price"])
            assert fill["executionSymbol"] == strategy["executionInstrument"]["symbol"]
            assert price == Decimal(bar["open"])
            assert fill["occurredAt"] <= point["occurredAt"]
            gross = quantity * price
            fee_parts = charges(table, fill["side"], gross)
            assert [Decimal(item["amount"]) for item in fill["charges"]] == fee_parts
            assert all(item["currency"] == "CNY" for item in fill["charges"])
            fee = sum(fee_parts, Decimal(0))
            if fill["side"] == "buy":
                requested = Decimal(strategy["sizing"]["amount"]) / price
                assert quantity == requested.quantize(Decimal("1e-40"), rounding=ROUND_HALF_UP)
                assert held == 0
                cash -= gross + fee
                held += quantity
            else:
                assert fill["side"] == "sell" and quantity == held
                cash += gross - fee
                held -= quantity
            assert cash >= 0 and held >= 0
            total_fees += fee
            cash_ledger.append({
                "fillId": fill["fillId"], "date": date, "side": fill["side"],
                "quantity": str(quantity), "price": str(price), "gross": str(gross),
                "charges": [str(value) for value in fee_parts],
                "cash": str(cash), "heldQuantity": str(held),
            })
            cursor += 1
        equity = cash + held * Decimal(bar["close"])
        assert point["value"]["currency"] == "CNY"
        assert equity == Decimal(point["value"]["amount"]), (date, equity, point)
        equity_checks.append({"date": date, "cash": str(cash), "heldQuantity": str(held), "equity": str(equity)})
    assert cursor == len(fills)
    final = cash + held * Decimal(bars[-1]["close"])
    returned = net_return(final, initial)
    assert returned == Decimal(result["metrics"]["totalReturn"]["value"])
    return {
        "initialCash": str(initial), "fillCount": cursor, "totalFees": str(total_fees),
        "finalCash": str(cash), "finalQuantity": str(held),
        "finalMarkPrice": bars[-1]["close"], "finalEquity": str(final),
        "netReturn": str(returned), "cashLedger": cash_ledger, "equityChecks": equity_checks,
    }


def verify_benchmark(data, table, bars, strategy_return):
    initial = Decimal(data["inputs"]["runConfig"]["initialCash"]["CNY"])
    buy_price, sell_price = Decimal(bars[0]["close"]), Decimal(bars[-1]["close"])
    unit = Decimal("1e-40")

    def debit(quantity):
        gross = quantity * buy_price
        return gross + sum(charges(table, "buy", gross), Decimal(0))

    low, high = 0, int((initial / buy_price / unit).to_integral_value(rounding=ROUND_FLOOR))
    while low < high:
        middle = (low + high + 1) // 2
        if debit(Decimal(middle) * unit) <= initial:
            low = middle
        else:
            high = middle - 1
    quantity = Decimal(low) * unit
    assert quantity > 0 and debit(quantity) <= initial < debit(quantity + unit)
    buy_gross, sell_gross = quantity * buy_price, quantity * sell_price
    buy_fees = sum(charges(table, "buy", buy_gross), Decimal(0))
    sell_fees = sum(charges(table, "sell", sell_gross), Decimal(0))
    residual = initial - buy_gross - buy_fees
    final = residual + sell_gross - sell_fees
    returned = net_return(final, initial)
    difference = strategy_return - returned
    result = data["result"]
    assert returned == Decimal(result["benchmark"]["totalReturn"]["value"])
    assert difference == Decimal(result["benchmark"]["excessReturn"]["value"])
    assert result["benchmarkCompatibility"]["status"] == "compatible"
    assert data["benchmarkCostVersion"] == "execution-model-cost-v1"
    return {
        "firstDate": bars[0]["occurredAt"][:10], "lastDate": bars[-1]["occurredAt"][:10],
        "buyPrice": str(buy_price), "sellPrice": str(sell_price), "quantity": str(quantity),
        "buyGross": str(buy_gross), "buyFees": str(buy_fees), "residualCash": str(residual),
        "sellGross": str(sell_gross), "sellFees": str(sell_fees), "finalCash": str(final),
        "netReturn": str(returned), "netReturnDifference": str(difference),
        "nextQuantityUnaffordable": True,
    }


def main(path, expected_equity_count=34):
    data = json.loads(Path(path).read_text())
    assert data["networkCalls"] == 0 and data["identicalReplay"] and data["replayCount"] == 2
    config = data["inputs"]["runConfig"]
    model = data["inputs"]["executionModel"]
    assert model == config["executionModel"]
    assert len(model["segments"]) == 1
    assert data["inputs"]["publicFees"]["disclosure"]["status"] == "executionModel"
    segment = model["segments"][0]
    assert segment["range"] == {"start": config["startDate"], "end": config["endDate"]}
    table = segment["fees"]
    assert table["commission"]["rate"] == "0.0003"
    assert table["commission"]["minimum"] == {"kind": "amount", "amount": "5"}
    assert table["stampDuty"]["rate"] == "0.0005" and table["stampDuty"]["side"] == "sell"
    assert table["transferFee"]["rate"] == "0.00001"
    bars = sorted((bar for bar in data["inputs"]["bars"] if config["startDate"] <= bar["occurredAt"][:10] <= config["endDate"]), key=lambda bar: bar["occurredAt"])
    with localcontext() as context:
        context.prec = 180
        strategy = verify_strategy(data, table, bars, expected_equity_count)
        benchmark = verify_benchmark(data, table, bars, Decimal(strategy["netReturn"]))
    print(json.dumps({
        "runId": data["runId"], "snapshotId": data["snapshotId"],
        "resultChecksum": data["resultChecksum"], "independentDecimalCheck": True,
        "allFillChargesExact": True, "allDailyEquitiesExact": True,
        "equityDatesChecked": len(bars), "strategy": strategy, "benchmark": benchmark,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    count = next((int(value.split("=", 1)[1]) for value in sys.argv[2:] if value.startswith("--equity-count=")), 34)
    assert count > 0
    main(sys.argv[1], count)
