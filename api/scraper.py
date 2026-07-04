import asyncio
import logging
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Optional
import httpx
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

# 공공데이터포털 법원경매정보 서비스 키
COURT_API_KEY  = os.environ.get("COURT_API_KEY", "")
COURT_API_URL  = "https://www.courtauction.go.kr"
DATA_GOV_URL   = "http://apis.data.go.kr/B550013/courtAuctionInfoService"

# ── 동적 Mock 데이터 생성 (오늘 기준 날짜 자동계산) ─────────────────
_MOCK_TEMPLATE = [
    # (case_suffix, court, address, prop_type, area, min_bid, appraisal, desc, rights, seed)
    ("10234", "서울중앙지방법원",  "서울특별시 강남구 역삼동 737-1 역삼e편한세상 101동 1502호",   "APARTMENT", 84.97,  820000000,  1050000000, "강남역 도보7분, 남향 고층",          [],                  "seoul_apt1"),
    ("20518", "서울남부지방법원",  "서울특별시 양천구 목동 917 목동신시가지 7단지 502동 803호",    "APARTMENT", 95.58,  680000000,   870000000, "목동 7단지, 학군우수 중층",          [],                  "seoul_apt2"),
    ("31047", "서울동부지방법원",  "서울특별시 송파구 잠실동 188 잠실주공5단지 403동 602호",       "APARTMENT", 76.45, 1050000000,  1380000000, "잠실 재건축 대상, 2·8호선 역세권",  ["선순위임차인"],      "seoul_apt3"),
    ("42391", "부산지방법원",      "부산광역시 해운대구 우동 1480 해운대엘시티더샵 B동 3201호",    "APARTMENT",112.30, 1250000000,  1620000000, "해운대 오션뷰, 72층 초고층",        [],                  "busan_apt1"),
    ("53820", "부산지방법원 동부지원","부산광역시 수영구 광안동 183-2 광안리트럼프월드 203호",       "COMMERCIAL", 89.20,  480000000,   620000000, "광안리 해변상가 1층 코너, 월세280만",["유치권"],            "busan_com1"),
    ("64173", "대구지방법원",      "대구광역시 수성구 범어동 1043 범어SK리더스뷰 101동 2003호",   "APARTMENT",134.62,  620000000,   790000000, "수성구 학군 최고, 33층 전망",       [],                  "daegu_apt1"),
    ("70928", "울산지방법원",      "울산광역시 남구 삼산동 1396 삼산현대아파트 204동 1101호",      "APARTMENT", 84.51,  285000000,   360000000, "삼산 현대 대단지, 남향",            [],                  "ulsan_apt1"),
    ("81456", "울산지방법원",      "울산광역시 중구 복산동 284 성안e편한세상 302동 801호",         "APARTMENT", 59.82,  175000000,   228000000, "도심 소형, 1인가구 임대수요 높음",  [],                  "ulsan_apt2"),
    ("92037", "광주지방법원",      "광주광역시 서구 치평동 1206 광주롯데캐슬 201동 1505호",        "APARTMENT",101.97,  320000000,   415000000, "광주 신도심 대단지, 롯데몰 인접",   [],                  "gwangju_apt1"),
    ("10384", "대전지방법원",      "대전광역시 유성구 도룡동 451 도룡SK뷰 103동 2201호",           "APARTMENT",114.84,  430000000,   550000000, "대덕특구 핵심, 고층 남향",          [],                  "daejeon_apt1"),
    ("11572", "수원지방법원",      "경기도 수원시 영통구 이의동 906 광교e편한세상 204동 1201호",    "APARTMENT", 84.89,  560000000,   710000000, "광교신도시, 호수공원 도보5분",      [],                  "suwon_apt1"),
    ("12841", "의정부지방법원",    "경기도 남양주시 다산동 3940 다산신도시자이더스타 101동 1803호", "APARTMENT", 74.97,  380000000,   490000000, "다산신도시, GTX-B 예정역세권",     [],                  "namyangju_apt1"),
    ("13926", "서울서부지방법원",  "서울특별시 마포구 상암동 1605 DMC아이파크2단지 B동 901호",     "OFFICE",   165.30, 1480000000,  1850000000, "DMC 오피스, 임차인유지 월580만",   [],                  "seoul_off1"),
    ("14703", "창원지방법원",      "경상남도 창원시 성산구 상남동 87 상남상가빌딩 3층 301호",      "COMMERCIAL", 58.70,  210000000,   280000000, "창원 상남동 번화가, 장기임차인",    [],                  "changwon_com1"),
    ("15087", "인천지방법원",      "인천광역시 연수구 송도동 17-1 포스코더샵퍼스트월드 A동 3501호","APARTMENT",122.41,  730000000,   940000000, "송도 랜드마크, 센트럴파크뷰",      [],                  "incheon_apt1"),
    ("16394", "청주지방법원",      "충청북도 청주시 흥덕구 복대동 2691 테크노폴리스힐스테이트 1102호","APARTMENT", 84.95, 245000000,  315000000, "청주 테크노폴리스 신축, 삼성·LG",  [],                  "cheongju_apt1"),
    ("17628", "전주지방법원",      "전라북도 전주시 완산구 효자동 763-10 효자더샵스타시티 605호",  "APARTMENT", 59.96,  145000000,   192000000, "전주 효자동 소형, 전북대병원 인근", [],                  "jeonju_apt1"),
    ("18512", "대구지방법원 서부지원","대구광역시 달서구 감삼동 1250 달서중흥S클래스 301동 1401호", "HOUSE",    149.80,  385000000,   490000000, "달서 준주택, 개별주차 3대",        ["법정지상권"],        "daegu_house1"),
    ("19304", "수원지방법원 안산지원","경기도 화성시 동탄2신도시 반석로 210 반도유보라 201동 2205호","APARTMENT", 84.90,  440000000,   570000000, "동탄2신도시, GTX-A 동탄역 도보10분",["선순위임차인"],      "hwaseong_apt1"),
    ("20196", "부산지방법원 서부지원","부산광역시 사하구 신평동 648-12 사하신평역세권오피스텔 805호","OFFICE",    36.22,   78000000,   105000000, "신평역 1분 역세권 오피스텔",       [],                  "busan_off1"),
    ("21038", "서울중앙지방법원",  "서울특별시 서초구 방배동 813 방배아트자이 201동 1301호",       "APARTMENT",114.23,  980000000,  1240000000, "서초 방배동 브랜드, 2호선 방배역",  [],                  "seoul_apt4"),
    ("22147", "부산지방법원",      "부산광역시 동래구 온천동 463 동래래미안아이파크 103동 2101호", "APARTMENT", 84.79,  390000000,   510000000, "동래온천 역세권, 남향 고층",        [],                  "busan_apt2"),
    ("23256", "인천지방법원 부천지원","경기도 부천시 상동 535 상동아이파크 2차 304동 1202호",       "APARTMENT", 84.93,  350000000,   460000000, "부천 상동, 7호선 역세권",          [],                  "bucheon_apt1"),
    ("24365", "서울북부지방법원",  "서울특별시 노원구 상계동 344 상계주공 8단지 702호",            "APARTMENT", 49.59,  320000000,   425000000, "노원 대단지, 4·7호선 환승",        [],                  "seoul_apt5"),
    ("25474", "대전지방법원",      "대전광역시 서구 둔산동 1408 둔산대림아파트 108동 1503호",      "APARTMENT", 84.80,  295000000,   388000000, "대전 둔산 핵심, 법원·행정타운 인근",[], "daejeon_apt2"),
    ("26583", "대구지방법원",      "대구광역시 북구 칠성동 240 북부상업지 근린생활시설 1층",        "COMMERCIAL", 72.10,  165000000,   220000000, "칠성시장 인근 상가 1층, 유동인구 풍부",["유치권"],          "daegu_com1"),
    ("27692", "수원지방법원",      "경기도 성남시 분당구 정자동 6 파크뷰 102동 805호",             "APARTMENT", 84.87,  620000000,   820000000, "분당 정자동, 신분당선 역세권",      [],                  "seongnam_apt1"),
    ("28801", "광주지방법원 순천지원","전라남도 순천시 조례동 1540 순천만자이 203동 906호",          "APARTMENT", 84.72,  215000000,   278000000, "순천 신시가지, 순천만 생태공원 인근", [],                "suncheon_apt1"),
    ("29910", "대전지방법원 천안지원","충청남도 천안시 서북구 불당동 1534 불당지웰푸르지오 101동 604호","APARTMENT",84.93,  265000000,   345000000, "천안 불당동, SRT·KTX 역세권",     [],                  "cheonan_apt1"),
    ("30019", "부산지방법원",      "부산광역시 금정구 구서동 571 부산대힐스테이트 2차 202동 1801호","APARTMENT", 84.95,  340000000,   440000000, "부산대역 도보5분, 대학가 임대수요", [],                  "busan_apt3"),
]


def _generate_dynamic_items() -> list[dict]:
    """오늘 기준 입찰일자 자동계산 - 실제 경매처럼 7~60일 후 날짜 분산"""
    today = datetime.now()
    items = []
    for i, t in enumerate(_MOCK_TEMPLATE):
        suffix, court, addr, ptype, area, min_bid, appraisal, desc, rights, seed = t
        # 입찰일을 7~60일 범위에 분산 (실제 경매 주기 반영)
        offset_days = 7 + (i * 53 // len(_MOCK_TEMPLATE)) % 54
        auction_dt  = today + timedelta(days=offset_days)
        # 주말 제외 (토·일이면 월요일로 밀기)
        while auction_dt.weekday() >= 5:
            auction_dt += timedelta(days=1)
        items.append({
            "id":             f"{today.year}타경{suffix}",
            "case_number":    f"{today.year}타경{suffix}",
            "court":          court,
            "address":        addr,
            "property_type":  ptype,
            "area":           area,
            "minimum_bid":    min_bid,
            "appraisal_value": appraisal,
            "auction_date":   auction_dt.strftime("%Y-%m-%d"),
            "description":    desc,
            "images":         [],
            "status":         "SCHEDULED",
            "rights":         rights,
            "risk_score":     0.0,
        })
    return items

REGION_KEYWORDS = {
    "서울": ["서울"],
    "부산": ["부산"],
    "대구": ["대구"],
    "인천": ["인천"],
    "울산": ["울산"],
    "경기": ["수원", "의정부", "부천", "성남", "고양", "경기"],
    "해운대": ["해운대"],
    "강남": ["강남"],
    "수성": ["수성"],
}


PROPERTY_TYPE_MAP = {
    "아파트": "APARTMENT", "다세대": "APARTMENT", "연립": "APARTMENT",
    "단독": "HOUSE", "다가구": "HOUSE", "주택": "HOUSE",
    "토지": "LAND", "임야": "LAND", "전": "LAND", "답": "LAND",
    "상가": "COMMERCIAL", "근린": "COMMERCIAL", "점포": "COMMERCIAL",
    "오피스텔": "APARTMENT",
}


def _map_property_type(raw: str) -> str:
    for key, val in PROPERTY_TYPE_MAP.items():
        if key in raw:
            return val
    return "OTHER"


def _parse_xml_item(item_el: ET.Element) -> dict:
    """공공데이터포털 XML 응답 → 내부 dict 변환"""
    def _text(tag: str) -> str:
        el = item_el.find(tag)
        return el.text.strip() if el is not None and el.text else ""

    def _int(tag: str) -> int:
        try:
            return int(_text(tag).replace(",", ""))
        except ValueError:
            return 0

    def _float(tag: str) -> float:
        try:
            return float(_text(tag).replace(",", ""))
        except ValueError:
            return 0.0

    case_no = _text("사건번호") or _text("caseNo")
    images = []
    image_url = _text("물건이미지") or _text("objectImage")
    if image_url:
        images = [image_url]
    return {
        "id": case_no,
        "case_number": case_no,
        "court": _text("법원명") or _text("courtName"),
        "address": _text("물건소재지") or _text("objectAddr"),
        "property_type": _map_property_type(_text("물건종류") or _text("objectKind")),
        "area": _float("면적") or _float("objectArea"),
        "minimum_bid": _int("최저매각가격") or _int("minBidPrice"),
        "appraisal_value": _int("감정평가액") or _int("appraisalPrice"),
        "auction_date": _text("매각기일") or _text("auctionDate"),
        "description": _text("물건내용") or _text("objectDesc") or "",
        "images": images,
        "status": "SCHEDULED",
        "rights": [r.strip() for r in (_text("특수권리") or "").split(",") if r.strip()],
    }


class AuctionScraper:
    def __init__(self):
        self._alive = True
        self._use_real_api = bool(COURT_API_KEY)
        self._use_court_scraping = True  # 대법원 경매 시스템 스크래핑 활성화
        mode = "실제 API" if self._use_real_api else ("대법원 스크래핑" if self._use_court_scraping else "mock")
        logger.info(f"AuctionScraper 초기화 완료 ({mode} 모드)")

    def is_alive(self) -> bool:
        return self._alive

    async def _fetch_real(
        self,
        region: str,
        max_price: int,
        min_price: int,
        property_type: str,
        page: int,
        limit: int,
    ) -> list[dict]:
        """공공데이터포털 법원경매정보 API 호출"""
        params = {
            "serviceKey": COURT_API_KEY,
            "pageNo": page,
            "numOfRows": limit,
            "cortOfcNm": region or "",
            "minBidPrc": min_price,
            "maxBidPrc": max_price,
        }
        if property_type != "ALL":
            params["objectKind"] = {
                "APARTMENT": "아파트", "HOUSE": "단독주택",
                "LAND": "토지", "COMMERCIAL": "상가",
            }.get(property_type, "")

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{DATA_GOV_URL}/getAuctionList", params=params)
            resp.raise_for_status()

        root = ET.fromstring(resp.text)
        items = root.findall(".//item")
        return [_parse_xml_item(el) for el in items]

    def _map_region_to_code(self, region: str) -> dict:
        """지역명을 대법원 지역 코드로 매핑"""
        region_code_map = {
            "서울": {"sdCd": "11", "sggCd": ""},
            "부산": {"sdCd": "21", "sggCd": ""},
            "대구": {"sdCd": "22", "sggCd": ""},
            "인천": {"sdCd": "23", "sggCd": ""},
            "광주": {"sdCd": "24", "sggCd": ""},
            "대전": {"sdCd": "25", "sggCd": ""},
            "울산": {"sdCd": "26", "sggCd": ""},
            "세종": {"sdCd": "29", "sggCd": ""},
            "경기": {"sdCd": "41", "sggCd": ""},
            "강원": {"sdCd": "42", "sggCd": ""},
            "충북": {"sdCd": "43", "sggCd": ""},
            "충남": {"sdCd": "44", "sggCd": ""},
            "전북": {"sdCd": "45", "sggCd": ""},
            "전남": {"sdCd": "46", "sggCd": ""},
            "경북": {"sdCd": "47", "sggCd": ""},
            "경남": {"sdCd": "48", "sggCd": ""},
            "제주": {"sdCd": "50", "sggCd": ""},
        }
        
        # 지역 키워드 매칭
        for key, code in region_code_map.items():
            if key in region:
                return code
        
        return {"sdCd": "", "sggCd": ""}

    def _map_property_type_to_code(self, property_type: str) -> str:
        """물건 종류를 대법원 코드로 매핑"""
        type_code_map = {
            "APARTMENT": "01",  # 아파트
            "HOUSE": "02",     # 주택
            "COMMERCIAL": "03", # 상가
            "LAND": "04",      # 토지
            "OFFICE": "05",    # 오피스
        }
        return type_code_map.get(property_type, "")

    async def _fetch_court_via_session(
        self,
        region: str,
        max_price: int,
        min_price: int,
        property_type: str,
        page: int,
        limit: int,
    ) -> list[dict]:
        """httpx로 대법원 WebSquare 세션 초기화 후 검색 API 직접 호출"""
        today = datetime.now()
        bid_start = (today + timedelta(days=7)).strftime("%Y%m%d")
        bid_end   = (today + timedelta(days=60)).strftime("%Y%m%d")
        
        # 지역 및 물건 종류 코드 매핑
        region_codes = self._map_region_to_code(region)
        property_type_code = self._map_property_type_to_code(property_type)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Referer": "https://www.courtauction.go.kr/pgj/index.on",
            "Origin": "https://www.courtauction.go.kr",
            "Content-Type": "application/json;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
        }
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                # Step 1: 세션 쿠키 획득
                await client.get("https://www.courtauction.go.kr/pgj/index.on", headers=headers)
                # Step 2: 검색 API 호출
                payload = {
                    "dataObject": {
                        "type": "json",
                        "name": "param",
                        "data": {
                            "srchInfo": {
                                "pgmId": "PGJ157M01",
                                "lafjOrderBy": "",
                                "cortAuctnSrchCondCd": "0004602",
                                "bidDvsCd": "000332",
                                "cortStDvs": "2",
                                "rprsAdongSdCd": region_codes["sdCd"],  # 지역 코드 추가
                                "rprsAdongSggCd": region_codes["sggCd"],  # 시군구 코드
                                "rprsAdongEmdCd": "",  # 읍면동 코드 (필요시 구현)
                                "lclDspslGdsLstUsgCd": property_type_code,  # 대분류 물건 종류
                                "mclDspslGdsLstUsgCd": "",  # 중분류
                                "sclDspslGdsLstUsgCd": "",  # 소분류
                                "aeeEvlAmtMin": str(min_price) if min_price > 0 else "",
                                "aeeEvlAmtMax": str(max_price) if max_price < 2_000_000_000 else "",
                                "lwsDspslPrcMin": "",
                                "lwsDspslPrcMax": "",
                                "bidBgngYmd": bid_start,
                                "bidEndYmd": bid_end,
                            },
                            "prevInfo": {"prevPgmId": "PGJ157M01"},
                        },
                    }
                }
                resp = await client.post(
                    "https://www.courtauction.go.kr/pgj/pgjsearch/searchControllerMain.on",
                    json=payload,
                    headers=headers,
                )
                resp.raise_for_status()
                result = resp.json()
                rows = []
                if isinstance(result, dict):
                    rows = (result.get("data") or {}).get("dlt_srchResult", [])
                elif isinstance(result, list):
                    for r in result:
                        if isinstance(r, dict) and "dlt_srchResult" in r:
                            rows = r["dlt_srchResult"]; break
                items = []
                for row in rows:
                    case_no = row.get("saNo", "") or row.get("srnSaNo", "")
                    if not case_no:
                        continue
                    items.append({
                        "id": case_no,
                        "case_number": case_no,
                        "court": row.get("jiwonNm", ""),
                        "address": row.get("realSt", "") or row.get("printSt", ""),
                        "property_type": self._map_property_type(row.get("dspslUsgNm", "")),
                        "area": self._parse_area(row.get("pjbBuldList", "")),
                        "minimum_bid": self._parse_price(row.get("minmaePrice", "0")),
                        "appraisal_value": self._parse_price(row.get("gamevalAmt", "0")),
                        "auction_date": row.get("maeGiil", ""),
                        "description": row.get("convAddr", "") or row.get("mulBigo", ""),
                        "images": [],
                        "status": "SCHEDULED",
                        "rights": [row.get("mulBigo", "")] if row.get("mulBigo") else [],
                        "risk_score": 0.0,
                    })
                logger.info(f"대법원 httpx 세션 조회 완료: {len(items)}건 (지역: {region}, 종류: {property_type})")
                return items
        except Exception as exc:
            logger.warning(f"대법원 httpx 세션 실패: {exc}")
            return []

    async def _fetch_court_auction(
        self,
        region: str,
        max_price: int,
        min_price: int,
        property_type: str,
        page: int,
        limit: int,
    ) -> list[dict]:
        """Playwright로 대법원 경매 시스템 네트워크 인터셉트 방식 스크래핑"""
        # 날짜 자동 계산 (현재일 +15일 ~ +60일)
        today = datetime.now()
        bid_start = (today + timedelta(days=15)).strftime("%Y%m%d")
        bid_end   = (today + timedelta(days=60)).strftime("%Y%m%d")
        
        # 지역 및 물건 종류 코드 매핑
        region_codes = self._map_region_to_code(region)
        property_type_code = self._map_property_type_to_code(property_type)

        captured: list[dict] = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    locale="ko-KR",
                )
                pw_page = await context.new_page()

                # 네트워크 응답 인터셉트
                async def handle_response(response):
                    if "searchControllerMain.on" in response.url:
                        try:
                            data = await response.json()
                            if isinstance(data, dict) and "data" in data:
                                captured.append(data)
                            elif isinstance(data, list):
                                for d in data:
                                    if isinstance(d, dict) and "dlt_srchResult" in d:
                                        captured.append(d)
                        except Exception:
                            pass

                pw_page.on("response", handle_response)

                # 메인 페이지 접속 (웹스퀘어 초기화)
                await pw_page.goto(
                    "https://www.courtauction.go.kr/pgj/index.on",
                    wait_until="domcontentloaded",
                    timeout=30000,
                )
                await asyncio.sleep(3)

                # 매각예정물건 검색 페이지로 이동
                await pw_page.goto(
                    "https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ157M01.xml",
                    wait_until="domcontentloaded",
                    timeout=30000,
                )
                await asyncio.sleep(3)

                # JavaScript로 검색 조건 주입 및 검색 실행
                await pw_page.evaluate(f"""
                    (async () => {{
                        try {{
                            // 입찰시작일자, 종료일자 설정
                            const startEl = document.querySelector('[id="cal_dspslSchdGdsPerdStr"]');
                            const endEl   = document.querySelector('[id="cal_dspslSchdGdsPerdEnd"]');
                            if (startEl) startEl.value = '{bid_start}';
                            if (endEl)   endEl.value   = '{bid_end}';

                            // WebSquare 컴포넌트 직접 조작
                            if (typeof cal_dspslSchdGdsPerdStr !== 'undefined') {{
                                cal_dspslSchdGdsPerdStr.setValue('{bid_start}');
                            }}
                            if (typeof cal_dspslSchdGdsPerdEnd !== 'undefined') {{
                                cal_dspslSchdGdsPerdEnd.setValue('{bid_end}');
                            }}
                            
                            // 지역 코드 설정
                            if (typeof rprsAdongSdCd !== 'undefined' && '{region_codes["sdCd"]}') {{
                                rprsAdongSdCd.setValue('{region_codes["sdCd"]}');
                            }}
                            if (typeof rprsAdongSggCd !== 'undefined' && '{region_codes["sggCd"]}') {{
                                rprsAdongSggCd.setValue('{region_codes["sggCd"]}');
                            }}
                            
                            // 물건 종류 설정
                            if (typeof lclDspslGdsLstUsgCd !== 'undefined' && '{property_type_code}') {{
                                lclDspslGdsLstUsgCd.setValue('{property_type_code}');
                            }}
                            
                            // 감정가 범위 설정
                            if (typeof aeeEvlAmtMin !== 'undefined' && {min_price} > 0) {{
                                aeeEvlAmtMin.setValue('{min_price}');
                            }}
                            if (typeof aeeEvlAmtMax !== 'undefined' && {max_price} < 2000000000) {{
                                aeeEvlAmtMax.setValue('{max_price}');
                            }}

                            // 검색 버튼 클릭
                            const btnEl = document.querySelector('[id="btn_dspslSchdGdsSrch"]');
                            if (btnEl) btnEl.click();
                            else if (typeof btn_dspslSchdGdsSrch !== 'undefined') {{
                                btn_dspslSchdGdsSrch.trigger('onclick');
                            }}
                        }} catch(e) {{ console.error('inject error:', e); }}
                    }})()
                """)

                # 검색 결과 대기
                await asyncio.sleep(5)
                await browser.close()

        except Exception as exc:
            logger.warning(f"대법원 Playwright 스크래핑 실패: {exc}")
            return []

        # 인터셉트된 응답 파싱
        items = []
        for data in captured:
            rows = []
            if "dlt_srchResult" in data:
                rows = data["dlt_srchResult"]
            elif "data" in data and isinstance(data["data"], dict):
                rows = data["data"].get("dlt_srchResult", [])
            for row in rows:
                case_no = row.get("saNo", "") or row.get("srnSaNo", "")
                if not case_no:
                    continue
                item = {
                    "id": case_no,
                    "case_number": case_no,
                    "court": row.get("jiwonNm", ""),
                    "address": row.get("realSt", "") or row.get("printSt", ""),
                    "property_type": self._map_property_type(row.get("dspslUsgNm", "")),
                    "area": self._parse_area(row.get("pjbBuldList", "")),
                    "minimum_bid": self._parse_price(row.get("minmaePrice", "0")),
                    "appraisal_value": self._parse_price(row.get("gamevalAmt", "0")),
                    "auction_date": row.get("maeGiil", ""),
                    "description": row.get("convAddr", "") or row.get("mulBigo", ""),
                    "images": [],
                    "status": "SCHEDULED",
                    "rights": [row.get("mulBigo", "")] if row.get("mulBigo") else [],
                    "risk_score": 0.0,
                }
                items.append(item)

        logger.info(f"대법원 Playwright 스크래핑 완료: {len(items)}건 (지역: {region}, 종류: {property_type})")
        return items
    
    def _map_property_type(self, usage_name: str) -> str:
        """용도명을 property_type으로 매핑"""
        return _map_property_type(usage_name) if usage_name else "OTHER"

    def _parse_area(self, building_list: str) -> float:
        """건물 리스트에서 면적 파싱"""
        if not building_list:
            return 0.0
        match = re.search(r'(\d+\.?\d*)㎡', building_list)
        return float(match.group(1)) if match else 0.0

    def _parse_price(self, price_str: str) -> int:
        """가격 문자열을 정수로 변환"""
        if not price_str:
            return 0
        try:
            return int(float(str(price_str).replace(",", "")))
        except (ValueError, TypeError):
            return 0

    def _map_status(self, status_code: str) -> str:
        """상태 코드를 status로 매핑"""
        mapping = {"1": "BIDDING", "2": "SOLD", "3": "UNSOLD"}
        return mapping.get(str(status_code), "BIDDING")

    def _filter_mock(
        self,
        region: str,
        max_price: int,
        min_price: int,
        property_type: str,
        page: int,
        limit: int,
    ) -> list[dict]:
        results = _generate_dynamic_items()  # 오늘 날짜 기준 자동 생성
        if region:
            region_norm = region.replace(" ", "")
            keywords: list[str] = []
            for key, vals in REGION_KEYWORDS.items():
                if key in region or any(v in region for v in vals):
                    keywords.extend(vals)
            if not keywords:
                keywords = [region_norm]
            results = [
                r for r in results
                if any(kw in r["address"].replace(" ", "") for kw in keywords)
            ]
        if property_type != "ALL":
            results = [r for r in results if r["property_type"] == property_type]
        results = [r for r in results if min_price <= r["minimum_bid"] <= max_price]
        start = (page - 1) * limit
        return results[start: start + limit]

    async def search(
        self,
        region: str = "",
        max_price: int = 500_000_000,
        min_price: int = 0,
        property_type: str = "ALL",
        page: int = 1,
        limit: int = 20,
    ) -> list[dict]:
        if self._use_real_api:
            try:
                items = await self._fetch_real(region, max_price, min_price, property_type, page, limit)
                logger.info(f"실제 API 조회 완료: {len(items)}건")
                return items
            except Exception as exc:
                logger.warning(f"실제 API 실패 → 대법원 스크래핑 시도: {exc}")

        if self._use_court_scraping:
            # Step 1: httpx 세션 방식 시도 (빠름)
            try:
                items = await self._fetch_court_via_session(region, max_price, min_price, property_type, page, limit)
                if items:
                    logger.info(f"대법원 httpx 세션 완료: {len(items)}건")
                    return items
            except Exception as exc:
                logger.warning(f"httpx 세션 실패 → Playwright 시도: {exc}")
            # Step 2: Playwright 방식 시도 (느리지만 안정적)
            try:
                items = await self._fetch_court_auction(region, max_price, min_price, property_type, page, limit)
                if items:
                    logger.info(f"대법원 Playwright 완료: {len(items)}건")
                    return items
            except Exception as exc:
                logger.warning(f"대법원 Playwright 실패 → 동적 mock: {exc}")

        await asyncio.sleep(0.05)
        return self._filter_mock(region, max_price, min_price, property_type, page, limit)

    async def get_by_case_number(self, case_number: str) -> Optional[dict]:
        if self._use_real_api:
            try:
                params = {
                    "serviceKey": COURT_API_KEY,
                    "caseNo": case_number,
                    "pageNo": 1,
                    "numOfRows": 1,
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(f"{DATA_GOV_URL}/getAuctionDetail", params=params)
                    resp.raise_for_status()
                root = ET.fromstring(resp.text)
                items = root.findall(".//item")
                if items:
                    return _parse_xml_item(items[0])
            except Exception as exc:
                logger.warning(f"상세 API 실패 → mock fallback: {exc}")

        await asyncio.sleep(0.05)
        for item in MOCK_ITEMS:
            if item["case_number"] == case_number:
                return dict(item)
        return None
