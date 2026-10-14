"""只读已捕获原始价格，复用 DSA 生产日历、单位和公告读取器。"""

import json
import sys
from datetime import date, datetime
from hashlib import sha256
from decimal import Decimal, ROUND_FLOOR
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

from src.services.thesis_ledger_dependency_facts import calendar_fact, instrument_facts_response
from src.services.thesis_ledger_market_daily_tradability import market_daily_tradability
from src.services.thesis_ledger_notice_dividends import OfficialNoticeDividendProvider
from src.services.thesis_ledger_research_calendar import research_market_coverage_context

mode, clock, start, end = sys.argv[1:5]
cutoff = datetime.fromisoformat(clock.replace("Z", "+00:00"))
if mode == "calendar":
    result = calendar_fact(date.fromisoformat(start), date.fromisoformat(end), cutoff)
elif mode == "instrument":
    result = instrument_facts_response("510300.SH", cutoff, start, end, start, end, [], instrument_type="ETF", identity_only=True)
elif mode == "notice":
    result = OfficialNoticeDividendProvider().read("510300.SH", start, end, clock)
elif mode == "bars":
    path = Path(sys.argv[5])
    captured = json.loads(path.read_text())
    raw = path.with_suffix(".raw").read_bytes()
    digest = sha256(raw).hexdigest()
    if digest != captured["metadata"]["sha256"]:
        raise ValueError("捕获价格原字节摘要不符")
    rows = [row for row in captured["rows"] if start <= row[0] <= end]
    request = {
        "symbol": "510300.SH", "start": start, "end": end,
        "tradabilityMode": "assume-untradable-no-bar",
        "routeKey": {"kind": "bar", "market": "CN", "assetType": "ETF", "capability": "DAILY_BAR", "timeframe": "1d", "adjustment": "none"},
        "routeTarget": {"providerId": "tencent", "upstreamSource": "tencent", "routeIndex": 0},
    }
    context = research_market_coverage_context(request, observed_at=cutoff)
    if context is None:
        raise ValueError("真实日历不可用")
    # 成交量和金额保留供应商值；本验收不使用它们定价、限流或证明单位。
    frame = pd.DataFrame([{"date": row[0], "open": float(row[1]), "close": float(row[2]), "high": float(row[3]), "low": float(row[4]), "volume": float(row[5]), "amount": float(row[8])} for row in rows])
    observation = SimpleNamespace(value=frame, provider="tencent", upstream_source="tencent", provider_revision=f"captured-raw-sha256:{digest}")
    windows = market_daily_tradability(request, observation, context, [row[0] for row in rows], clock)
    result = {"rows": rows, "metadata": captured["metadata"], "context": context, "historicalTradabilityWindows": windows}
elif mode == "verify":
    path = Path(sys.argv[5])
    captured = json.loads(path.read_text())
    result_file = json.loads(Path(sys.argv[6]).read_text())
    outcome = result_file["result"]
    rows = captured["rows"]
    first_fill = next(row for row in rows if row[0] > result_file["runConfig"]["startDate"])
    quantity = (Decimal("50000") / Decimal(first_fill[1]) / 100).to_integral_value(rounding=ROUND_FLOOR) * 100
    spent = quantity * Decimal(first_fill[1])
    cash = Decimal("100000") - spent
    gross = quantity * Decimal("0.6400") / 10
    record = outcome["cashDividendDisclosure"]["records"][0]
    assert Decimal(record["eligibleQuantity"]) == quantity
    assert Decimal(record["grossCashAmount"]) == gross
    by_day = {row[0]: row for row in rows}
    for point in outcome["equityCurve"]:
        day = point["occurredAt"][:10]
        expected = Decimal("100000") if day < first_fill[0] else cash + quantity * Decimal(by_day[day][2])
        if day >= "2023-01-16":
            expected += gross
        assert Decimal(point["value"]["amount"]) == expected, (day, expected, point)
    final = Decimal(outcome["equityCurve"][-1]["value"]["amount"])
    assert Decimal(outcome["metrics"]["totalReturn"]["value"]) == final / Decimal("100000") - 1
    result = {"method": "独立 Python Decimal：原价下一交易日开盘、整手向下取整、公告每十份转每份、逐日权益与收益", "quantity": str(quantity), "fillPrice": first_fill[1], "spent": str(spent), "cashBeforePayment": str(cash), "grossCash": str(gross), "cashAfterPayment": str(cash + gross), "finalEquity": str(final), "allEquityPointsMatch": True}
else:
    raise ValueError("未知只读输入模式")
if result is None:
    raise ValueError("生产读取器没有返回事实")
print(json.dumps(result, ensure_ascii=False, allow_nan=False))
