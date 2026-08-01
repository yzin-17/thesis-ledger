"""开发契约桩。生产镜像应把该文件替换为审核后的 DSA Fork。"""

from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException

app = FastAPI(title="Investment OS DSA Contract Stub", version="0.1.0")

PRICES = {
    "600519.SH": 1488.0,
    "510300.SH": 4.08,
    "000001.SZ": 11.68,
}


def fixture_price(symbol: str) -> float:
    if symbol not in PRICES:
        raise HTTPException(status_code=404, detail="fixture not found")
    return PRICES[symbol]


@app.get("/health")
def health():
    return {"status": "healthy", "mode": "contract-stub"}


@app.get("/api/quote")
def quote(symbol: str):
    now = datetime.now(timezone.utc).isoformat()
    price = fixture_price(symbol)
    return {
        "open": price * 0.99,
        "high": price * 1.01,
        "low": price * 0.98,
        "price": price,
        "previousClose": price * 0.995,
        "volume": 100000,
        "amount": price * 100000,
        "marketTime": now,
        "fetchedAt": now,
        "freshness": "live",
        "stale": False,
    }


@app.get("/api/bars")
def bars(symbol: str, timeframe: str = "1d"):
    if timeframe not in {"1d", "1m"}:
        raise HTTPException(status_code=400, detail="unsupported timeframe")
    price = fixture_price(symbol)
    end = datetime(2025, 1, 10, 7, 0, tzinfo=timezone.utc)
    step = timedelta(days=1) if timeframe == "1d" else timedelta(minutes=1)
    result = []
    for index in range(10):
        close = round(price * (0.98 + index * 0.004), 4)
        result.append(
            {
                "timestamp": (end - step * (9 - index)).isoformat(),
                "open": round(close * 0.998, 4),
                "high": round(close * 1.005, 4),
                "low": round(close * 0.995, 4),
                "close": close,
                "volume": 100000 + index * 1000,
                "amount": round(close * (100000 + index * 1000), 4),
            }
        )
    return result


@app.get("/api/indicators/{name}")
def indicator(name: str, symbol: str):
    price = fixture_price(symbol)
    normalized = name.upper()
    values = {
        "MA": {"ma5": round(price * 0.99, 4), "ma10": round(price * 0.985, 4)},
        "MACD": {"dif": 1.2, "dea": 0.8, "histogram": 0.8},
        "RSI": {"rsi14": 56.4},
        "ATR": {"atr14": round(price * 0.018, 4)},
    }
    if normalized not in values:
        raise HTTPException(status_code=404, detail="indicator not found")
    calculated_at = datetime(2025, 1, 10, 7, 0, tzinfo=timezone.utc).isoformat()
    return {
        "parameters": {"period": 14 if normalized in {"RSI", "ATR"} else 5},
        "timeframe": "1d",
        "marketTime": calculated_at,
        "calculatedAt": calculated_at,
        "values": values[normalized],
        "engineVersion": "contract-stub-v1",
    }


@app.get("/api/chip")
def chip(symbol: str):
    price = fixture_price(symbol)
    calculated_at = datetime(2025, 1, 10, 7, 0, tzinfo=timezone.utc).isoformat()
    return {
        "buckets": [
            {"price": round(price * 0.9, 4), "weight": 0.2},
            {"price": round(price, 4), "weight": 0.5},
            {"price": round(price * 1.1, 4), "weight": 0.3},
        ],
        "averageCost": round(price * 0.99, 4),
        "mainPeak": price,
        "profitRatio": 0.58,
        "range70": [round(price * 0.92, 4), round(price * 1.06, 4)],
        "range90": [round(price * 0.88, 4), round(price * 1.12, 4)],
        "concentration": 0.32,
        "engineVersion": "contract-stub-v1",
        "calculatedAt": calculated_at,
    }
