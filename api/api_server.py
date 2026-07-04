import os
import json
import hashlib
import logging
import time
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from logging_config import setup_logging
from scraper import AuctionScraper
from risk_engine import RiskEngine
from database import init_db, save_items, get_all_items, get_last_update, set_last_update, get_item_count

setup_logging(os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# ── Redis (선택적 캐시) ──────────────────────────────────
try:
    import redis.asyncio as aioredis
    _REDIS_URL = os.environ.get("REDIS_URL", "")
    _redis: Optional[aioredis.Redis] = aioredis.from_url(_REDIS_URL) if _REDIS_URL else None
    if _redis:
        logger.info(f"Redis 캐시 활성화: {_REDIS_URL}")
except ImportError:
    _redis = None

CACHE_TTL = int(os.environ.get("CACHE_TTL_SECONDS", "300"))

# ── 인메모리 TTL 캐시 (Redis 없을 때 폴백) ─────────────────────
_mem_cache: dict[str, tuple[dict, float]] = {}  # key -> (value, expire_at)


async def _cache_get(key: str) -> Optional[dict]:
    if _redis:
        try:
            raw = await _redis.get(key)
            return json.loads(raw) if raw else None
        except Exception as e:
            logger.warning(f"Redis get 실패: {e}")
    # 인메모리 폴백
    entry = _mem_cache.get(key)
    if entry and time.time() < entry[1]:
        return entry[0]
    if key in _mem_cache:
        del _mem_cache[key]
    return None


async def _cache_set(key: str, value: dict, ttl: int = CACHE_TTL) -> None:
    if _redis:
        try:
            await _redis.setex(key, ttl, json.dumps(value, ensure_ascii=False))
            return
        except Exception as e:
            logger.warning(f"Redis set 실패: {e}")
    # 인메모리 폴백
    _mem_cache[key] = (value, time.time() + ttl)

app = FastAPI(
    title="Sentinel Alpha API",
    description="자율 경매 분석 에이전트 백엔드 API",
    version="0.1.0",
)

_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,https://your-project.web.app",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"]         = "DENY"
    return response

scraper = AuctionScraper()
risk_engine = RiskEngine()
scheduler = AsyncIOScheduler()

async def refresh_all_data():
    """매일 실행 (KST 08:00 = UTC 23:00) — DB 갱신 후 캐시 무효화"""
    logger.info("[Scheduler] 일일 데이터 갱신 시작...")
    try:
        all_items: list[dict] = []
        regions = ["서울", "부산", "대구", "인천", "울산", "광주", "대전",
                   "수원", "의정부", "창원", "청주", "전주", "천안", "순천"]
        for region in regions:
            try:
                items = await scraper.search(
                    region=region, max_price=2_000_000_000, min_price=0,
                    property_type="ALL", page=1, limit=50
                )
                all_items.extend(items)
                logger.info(f"  {region}: {len(items)}건 수집")
            except Exception as e:
                logger.warning(f"  {region} 수집 실패: {e}")

        if not all_items:
            # 스크래핑 전부 실패 → 동적 mock 저장 (날짜 갱신 목적)
            from scraper import _generate_dynamic_items
            all_items = _generate_dynamic_items()
            logger.info(f"  동적 mock 저장 ({len(all_items)}건)")

        # 중복 사건번호 제거 (case_number 기준)
        seen: set[str] = set()
        deduped = []
        for item in all_items:
            cn = item.get("case_number", "")
            if cn and cn not in seen:
                seen.add(cn)
                deduped.append(item)

        save_items(deduped)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        set_last_update(now_str)
        # 캐시 무효화
        _mem_cache.clear()
        logger.info(f"[Scheduler] 갱신 완료: {len(deduped)}건 저장, {now_str}")
    except Exception as e:
        logger.error(f"[Scheduler] 갱신 실패: {e}")


# ── 응답 모델 ─────────────────────────────────────────────────

class AuctionItem(BaseModel):
    id: str
    case_number: str
    court: str
    address: str
    property_type: str
    area: float
    minimum_bid: int
    appraisal_value: int
    auction_date: str
    description: str
    images: list[str]
    status: str
    risk_score: float = 0.0
    discount_rate: float = 0.0
    yield_rate: float = 0.0
    risk_items: list[str] = []


class SearchResponse(BaseModel):
    items: list[AuctionItem]
    total: int
    page: int
    total_pages: int
    has_more: bool


class ReportResponse(BaseModel):
    case_number: str
    address: str
    area: float
    appraisal_value: int
    minimum_bid: int
    auction_date: str
    risk_items: list[str]
    risk_score: float
    expected_profit: int
    profit_rate: float
    overall_score: int
    recommendation: str


class HealthResponse(BaseModel):
    status: str
    db: bool
    scraper: bool
    last_update: str
    version: str


# ── 엔드포인트 ────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health_check():
    scraper_alive = scraper.is_alive()
    redis_alive = False
    if _redis:
        try:
            await _redis.ping()
            redis_alive = True
        except Exception:
            pass
    
    last_update = get_last_update() or "never"
    item_count = get_item_count()
    logger.info(f"Health check: scraper={scraper_alive} redis={redis_alive} items={item_count} last_update={last_update}")
    return HealthResponse(
        status="ok",
        db=redis_alive,
        scraper=scraper_alive,
        last_update=last_update,
        version="1.1.0",
    )


@app.get("/auctions", response_model=SearchResponse)
async def search_auctions(  # noqa: PLR0913
    region: str = Query("", description="지역명 (예: 부산, 울산 남구)"),
    max_price: int = Query(500_000_000, description="최대 금액 (원)"),
    min_price: int = Query(0, description="최소 금액 (원)"),
    property_type: str = Query("ALL", description="물건 종류: APARTMENT/HOUSE/LAND/COMMERCIAL/ALL"),
    risk_filter: bool = Query(True, description="위험 물건 자동 제외 여부"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    cache_key = hashlib.md5(
        f"{region}:{max_price}:{min_price}:{property_type}:{risk_filter}:{page}:{limit}".encode()
    ).hexdigest()
    cached = await _cache_get(f"auctions:{cache_key}")
    if cached:
        logger.info(f"Cache HIT: {cache_key[:8]}")
        return SearchResponse(**cached)

    logger.info(f"Search: region={region}, max_price={max_price}, type={property_type}")

    # ── DB 우선 서빙 (최근 갱신 데이터가 있으면 DB 사용) ──────────
    db_items = get_all_items()
    last_upd = get_last_update()
    db_fresh = False
    if last_upd:
        try:
            upd_dt = datetime.strptime(last_upd, "%Y-%m-%d %H:%M:%S")
            db_fresh = (datetime.now() - upd_dt).total_seconds() < 86400  # 24시간 이내
        except Exception:
            pass

    if db_items and db_fresh:
        raw_items = db_items
        logger.info(f"DB 서빙: {len(raw_items)}건 (최근갱신: {last_upd})")
    else:
        raw_items = await scraper.search(
            region=region,
            max_price=max_price,
            min_price=min_price,
            property_type=property_type,
            page=page,
            limit=limit,
        )

    # ── 지역/타입/가격 필터 (DB 서빙 시 서버사이드 필터) ─────────
    if db_items and db_fresh:
        def _matches(item: dict) -> bool:
            addr = item.get("address", "")
            if region and region not in addr:
                return False
            pt = item.get("property_type", "ALL")
            if property_type != "ALL" and pt != property_type:
                return False
            bid = item.get("minimum_bid", 0)
            if not (min_price <= bid <= max_price):
                return False
            return True
        raw_items = [i for i in raw_items if _matches(i)]
        start = (page - 1) * limit
        raw_items = raw_items[start: start + limit]

    enriched = []
    for item in raw_items:
        risk_result = risk_engine.analyze(item)
        item["risk_score"] = risk_result["score"]
        item["risk_items"] = risk_result["items"]

        appraisal = item.get("appraisal_value", 0)
        min_bid = item.get("minimum_bid", 0)
        item["discount_rate"] = round((1 - min_bid / appraisal) * 100, 1) if appraisal > 0 else 0.0
        item["yield_rate"] = round(((appraisal - min_bid) / min_bid) * 100, 1) if min_bid > 0 else 0.0

        if risk_filter and risk_result["score"] >= 70:
            continue
        enriched.append(AuctionItem(**item))

    total = len(enriched)
    result = SearchResponse(
        items=enriched,
        total=total,
        page=page,
        total_pages=max(1, (total + limit - 1) // limit),
        has_more=total > page * limit,
    )
    await _cache_set(f"auctions:{cache_key}", result.model_dump())
    return result


@app.get("/report/{case_number}", response_model=ReportResponse)
async def get_report(case_number: str):
    logger.info(f"Report requested: {case_number}")

    item = await scraper.get_by_case_number(case_number)
    if not item:
        raise HTTPException(status_code=404, detail=f"사건번호 {case_number}를 찾을 수 없습니다.")

    risk_result = risk_engine.analyze(item)

    appraisal = item.get("appraisal_value", 0)
    min_bid = item.get("minimum_bid", 0)
    expected_profit = appraisal - min_bid
    profit_rate = round((expected_profit / min_bid) * 100, 1) if min_bid > 0 else 0.0

    risk_score = risk_result["score"]
    if risk_score < 30 and profit_rate > 15:
        overall_score = 90
        recommendation = "우량 투자 기회 — 즉시 검토 권장"
    elif risk_score < 50 and profit_rate > 5:
        overall_score = 70
        recommendation = "양호한 투자 — 추가 현장 확인 권장"
    elif risk_score >= 70:
        overall_score = 30
        recommendation = "위험 물건 — 투자 비권장"
    else:
        overall_score = 50
        recommendation = "보통 — 신중한 검토 필요"

    return ReportResponse(
        case_number=case_number,
        address=item.get("address", ""),
        area=item.get("area", 0),
        appraisal_value=appraisal,
        minimum_bid=min_bid,
        auction_date=item.get("auction_date", ""),
        risk_items=risk_result["items"],
        risk_score=risk_score,
        expected_profit=expected_profit,
        profit_rate=profit_rate,
        overall_score=overall_score,
        recommendation=recommendation,
    )


@app.get("/regions")
async def get_regions():
    return {
        "regions": [
            {"id": "seoul", "name": "서울", "courts": ["서울중앙지방법원", "서울동부", "서울서부", "서울남부", "서울북부"]},
            {"id": "busan", "name": "부산", "courts": ["부산지방법원", "부산동부지원", "부산서부지원"]},
            {"id": "daegu", "name": "대구", "courts": ["대구지방법원", "대구서부지원"]},
            {"id": "incheon", "name": "인천", "courts": ["인천지방법원"]},
            {"id": "gwangju", "name": "광주", "courts": ["광주지방법원"]},
            {"id": "daejeon", "name": "대전", "courts": ["대전지방법원"]},
            {"id": "ulsan", "name": "울산", "courts": ["울산지방법원"]},
            {"id": "gyeonggi", "name": "경기", "courts": ["수원지방법원", "의정부지방법원", "인천지방법원 부천지원"]},
        ]
    }


@app.on_event("startup")
async def startup_event():
    init_db()
    # KST 08:00 = UTC 23:00 (대법원 데이터 새벽 업데이트 후 수집)
    scheduler.add_job(refresh_all_data, 'cron', hour=23, minute=0, timezone='UTC')
    scheduler.start()
    logger.info("Scheduler started - daily refresh at 23:00 UTC (08:00 KST)")
    await refresh_all_data()

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()
    logger.info("Scheduler shutdown")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("api_server:app", host="0.0.0.0", port=port, reload=True)
