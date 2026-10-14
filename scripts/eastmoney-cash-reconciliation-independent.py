"""独立解析已取得HTML，复用已核对公告事实；不调用生产适配器或供应商。"""

from decimal import Decimal
from html.parser import HTMLParser
from hashlib import sha256
from pathlib import Path
import json
import re
import runpy
import sys

EXPECTED = runpy.run_path(str(Path(__file__).with_name("hithink-cash-reconciliation-independent.py")))["EXPECTED"]


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables, self.table, self.row, self.cell = [], None, None, None

    def handle_starttag(self, tag, attrs):
        if tag == "table": self.table = []
        elif tag == "tr" and self.table is not None: self.row = []
        elif tag in {"td", "th"} and self.row is not None: self.cell = ""

    def handle_data(self, data):
        if self.cell is not None: self.cell += data

    def handle_endtag(self, tag):
        if tag in {"td", "th"} and self.cell is not None:
            self.row.append(self.cell.strip()); self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row: self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.tables.append(self.table); self.table = None


def main(path):
    capture = json.loads(Path(path).read_text())
    results = []
    for sample in capture["rows"]:
        assert "response" in sample, sample.get("error")
        req, response = sample["request"], sample["response"]
        body = response["assessment"]["rawBusinessResponse"]
        assert sha256(body.encode()).hexdigest() == response["source"]["responseSha256"]
        parser = Tables(); parser.feed(body)
        tables = [rows for rows in parser.tables if rows[0] == ["年份", "权益登记日", "除息日", "每10份分红", "分红发放日"]]
        assert len(tables) == 1
        rows = tables[0][1:]
        assert response["assessment"]["rawItemCount"] == len(rows)
        assert sum(response["assessment"]["counts"].values()) == len(rows)
        assert response["assessment"]["responseComplete"] and not response["coverage"]["complete"]
        selected = [row for row in rows if len(row) == 5 and req["start"] <= row[2] <= req["end"]]
        expected = EXPECTED[req["symbol"]]
        assert len(selected) == len(expected) == len(response["records"])
        for amount, announcement, registered, effective, paid in expected:
            raw = next(row for row in selected if row[2] == effective)
            parsed = next(row for row in response["records"] if row["effectiveDate"] == effective)
            assert (raw[1], raw[4]) == (registered, paid)
            assert Decimal(re.fullmatch(r"每10份派现金([0-9.]+)元", raw[3])[1]) == Decimal(amount)
            assert Decimal(parsed["amountPerFundUnit"]) == Decimal(amount) / 10
            assert (parsed["recordDate"], parsed["paymentDate"]) == (registered, paid)
            assert parsed["sourceAmount"]["unit"] == "per-ten-fund-units"
            assert Decimal(parsed["sourceAmount"]["value"]) == Decimal(amount)
            assert parsed["announcementDate"] is None and parsed["sourceStatus"] is None
            assert parsed["normalizedStatus"] == "unknown" and parsed["statusBasis"] == "event-reconciled"
        total = sum((Decimal(row["amountPerFundUnit"]) for row in response["records"]), Decimal(0))
        assert total == sum((Decimal(row[0]) / 10 for row in expected), Decimal(0))
        results.append({"symbol": req["symbol"], "events": len(expected), "totalPerFundUnit": str(total),
                        "amountAndCashDateDifferences": 0, "missingAnnouncementDates": len(expected),
                        "sourceStatusMissing": len(expected), "rawRows": len(rows),
                        "responseSha256": response["source"]["responseSha256"]})
        if req["symbol"] == "510300.SH":
            assert not [row for row in rows if len(row) == 5 and "2025-07-01" <= row[2] <= "2025-08-31"]
            results.append({"symbol": req["symbol"], "sourceEmptyWindow": ["2025-07-01", "2025-08-31"],
                            "sourceEvents": 0, "historicalCoverageVerified": False})
    assert capture["businessRequests"] == 3
    print(json.dumps({"businessRequests": 3, "verifiedEvents": 5, "results": results}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
