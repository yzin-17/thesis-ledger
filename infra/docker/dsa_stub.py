"""ThesisLedger Contract V1 的确定性开发桩。"""

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException

app = FastAPI(title="ThesisLedger DSA Contract Stub", version="1.0.0")
router = APIRouter(prefix="/api/v1/thesis-ledger", tags=["ThesisLedger Contract"])

PRICES = {
    "600519.SH": 1488.0,
    "510300.SH": 4.08,
    "000001.SZ": 11.68,
}


def require_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("THESIS_LEDGER_DSA_TOKEN", "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail={"contractVersion": 1, "code": "service_misconfigured", "message": "DSA token 未配置"},
        )
    if authorization != f"Bearer {expected}":
        raise HTTPException(
            status_code=401,
            detail={"contractVersion": 1, "code": "unauthorized", "message": "需要有效的 DSA Bearer Token"},
        )


def fixture_price(symbol: str) -> float:
    if symbol not in PRICES:
        raise HTTPException(
            status_code=404,
            detail={"contractVersion": 1, "code": "fixture_not_found", "message": "fixture not found"},
        )
    return PRICES[symbol]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "mode": "contract-stub"}


@router.get("/capabilities", dependencies=[Depends(require_token)])
def capabilities() -> dict[str, object]:
    return {
        "contractVersion": 1,
        "provider": "dsa-fork",
        "fixtureMode": True,
        "capabilities": {
            "quote": True,
            "bars": {"timeframes": ["1d"]},
            "indicators": {"names": ["MA", "MACD", "RSI"], "timeframes": ["1d"]},
            "chip": {"summary": True, "distribution": True},
        },
        "unsupported": ["bars:1m", "indicator:ATR"],
    }


@router.get("/market/quote", dependencies=[Depends(require_token)])
def quote(symbol: str) -> dict[str, object]:
    now = datetime(2025, 1, 10, 7, 0, tzinfo=timezone.utc).isoformat()
    price = fixture_price(symbol)
    return {
        "version": 1,
        "symbol": symbol,
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
        "provider": "dsa-fork",
    }


@router.get("/market/bars", dependencies=[Depends(require_token)])
def bars(symbol: str, timeframe: str = "1d", limit: int = 60) -> list[dict[str, object]]:
    if timeframe != "1d":
        raise HTTPException(
            status_code=422,
            detail={"contractVersion": 1, "code": "unsupported_capability", "message": "只支持 1d bars"},
        )
    price = fixture_price(symbol)
    end = datetime(2025, 1, 10, 7, 0, tzinfo=timezone.utc)
    result = []
    for index in range(min(max(limit, 1), 365)):
        close = round(price * (0.88 + index * 0.002), 4)
        volume = 100000 + index * 1000
        result.append(
            {
                "version": 1,
                "symbol": symbol,
                "timeframe": "1d",
                "timestamp": (end - timedelta(days=min(max(limit, 1), 60) - 1 - index)).isoformat(),
                "open": round(close * 0.998, 4),
                "high": round(close * 1.005, 4),
                "low": round(close * 0.995, 4),
                "close": close,
                "volume": volume,
                "amount": round(close * volume, 4),
                "provider": "dsa-fork",
            }
        )
    return result


@router.get("/market/indicators/{name}", dependencies=[Depends(require_token)])
def indicator(name: str, symbol: str, timeframe: str = "1d") -> dict[str, object]:
    if timeframe != "1d" or name.upper() == "ATR":
        raise HTTPException(
            status_code=422,
            detail={"contractVersion": 1, "code": "unsupported_capability", "message": "指标不可用"},
        )
    price = fixture_price(symbol)
    normalized = name.upper()
    values = {
        "MA": {"ma5": round(price * 0.99, 4), "ma10": round(price * 0.985, 4)},
        "MACD": {"dif": 1.2, "dea": 0.8, "histogram": 0.8},
        "RSI": {"rsi14": 56.4},
    }
    if normalized not in values:
        raise HTTPException(
            status_code=422,
            detail={"contractVersion": 1, "code": "unsupported_capability", "message": "指标不可用"},
        )
    calculated_at = datetime(2025, 1, 10, 7, 0, tzinfo=timezone.utc).isoformat()
    return {
        "version": 1,
        "symbol": symbol,
        "name": normalized,
        "parameters": {"period": 14 if normalized == "RSI" else 5},
        "timeframe": "1d",
        "marketTime": calculated_at,
        "calculatedAt": calculated_at,
        "values": values[normalized],
        "provider": "dsa-fork",
        "engineVersion": "dsa-thesis-ledger-fixture-v1",
    }


@router.get("/market/chip", dependencies=[Depends(require_token)])
def chip(symbol: str) -> dict[str, object]:
    price = fixture_price(symbol)
    calculated_at = datetime(2025, 1, 10, 7, 0, tzinfo=timezone.utc).isoformat()
    return {
        "version": 1,
        "symbol": symbol,
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
        "provider": "dsa-fork",
        "engineVersion": "dsa-thesis-ledger-fixture-v1",
        "calculatedAt": calculated_at,
    }


app.include_router(router)
