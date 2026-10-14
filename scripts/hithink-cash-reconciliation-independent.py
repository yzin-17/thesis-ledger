"""独立公告对账：仅核对指定事件和窗口，来源空窗不证明历史无遗漏。"""

from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

# 数值与日期来自本轮重新核对的发行人/交易所公告，而非适配器的状态映射。
EXPECTED = {
    "510300.SH": [("1.23", "2026-01-12", "2026-01-16", "2026-01-19", "2026-01-27"),
                    ("0.88", "2025-06-11", "2025-06-17", "2025-06-18", "2025-06-27")],
    "510050.SH": [("0.8", "2025-12-10", "2025-12-16", "2025-12-17", "2025-12-22"),
                    ("0.55", "2024-11-25", "2024-11-29", "2024-12-02", "2024-12-05")],
    "510880.SH": [("1.43", "2026-01-16", "2026-01-20", "2026-01-21", "2026-01-26")],
}


def main(path):
    capture = json.loads(Path(path).read_text())
    output = []
    for sample in capture["rows"]:
        assert "response" in sample, sample.get("error")
        request, response = sample["request"], sample["response"]
        assessment = response["assessment"]
        assert assessment["responseComplete"] and not assessment["historicalCoverageVerified"]
        assert response["coverage"]["complete"] is False
        business = assessment["rawBusinessResponse"]
        assert hashlib.sha256(business.encode()).hexdigest() == response["source"]["responseSha256"]
        items = json.loads(business, parse_float=Decimal)["data"]["item"]
        assert assessment["rawItemCount"] == len(items)
        records = response["records"]
        expected = EXPECTED[request["symbol"]]
        assert len(records) == len(expected), (request["symbol"], "窗口事件数量变化", len(records), len(expected))
        for value, announcement, record_day, effective, payment in expected:
            row = next(row for row in records if row["effectiveDate"] == effective)
            assert (row["announcementDate"], row["recordDate"], row["paymentDate"]) == (announcement, record_day, payment)
            assert Decimal(row["amountPerFundUnit"]) == Decimal(value) / 10
            assert Decimal(row["sourceAmount"]["value"]) == Decimal(value)
            assert row["sourceAmount"]["unit"] == "per-ten-fund-units"
            assert row["currency"] == "CNY" and row["normalizedStatus"] == "unknown" and row["sourceStatus"] == "2"
            assert row["statusBasis"] == "event-reconciled" and row["reconciliationReference"]
        total = sum((Decimal(row["amountPerFundUnit"]) for row in records), Decimal(0))
        assert total == sum((Decimal(event[0]) / 10 for event in expected), Decimal(0))
        output.append({"symbol": request["symbol"], "window": [request["start"], request["end"]],
                       "events": len(records), "totalPerFundUnit": str(total), "differences": 0,
                       "responseSha256": response["source"]["responseSha256"]})
        if request["symbol"] == "510300.SH":
            def day(value):
                return datetime.fromtimestamp(value / 1000, timezone.utc).astimezone(ZoneInfo("Asia/Shanghai")).date().isoformat()
            empty = [item for item in items if item.get("ex_dividend_date_ms") is not None
                     and "2025-07-01" <= day(item["ex_dividend_date_ms"]) <= "2025-08-31"]
            assert not empty
            output.append({"symbol": request["symbol"], "window": ["2025-07-01", "2025-08-31"],
                           "sourceEvents": 0, "historicalCoverageVerified": False,
                           "basis": "同次完整业务响应的独立空窗过滤，不证明全历史无遗漏"})
    assert capture["businessRequests"] == 3
    print(json.dumps({"verifiedEvents": 5, "windows": output, "businessRequests": 3}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
