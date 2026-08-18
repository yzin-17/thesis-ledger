"""ThesisLedger Contract V1 的确定性开发桩。"""

import hashlib
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException

app = FastAPI(title="ThesisLedger DSA Contract Stub", version="1.0.0")
router = APIRouter(prefix="/api/v1/thesis-ledger", tags=["ThesisLedger Contract"])

PRICES = {
    "600519.SH": 1488.0,
    "510300.SH": 4.08,
    "000001.SZ": 11.68,
}

CONTROL_PROVIDERS = {
    "akshare": {
        "providerId": "akshare",
        "displayName": "AkShare",
        "version": 1,
        "requiresCredential": False,
        "capabilities": {
            "REALTIME_QUOTE": ["STOCK", "ETF"],
            "DAILY_BAR": ["STOCK", "ETF"],
            "FUND_NAV": ["MUTUAL_FUND"],
            "FUND_NAV_HISTORY": ["MUTUAL_FUND"],
        },
    },
    "efinance": {
        "providerId": "efinance",
        "displayName": "efinance",
        "version": 1,
        "requiresCredential": False,
        "capabilities": {
            "REALTIME_QUOTE": ["STOCK", "ETF"],
            "DAILY_BAR": ["STOCK", "ETF"],
            "FUND_NAV": ["MUTUAL_FUND"],
            "FUND_NAV_HISTORY": ["MUTUAL_FUND"],
        },
    },
}
CONTROL_CONFIGS: dict[str, dict[str, object]] = {}
CONTROL_POLICY: dict[str, object] = {
    "contractVersion": 1,
    "consumer": "thesis-ledger",
    "revision": 1,
    "sourceDesiredRevision": 1,
    "enabled": True,
    "routes": {
        "REALTIME_QUOTE": {"STOCK": ["akshare", "efinance"], "ETF": ["akshare", "efinance"]},
        "DAILY_BAR": {"STOCK": ["akshare", "efinance"], "ETF": ["akshare", "efinance"]},
        "FUND_NAV": {"MUTUAL_FUND": ["akshare", "efinance"]},
        "FUND_NAV_HISTORY": {"MUTUAL_FUND": ["akshare", "efinance"]},
    },
    "routeStatus": {},
    "appliedAt": "2025-01-10T07:00:00+00:00",
}
CONTROL_CATALOG = [
    {"canonicalCode": "000001", "instrumentType": "STOCK", "market": "SZ", "displayName": "平安银行"},
    {"canonicalCode": "510300", "instrumentType": "ETF", "market": "SH", "displayName": "沪深300ETF"},
    {"canonicalCode": "000001", "instrumentType": "MUTUAL_FUND", "market": "OF", "displayName": "华夏成长混合"},
]


def catalog_checksum() -> str:
    normalized = sorted(CONTROL_CATALOG, key=lambda item: (item["canonicalCode"], item["market"], item["instrumentType"]))
    payload = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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


def require_control_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("THESIS_LEDGER_CONTROL_TOKEN", "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail={"contractVersion": 1, "code": "control_misconfigured", "message": "Control Token 未配置"},
        )
    if authorization != f"Bearer {expected}":
        raise HTTPException(
            status_code=401,
            detail={"contractVersion": 1, "code": "unauthorized", "message": "需要有效的 Control Bearer Token"},
        )


def validate_control_envelope(payload: dict[str, object]) -> str:
    if payload.get("contractVersion") != 1 or payload.get("consumer") != "thesis-ledger":
        raise HTTPException(
            status_code=422,
            detail={"contractVersion": 1, "code": "invalid_control_envelope", "message": "Control Envelope 无效"},
        )
    return str(payload.get("requestId") or uuid.uuid4())


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
        "provider": "akshare",
        "fixtureMode": True,
        "capabilities": {
            "quote": True,
            "fund-nav": {"assetSuffix": ".OF", "freshness": ["delayed", "stale"]},
            "fund-nav-history": {"assetSuffix": ".OF", "maxLimit": 3650},
            "bars": {"timeframes": ["1d"]},
            "indicators": {"names": ["MA", "MACD", "RSI"], "timeframes": ["1d"]},
            "chip": {"summary": True, "distribution": True},
        },
        "unsupported": ["bars:1m", "indicator:ATR"],
    }


@router.post("/control/handshake", dependencies=[Depends(require_control_token)])
def control_handshake(payload: dict[str, object]) -> dict[str, object]:
    request_id = validate_control_envelope(payload)
    return {
        "contractVersion": 1,
        "consumer": "thesis-ledger",
        "accepted": True,
        "supportedVersions": [1],
        "requestId": request_id,
        "diagnosticId": request_id,
    }


@router.get("/control/providers", dependencies=[Depends(require_control_token)])
def control_providers() -> dict[str, object]:
    return {
        "contractVersion": 1,
        "providers": [
            {
                **manifest,
                "configured": True,
                "enabled": CONTROL_CONFIGS.get(provider_id, {}).get("enabled", True),
                "credentialConfigured": bool(
                    CONTROL_CONFIGS.get(provider_id, {}).get("credentialConfigured", False)
                ),
                "updatedAt": None,
            }
            for provider_id, manifest in CONTROL_PROVIDERS.items()
        ],
    }


@router.post("/control/providers/{provider_id}/config", dependencies=[Depends(require_control_token)])
def control_provider_config(provider_id: str, payload: dict[str, object]) -> dict[str, object]:
    request_id = validate_control_envelope(payload)
    if provider_id not in CONTROL_PROVIDERS:
        raise HTTPException(status_code=404, detail={"contractVersion": 1, "code": "unknown_provider", "message": "Provider 不存在"})
    existing = CONTROL_CONFIGS.get(provider_id, {})
    credential = payload.get("credential")
    next_config = {
        "enabled": payload.get("enabled", existing.get("enabled", True)),
        "credentialConfigured": bool(credential) or (provider_id in CONTROL_CONFIGS and payload.get("clearCredentials") is not True),
    }
    CONTROL_CONFIGS[provider_id] = next_config
    return {
        "contractVersion": 1,
        "providerId": provider_id,
        "configured": True,
        "enabled": bool(next_config["enabled"]),
        "credentialConfigured": bool(next_config["credentialConfigured"]),
        "requestId": request_id,
    }


@router.post("/control/providers/{provider_id}/test", dependencies=[Depends(require_control_token)])
def control_provider_test(provider_id: str, payload: dict[str, object]) -> dict[str, object]:
    request_id = validate_control_envelope(payload)
    if provider_id not in CONTROL_PROVIDERS:
        raise HTTPException(status_code=404, detail={"contractVersion": 1, "code": "unknown_provider", "message": "Provider 不存在"})
    configured = True
    return {
        "contractVersion": 1,
        "providerId": provider_id,
        "status": "healthy" if configured else "unconfigured",
        "readOnly": True,
        "requestId": request_id,
        "capabilities": {
            capability: {"status": "healthy" if configured else "unconfigured", "attempted": False}
            for capability in CONTROL_PROVIDERS[provider_id]["capabilities"]
        },
    }


@router.post("/control/providers/{provider_id}/remove", dependencies=[Depends(require_control_token)])
def control_provider_remove(provider_id: str, payload: dict[str, object]) -> dict[str, object]:
    request_id = validate_control_envelope(payload)
    if provider_id not in CONTROL_PROVIDERS:
        raise HTTPException(status_code=404, detail={"contractVersion": 1, "code": "unknown_provider", "message": "Provider 不存在"})
    CONTROL_CONFIGS[provider_id] = {"enabled": False, "credentialConfigured": False}
    return {
        "contractVersion": 1,
        "consumer": "thesis-ledger",
        "providerId": provider_id,
        "removed": True,
        "tombstone": {"providerId": provider_id, "displayName": CONTROL_PROVIDERS[provider_id]["displayName"], "reason": payload.get("reason", "removed_by_consumer")},
        "requestId": request_id,
    }


@router.post("/control/policies/apply", dependencies=[Depends(require_control_token)])
def control_apply_policy(payload: dict[str, object]) -> dict[str, object]:
    request_id = validate_control_envelope(payload)
    revision = payload.get("revision")
    if not isinstance(revision, int) or revision <= 0:
        raise HTTPException(status_code=422, detail={"contractVersion": 1, "code": "invalid_revision", "message": "revision 无效"})
    if revision < int(CONTROL_POLICY["revision"]):
        raise HTTPException(status_code=409, detail={"contractVersion": 1, "code": "stale_revision", "message": "revision 已过期"})
    CONTROL_POLICY.update(
        {
            "revision": revision,
            "sourceDesiredRevision": revision,
            "enabled": bool(payload.get("enabled", True)),
            "routes": payload.get("routes", {}),
            "appliedAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"contractVersion": 1, "status": "applied", "effective": {**CONTROL_POLICY, "requestId": request_id}}


@router.get("/control/policies/effective", dependencies=[Depends(require_control_token)])
def control_effective_policy() -> dict[str, object]:
    return {"effective": CONTROL_POLICY}


@router.get("/catalog/snapshot", dependencies=[Depends(require_token)])
def catalog_snapshot() -> dict[str, object]:
    return {
        "contractVersion": 1,
        "generation": 1,
        "checksum": catalog_checksum(),
        "cursor": "g1:0",
        "complete": True,
        "items": CONTROL_CATALOG,
    }


@router.get("/catalog/delta", dependencies=[Depends(require_token)])
def catalog_delta() -> dict[str, object]:
    return {"contractVersion": 1, "generation": 1, "checksum": catalog_checksum(), "cursor": "g1:0", "items": []}


@router.post("/control/catalog/jobs", dependencies=[Depends(require_control_token)])
def control_catalog_job(payload: dict[str, object]) -> dict[str, object]:
    request_id = validate_control_envelope(payload)
    return {
        "contractVersion": 1,
        "id": request_id,
        "status": "succeeded",
        "generation": 1,
        "checksum": catalog_checksum(),
        "requestId": request_id,
    }


@router.post("/control/catalog/ack", dependencies=[Depends(require_control_token)])
def control_catalog_ack(payload: dict[str, object]) -> dict[str, object]:
    request_id = validate_control_envelope(payload)
    return {"contractVersion": 1, "accepted": True, "generation": payload.get("generation", 1), "requestId": request_id}


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
        "provider": "akshare",
    }


def fixture_fund_nav(symbol: str, nav_date: datetime, unit_nav: float) -> dict[str, object]:
    canonical = symbol.strip().upper()
    if not canonical.endswith(".OF"):
        canonical = f"{canonical}.OF"
    return {
        "version": 1,
        "symbol": canonical,
        "unitNav": round(unit_nav, 4),
        "navDate": nav_date.isoformat(),
        "provider": "akshare",
        "fetchedAt": datetime(2025, 1, 10, 7, 0, tzinfo=timezone.utc).isoformat(),
        "freshness": "delayed",
    }


@router.get("/market/fund-nav", dependencies=[Depends(require_token)])
def fund_nav(symbol: str) -> dict[str, object]:
    return fixture_fund_nav(
        symbol,
        datetime(2025, 1, 9, 7, 0, tzinfo=timezone.utc),
        1.2345,
    )


@router.get("/market/fund-nav/history", dependencies=[Depends(require_token)])
def fund_nav_history(symbol: str, limit: int = 365) -> list[dict[str, object]]:
    count = min(max(limit, 1), 3650)
    end = datetime(2025, 1, 9, 7, 0, tzinfo=timezone.utc)
    return [
        fixture_fund_nav(symbol, end - timedelta(days=count - index - 1), 1.1 + index * 0.0005)
        for index in range(count)
    ]


@router.get("/market/bars", dependencies=[Depends(require_token)])
def bars(symbol: str, timeframe: str = "1d", limit: int = 60) -> list[dict[str, object]]:
    if timeframe != "1d":
        raise HTTPException(
            status_code=422,
            detail={"contractVersion": 1, "code": "unsupported_capability", "message": "只支持 1d bars"},
        )
    price = fixture_price(symbol)
    end = datetime(2025, 1, 10, 7, 0, tzinfo=timezone.utc)
    count = min(max(limit, 1), 365)
    result = []
    for index in range(count):
        close = round(price * (0.88 + index * 0.002), 4)
        volume = 100000 + index * 1000
        result.append(
            {
                "version": 1,
                "symbol": symbol,
                "timeframe": "1d",
                "timestamp": (end - timedelta(days=count - 1 - index)).isoformat(),
                "open": round(close * 0.998, 4),
                "high": round(close * 1.005, 4),
                "low": round(close * 0.995, 4),
                "close": close,
                "volume": volume,
                "amount": round(close * volume, 4),
                "provider": "akshare",
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
        "provider": "akshare",
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
        "provider": "akshare",
        "engineVersion": "dsa-thesis-ledger-fixture-v1",
        "calculatedAt": calculated_at,
    }


app.include_router(router)
