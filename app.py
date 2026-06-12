import streamlit as st
import pandas as pd
from datetime import datetime, timedelta

# ── 페이지 설정 ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Sentinel Alpha | AI 자율 경매 에이전트",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── 커스텀 CSS (다크 블루 테마) ──────────────────────────────────────────────
st.markdown("""
<style>
    /* 전체 배경 */
    .stApp { background-color: #080d1a; color: #dde6f0; }
    [data-testid="stSidebar"] {
        background-color: #0b1122;
        border-right: 1px solid #1b2d4f;
    }
    /* 메트릭 카드 */
    [data-testid="stMetric"] {
        background: linear-gradient(135deg, #0d1428 0%, #132040 100%);
        border: 1px solid #1a3360;
        border-radius: 14px;
        padding: 14px 18px;
    }
    [data-testid="stMetricLabel"] { color: #7a9bbf !important; font-size: 0.8rem; }
    [data-testid="stMetricValue"] { color: #dde6f0 !important; font-weight: 800; }
    [data-testid="stMetricDelta"] { font-size: 0.75rem; }
    /* 공통 카드 */
    .prop-card {
        background: linear-gradient(140deg, #0d1428 0%, #111c38 100%);
        border: 1px solid #1a3360;
        border-radius: 16px;
        padding: 18px 18px 14px 18px;
        margin-bottom: 10px;
        transition: border-color .25s, box-shadow .25s;
        position: relative;
        overflow: hidden;
    }
    .prop-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        background: linear-gradient(90deg, #2f6fd4, #00c9f0);
        border-radius: 16px 16px 0 0;
    }
    .prop-card.selected { border-color: #2eca7f; box-shadow: 0 0 18px rgba(46,202,127,.25); }
    /* 배지 */
    .badge-safe    { background:#0b3320; border:1px solid #2eca7f; color:#2eca7f;
                     padding:3px 11px; border-radius:20px; font-size:11px; font-weight:700; }
    .badge-warning { background:#3a2500; border:1px solid #f0a000; color:#f0a000;
                     padding:3px 11px; border-radius:20px; font-size:11px; font-weight:700; }
    .badge-danger  { background:#3a0a0a; border:1px solid #e05252; color:#e05252;
                     padding:3px 11px; border-radius:20px; font-size:11px; font-weight:700; }
    /* 섹션 헤더 바 */
    .sec-header {
        background: linear-gradient(135deg, #0d1428 0%, #132040 100%);
        border: 1px solid #1a3360;
        border-left: 4px solid #2f6fd4;
        border-radius: 8px;
        padding: 10px 18px;
        margin: 16px 0 18px 0;
    }
    /* 가격 강조 */
    .price-main { color:#00c9f0; font-size:1.25rem; font-weight:800; }
    .price-orig { color:#4a6a8a; font-size:0.8rem; text-decoration:line-through; }
    /* 태그 */
    .tag { background:#101e38; color:#6ea8d8; border:1px solid #1a3360;
           padding:2px 8px; border-radius:6px; font-size:11px; margin-right:4px; }
    .fail-tag { background:rgba(240,160,0,.13); border:1px solid rgba(240,160,0,.35);
                color:#f0a000; padding:2px 7px; border-radius:6px; font-size:11px; }
    /* 비교 영역 */
    .compare-box {
        background: linear-gradient(135deg, #090e1c, #0d1830);
        border: 1px solid #1e3c6a;
        border-radius: 18px;
        padding: 26px 26px 20px 26px;
        margin-top: 28px;
    }
    /* 버튼 */
    .stButton > button {
        background: linear-gradient(135deg,#1a3570,#2f6fd4);
        border:none; color:white; border-radius:8px; font-weight:600;
    }
    .stButton > button:hover {
        background: linear-gradient(135deg,#2f6fd4,#00c9f0);
        box-shadow: 0 4px 14px rgba(47,111,212,.4);
    }
    /* 구분선 */
    hr { border-color: #1a3360 !important; }
    /* 데이터프레임 */
    .stDataFrame { border-radius: 10px; overflow: hidden; }
    /* hero gradient text */
    .hero-title {
        background: linear-gradient(120deg,#7ac4ff,#00c9f0,#7ac4ff);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        font-size: 2.4rem; font-weight: 900; line-height: 1.15;
    }
    /* info / warning overrides */
    [data-testid="stAlert"] { border-radius: 10px; }
</style>
""", unsafe_allow_html=True)


# ════════════════════════════════════════════════════════════════════════════
# 더미 데이터
# ════════════════════════════════════════════════════════════════════════════
@st.cache_data
def load_data() -> list[dict]:
    today = datetime.now()
    return [
        {
            "id": "001", "case_number": "2024타경32145", "court": "서울중앙지방법원",
            "region": "서울", "address": "서울특별시 강남구 대치동 은마아파트 305동 12층 1204호",
            "property_type": "아파트", "area": 84.5,
            "appraisal_value": 1_800_000_000, "minimum_bid": 1_260_000_000,
            "failed_count": 2, "auction_date": (today + timedelta(days=5)).strftime("%Y-%m-%d"),
            "risk_score": 5.0,  "risk_label": "안전",  "risk_items": [],
            "yield_rate": 42.9, "discount_rate": 30.0,
            "eviction_difficulty": "낮음", "additional_cost": 0,
        },
        {
            "id": "002", "case_number": "2024타경18920", "court": "부산지방법원",
            "region": "부산", "address": "부산광역시 해운대구 우동 센텀시티 더샵 2차 1501호",
            "property_type": "아파트", "area": 59.8,
            "appraisal_value": 720_000_000, "minimum_bid": 432_000_000,
            "failed_count": 3, "auction_date": (today + timedelta(days=14)).strftime("%Y-%m-%d"),
            "risk_score": 10.0, "risk_label": "안전",  "risk_items": [],
            "yield_rate": 66.7, "discount_rate": 40.0,
            "eviction_difficulty": "낮음", "additional_cost": 0,
        },
        {
            "id": "003", "case_number": "2023타경55871", "court": "대구지방법원",
            "region": "대구", "address": "대구광역시 수성구 범어동 힐스테이트 범어 804호",
            "property_type": "아파트", "area": 114.2,
            "appraisal_value": 980_000_000, "minimum_bid": 588_000_000,
            "failed_count": 4, "auction_date": (today + timedelta(days=3)).strftime("%Y-%m-%d"),
            "risk_score": 55.0, "risk_label": "주의",
            "risk_items": ["선순위 임차인 존재 — 배당 후 잔여 여부 확인 필요"],
            "yield_rate": 66.7, "discount_rate": 40.0,
            "eviction_difficulty": "중간", "additional_cost": 35_000_000,
        },
        {
            "id": "004", "case_number": "2024타경7734", "court": "울산지방법원",
            "region": "울산", "address": "울산광역시 남구 신정동 롯데캐슬 골드 506호",
            "property_type": "아파트", "area": 84.9,
            "appraisal_value": 450_000_000, "minimum_bid": 270_000_000,
            "failed_count": 2, "auction_date": (today + timedelta(days=21)).strftime("%Y-%m-%d"),
            "risk_score": 8.0,  "risk_label": "안전",  "risk_items": [],
            "yield_rate": 66.7, "discount_rate": 40.0,
            "eviction_difficulty": "낮음", "additional_cost": 0,
        },
        {
            "id": "005", "case_number": "2024타경29011", "court": "서울남부지방법원",
            "region": "서울", "address": "서울특별시 영등포구 여의도동 시범아파트 4동 8층 801호",
            "property_type": "아파트", "area": 137.8,
            "appraisal_value": 2_100_000_000, "minimum_bid": 1_680_000_000,
            "failed_count": 1, "auction_date": (today + timedelta(days=5)).strftime("%Y-%m-%d"),
            "risk_score": 60.0, "risk_label": "주의",
            "risk_items": ["가처분 등기 — 소유권 이전 제한 위험"],
            "yield_rate": 25.0, "discount_rate": 20.0,
            "eviction_difficulty": "중간", "additional_cost": 15_000_000,
        },
        {
            "id": "006", "case_number": "2023타경44210", "court": "부산동부지원",
            "region": "부산", "address": "부산광역시 남구 대연동 삼성래미안 1단지 802호",
            "property_type": "아파트", "area": 59.4,
            "appraisal_value": 380_000_000, "minimum_bid": 190_000_000,
            "failed_count": 5, "auction_date": (today + timedelta(days=10)).strftime("%Y-%m-%d"),
            "risk_score": 90.0, "risk_label": "위험",
            "risk_items": ["유치권 신고 — 낙찰 후 인도 불가 위험 (최고 위험)"],
            "yield_rate": 100.0, "discount_rate": 50.0,
            "eviction_difficulty": "매우 높음", "additional_cost": 80_000_000,
        },
        {
            "id": "007", "case_number": "2024타경61025", "court": "대구서부지원",
            "region": "대구", "address": "대구광역시 달서구 상인동 달서 e편한세상 1703호 상가",
            "property_type": "상가", "area": 45.2,
            "appraisal_value": 320_000_000, "minimum_bid": 192_000_000,
            "failed_count": 3, "auction_date": (today + timedelta(days=12)).strftime("%Y-%m-%d"),
            "risk_score": 12.0, "risk_label": "안전",  "risk_items": [],
            "yield_rate": 66.7, "discount_rate": 40.0,
            "eviction_difficulty": "낮음", "additional_cost": 0,
        },
        {
            "id": "008", "case_number": "2024타경3892", "court": "울산지방법원",
            "region": "울산", "address": "울산광역시 북구 천곡동 지목(대) 토지 2필지",
            "property_type": "토지", "area": 892.0,
            "appraisal_value": 280_000_000, "minimum_bid": 140_000_000,
            "failed_count": 4, "auction_date": (today + timedelta(days=18)).strftime("%Y-%m-%d"),
            "risk_score": 65.0, "risk_label": "주의",
            "risk_items": ["분묘기지권 — 토지 이용 제한 가능성"],
            "yield_rate": 100.0, "discount_rate": 50.0,
            "eviction_difficulty": "중간", "additional_cost": 20_000_000,
        },
        {
            "id": "009", "case_number": "2024타경14567", "court": "서울동부지방법원",
            "region": "서울", "address": "서울특별시 송파구 잠실동 잠실주공5단지 207동 5층 502호",
            "property_type": "아파트", "area": 76.5,
            "appraisal_value": 1_950_000_000, "minimum_bid": 1_365_000_000,
            "failed_count": 1, "auction_date": (today + timedelta(days=6)).strftime("%Y-%m-%d"),
            "risk_score": 0.0,  "risk_label": "안전",  "risk_items": [],
            "yield_rate": 42.9, "discount_rate": 30.0,
            "eviction_difficulty": "낮음", "additional_cost": 0,
        },
        {
            "id": "010", "case_number": "2024타경52389", "court": "부산서부지원",
            "region": "부산", "address": "부산광역시 사하구 하단동 을숙도대교 인근 근린상가 1층 101호",
            "property_type": "상가", "area": 68.0,
            "appraisal_value": 250_000_000, "minimum_bid": 125_000_000,
            "failed_count": 6, "auction_date": (today + timedelta(days=25)).strftime("%Y-%m-%d"),
            "risk_score": 0.0,  "risk_label": "안전",  "risk_items": [],
            "yield_rate": 100.0, "discount_rate": 50.0,
            "eviction_difficulty": "낮음", "additional_cost": 0,
        },
        {
            "id": "011", "case_number": "2024타경9981", "court": "서울서부지방법원",
            "region": "서울", "address": "서울특별시 마포구 공덕동 공덕 SK VIEW 아이파크 1703호",
            "property_type": "아파트", "area": 84.7,
            "appraisal_value": 1_100_000_000, "minimum_bid": 770_000_000,
            "failed_count": 2, "auction_date": (today + timedelta(days=9)).strftime("%Y-%m-%d"),
            "risk_score": 0.0,  "risk_label": "안전",  "risk_items": [],
            "yield_rate": 42.9, "discount_rate": 30.0,
            "eviction_difficulty": "낮음", "additional_cost": 0,
        },
        {
            "id": "012", "case_number": "2024타경7612", "court": "대구지방법원",
            "region": "대구", "address": "대구광역시 중구 동인동 1가 대구역 해링턴 플레이스 1105호",
            "property_type": "아파트", "area": 59.9,
            "appraisal_value": 480_000_000, "minimum_bid": 240_000_000,
            "failed_count": 5, "auction_date": (today + timedelta(days=16)).strftime("%Y-%m-%d"),
            "risk_score": 70.0, "risk_label": "위험",
            "risk_items": ["법정지상권 성립 가능 — 토지/건물 분리 소유 위험"],
            "yield_rate": 100.0, "discount_rate": 50.0,
            "eviction_difficulty": "높음", "additional_cost": 45_000_000,
        },
    ]


# ════════════════════════════════════════════════════════════════════════════
# 유틸리티 함수
# ════════════════════════════════════════════════════════════════════════════
def fmt_price(price: int) -> str:
    if price <= 0:
        return "없음"
    if price >= 100_000_000:
        eok = price // 100_000_000
        man = (price % 100_000_000) // 10_000
        return f"{eok}억 {man:,}만원" if man else f"{eok}억원"
    return f"{price // 10_000:,}만원"


def badge(label: str) -> str:
    cls = {"안전": "badge-safe", "주의": "badge-warning", "위험": "badge-danger"}.get(label, "badge-safe")
    icon = {"안전": "🟢", "주의": "🟡", "위험": "🔴"}.get(label, "🟢")
    return f'<span class="{cls}">{icon} AI분석: {label}</span>'


def diff_color(difficulty: str) -> str:
    return {"낮음": "#2eca7f", "중간": "#f0a000", "높음": "#e05252", "매우 높음": "#cc2222"}.get(difficulty, "#aaa")


# ════════════════════════════════════════════════════════════════════════════
# 사이드바 필터
# ════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown("""
    <div style="text-align:center; padding:20px 0 8px 0;">
        <div style="font-size:2.2rem;">🏛️</div>
        <div style="font-size:1.25rem; font-weight:900; color:#6eb4ff;">Sentinel Alpha</div>
        <div style="font-size:0.72rem; color:#4a6a8a; letter-spacing:.5px;">AI 자율 경매 에이전트</div>
    </div>
    <hr style="border-color:#1a3360; margin:6px 0 18px 0;">
    """, unsafe_allow_html=True)

    st.markdown("### 🔍 검색 필터")

    # 지역
    st.markdown("**📍 지역 선택**")
    sel_region = st.selectbox("region", ["전체", "서울", "부산", "대구", "울산"],
                              label_visibility="collapsed")

    st.markdown("---")

    # 물건 용도
    st.markdown("**🏠 물건 용도**")
    sel_type = st.selectbox("type", ["전체", "아파트", "상가", "토지"],
                            label_visibility="collapsed", key="ptype")

    st.markdown("---")

    # 예산 슬라이더
    st.markdown("**💰 나의 가용 예산**")
    budget = st.slider("budget", 50_000_000, 2_000_000_000,
                       (100_000_000, 1_500_000_000), 50_000_000,
                       label_visibility="collapsed")
    bc1, bc2 = st.columns(2)
    bc1.caption(f"최소 {fmt_price(budget[0])}")
    bc2.caption(f"최대 {fmt_price(budget[1])}")

    st.markdown("---")

    # 유찰 횟수
    st.markdown("**🔄 최소 유찰 횟수**")
    min_failed = st.slider("failed", 0, 6, 0, label_visibility="collapsed", key="fail")
    st.caption("모든 물건 표시" if min_failed == 0 else f"🔴 {min_failed}회 이상 유찰 물건만")

    st.markdown("---")

    # 위험 등급
    st.markdown("**🛡️ 위험 등급 필터**")
    show_safe    = st.checkbox("🟢 안전", value=True)
    show_warning = st.checkbox("🟡 주의", value=True)
    show_danger  = st.checkbox("🔴 위험", value=False)

    st.markdown("---")
    st.markdown(f"""
    <div style="text-align:center; color:#3a5a7a; font-size:0.72rem; padding:6px 0 14px 0;">
        📡 마지막 데이터 갱신<br>
        <span style="color:#6eb4ff;">{datetime.now().strftime('%Y.%m.%d %H:%M')}</span>
    </div>
    """, unsafe_allow_html=True)


# ════════════════════════════════════════════════════════════════════════════
# 데이터 로드 & 필터링
# ════════════════════════════════════════════════════════════════════════════
all_data = load_data()

allowed_labels = []
if show_safe:    allowed_labels.append("안전")
if show_warning: allowed_labels.append("주의")
if show_danger:  allowed_labels.append("위험")

filtered = [
    d for d in all_data
    if (sel_region == "전체" or d["region"] == sel_region)
    and (sel_type   == "전체" or d["property_type"] == sel_type)
    and (budget[0]  <= d["minimum_bid"] <= budget[1])
    and (d["failed_count"] >= min_failed)
    and (d["risk_label"] in allowed_labels)
]

safe_items     = [d for d in filtered if d["risk_label"] == "안전"]
avg_yield      = sum(d["yield_rate"] for d in filtered) / len(filtered) if filtered else 0
soon_auctions  = [
    d for d in filtered
    if (datetime.strptime(d["auction_date"], "%Y-%m-%d") - datetime.now()).days <= 7
]

# ════════════════════════════════════════════════════════════════════════════
# 메인 헤더
# ════════════════════════════════════════════════════════════════════════════
st.markdown("""
<div style="padding:20px 0 4px 0;">
    <div class="hero-title">🏛️ Sentinel Alpha</div>
    <p style="color:#4a6a8a; font-size:.95rem; margin:4px 0 0 2px;">
        AI 자율 경매 분석 에이전트 &nbsp;|&nbsp; 상위 0.1% 투자자를 위한 실시간 경매 대시보드
    </p>
</div>
""", unsafe_allow_html=True)

st.markdown("---")


# ════════════════════════════════════════════════════════════════════════════
# KPI 지표 (5열)
# ════════════════════════════════════════════════════════════════════════════
st.markdown("### 📊 실시간 시장 요약 지표")

m1, m2, m3, m4, m5 = st.columns(5)
m1.metric("🔍 전체 스캔 물건",   f"{len(all_data)}건",     "+12건 오늘 신규")
m2.metric("📋 필터링 결과",      f"{len(filtered)}건",
          f"전체의 {round(len(filtered)/len(all_data)*100)}%")
m3.metric("✅ 안전 물건 수",     f"{len(safe_items)}건",
          f"{round(len(safe_items)/len(filtered)*100) if filtered else 0}% 비율")
m4.metric("📈 평균 수익률",      f"{avg_yield:.1f}%",      "감정가 대비")
m5.metric("⏰ 7일 내 경매",      f"{len(soon_auctions)}건", "긴급 검토 권장")

st.markdown("---")


# ════════════════════════════════════════════════════════════════════════════
# 오늘의 AI 추천 TOP 3
# ════════════════════════════════════════════════════════════════════════════
st.markdown("""
<div class="sec-header">
    <h3 style="margin:0; color:#6eb4ff;">⭐ 오늘의 AI 추천 — 안전 고수익 물건 TOP 3</h3>
    <p style="margin:3px 0 0 0; color:#4a6a8a; font-size:.8rem;">
        위험도 낮음 + 감정가 대비 수익률 상위 기준으로 AI가 자동 선별합니다.
    </p>
</div>
""", unsafe_allow_html=True)

top3 = sorted(
    [d for d in all_data if d["risk_label"] == "안전"],
    key=lambda x: x["yield_rate"] - x["risk_score"] * 0.3,
    reverse=True,
)[:3]

medals = ["🥇", "🥈", "🥉"]

if top3:
    rec_cols = st.columns(len(top3))
    for idx, (col, item) in enumerate(zip(rec_cols, top3)):
        with col:
            days_left = (datetime.strptime(item["auction_date"], "%Y-%m-%d") - datetime.now()).days
            urgency = f"🔥 D-{days_left}" if days_left <= 7 else f"📅 D-{days_left}"
            st.markdown(f"""
            <div class="prop-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-size:1.6rem;">{medals[idx]}</span>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                        {badge(item["risk_label"])}
                        <span style="color:#4a6a8a; font-size:11px;">{urgency}</span>
                    </div>
                </div>
                <div style="color:#7a9bbf; font-size:0.72rem; margin-bottom:2px;">
                    {item["case_number"]} | {item["court"]}
                </div>
                <div style="color:#dde6f0; font-size:.85rem; font-weight:600; margin-bottom:12px; line-height:1.4;">
                    📍 {item["address"][:32]}{'...' if len(item["address"]) > 32 else ''}
                </div>
                <div style="background:#080d1a; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
                    <div class="price-orig">{fmt_price(item["appraisal_value"])}</div>
                    <div class="price-main">최저 {fmt_price(item["minimum_bid"])}</div>
                    <div style="color:#3a5a7a; font-size:11px; margin-top:3px;">
                        할인율 <span style="color:#f0a000; font-weight:700;">{item["discount_rate"]:.0f}%</span>&nbsp;·&nbsp;
                        수익률 <span style="color:#2eca7f; font-weight:700;">{item["yield_rate"]:.0f}%</span>
                    </div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <span class="tag">{item["property_type"]}</span>
                    <span class="tag">{item["area"]}㎡</span>
                    <span class="fail-tag">🔄 {item["failed_count"]}회 유찰</span>
                </div>
            </div>
            """, unsafe_allow_html=True)
else:
    st.info("🔍 현재 필터 조건에 맞는 추천 물건이 없습니다. 위험 등급 필터를 조정해 보세요.")

st.markdown("---")


# ════════════════════════════════════════════════════════════════════════════
# 전체 물건 카드 그리드
# ════════════════════════════════════════════════════════════════════════════
if "selected_ids" not in st.session_state:
    st.session_state.selected_ids = []

st.markdown(f"""
<div class="sec-header">
    <h3 style="margin:0; color:#dde6f0;">📋 전체 물건 조회 — {len(filtered)}건 검색됨</h3>
    <p style="margin:3px 0 0 0; color:#4a6a8a; font-size:.8rem;">
        카드 상단 <b style="color:#6eb4ff;">비교 선택</b> 체크박스를 2~3개 체크하면 하단에서 심층 비교 분석을 확인할 수 있습니다.
    </p>
</div>
""", unsafe_allow_html=True)

if not filtered:
    st.warning("🔍 검색 조건에 맞는 물건이 없습니다. 사이드바 필터를 조정해 보세요.")
else:
    N_COLS = 3
    for row_start in range(0, len(filtered), N_COLS):
        row_items = filtered[row_start: row_start + N_COLS]
        grid_cols = st.columns(N_COLS)

        for gcol, item in zip(grid_cols, row_items):
            with gcol:
                is_sel = item["id"] in st.session_state.selected_ids

                # 체크박스 (비교 선택)
                chk = st.checkbox(
                    f"📌 비교 선택",
                    value=is_sel,
                    key=f"chk_{item['id']}",
                    help="최대 3개까지 선택 가능 · 하단에서 AI 비교 분석",
                )
                if chk and item["id"] not in st.session_state.selected_ids:
                    if len(st.session_state.selected_ids) < 3:
                        st.session_state.selected_ids.append(item["id"])
                elif not chk and item["id"] in st.session_state.selected_ids:
                    st.session_state.selected_ids.remove(item["id"])

                selected_now = item["id"] in st.session_state.selected_ids
                card_border  = "selected" if selected_now else ""
                days_left    = (datetime.strptime(item["auction_date"], "%Y-%m-%d") - datetime.now()).days
                urgency_str  = f"🔥 D-{days_left}" if days_left <= 7 else f"📅 D-{days_left}"

                st.markdown(f"""
                <div class="prop-card {card_border}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <div>
                            <div style="color:#7a9bbf; font-size:.7rem;">{item["case_number"]}</div>
                            <div style="color:#4a8abf; font-size:.7rem;">{item["court"]}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
                            {badge(item["risk_label"])}
                            <span style="color:#3a5a7a; font-size:10px;">{urgency_str}</span>
                        </div>
                    </div>

                    <div style="color:#dde6f0; font-size:.83rem; font-weight:600; margin-bottom:10px; line-height:1.5;">
                        📍 {item["address"][:38]}{'...' if len(item["address"]) > 38 else ''}
                    </div>

                    <div style="background:#080d1a; border-radius:8px; padding:8px 11px; margin-bottom:9px;">
                        <div class="price-orig">{fmt_price(item["appraisal_value"])}</div>
                        <div class="price-main">최저 {fmt_price(item["minimum_bid"])}</div>
                        <div style="color:#3a5a7a; font-size:11px; margin-top:2px;">
                            할인율 <span style="color:#f0a000;">{item["discount_rate"]:.0f}%</span>&nbsp;·&nbsp;
                            수익률 <span style="color:#2eca7f;">{item["yield_rate"]:.0f}%</span>
                        </div>
                    </div>

                    <div style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:8px;">
                        <span class="tag">{item["property_type"]}</span>
                        <span class="tag">{item["area"]}㎡</span>
                        <span class="tag">{item["region"]}</span>
                        <span class="fail-tag">🔄 {item["failed_count"]}회 유찰</span>
                    </div>

                    <div style="color:#3a5a7a; font-size:11px;">
                        ⚖️ 명도 난이도:
                        <span style="color:{diff_color(item['eviction_difficulty'])}; font-weight:700;">
                            {item["eviction_difficulty"]}
                        </span>
                        {"&nbsp;·&nbsp;추가인수 <span style='color:#e05252;'>" + fmt_price(item["additional_cost"]) + "</span>" if item["additional_cost"] > 0 else "&nbsp;·&nbsp;<span style='color:#2eca7f;'>추가인수금 없음</span>"}
                    </div>
                </div>
                """, unsafe_allow_html=True)

                # 권리분석 상세 expander
                if item["risk_items"]:
                    with st.expander("⚠️ 권리 위험 상세 보기"):
                        for r in item["risk_items"]:
                            st.markdown(f"- 🔴 **{r}**")
                else:
                    with st.expander("✅ 권리 분석 상세 보기"):
                        st.markdown("- 🟢 특이 권리사항 없음\n- 🟢 선순위 임차인 미확인\n- 🟢 유치권 미신고")


# ════════════════════════════════════════════════════════════════════════════
# 비교 분석 모듈
# ════════════════════════════════════════════════════════════════════════════
st.markdown("---")

sel_items = [d for d in all_data if d["id"] in st.session_state.get("selected_ids", [])]
n_sel     = len(sel_items)

if n_sel == 1:
    st.info("📋 비교 분석을 위해 물건을 **1개 더** 선택해 주세요. (최대 3개 비교 가능)")

elif n_sel >= 2:
    with st.container():
        st.markdown("""
        <div class="compare-box">
            <h3 style="color:#6eb4ff; margin:0 0 4px 0;">⚖️ 1:1 심층 비교 분석</h3>
            <p style="color:#3a5a7a; font-size:.82rem; margin:0;">
                선택한 물건의 핵심 투자 지표를 AI가 자동으로 정리합니다.
            </p>
        </div>
        """, unsafe_allow_html=True)

        st.markdown(f"#### ⚖️ {n_sel}개 물건 심층 비교")

        # ── 비교 테이블 ─────────────────────────────────────────────
        headers_all = [
            "📌 사건번호", "🏠 물건 종류", "📐 면적(㎡)", "📍 지역",
            "💎 감정가", "📉 최저가", "🎯 감정가 대비 할인율",
            "📈 예상 수익률", "🔄 유찰 횟수",
            "🛡️ 권리 위험도", "🚪 예상 명도 난이도", "💸 예상 추가 인수금액",
            "⭐ AI 종합 판정",
        ]
        rows_per_item = [
            [item["case_number"] for item in sel_items],
            [item["property_type"] for item in sel_items],
            [f"{item['area']}㎡" for item in sel_items],
            [item["region"] for item in sel_items],
            [fmt_price(item["appraisal_value"]) for item in sel_items],
            [fmt_price(item["minimum_bid"]) for item in sel_items],
            [f"{item['discount_rate']:.0f}%" for item in sel_items],
            [f"{item['yield_rate']:.1f}%" for item in sel_items],
            [f"{item['failed_count']}회" for item in sel_items],
            [f"{item['risk_score']:.0f}점 ({item['risk_label']})" for item in sel_items],
            [item["eviction_difficulty"] for item in sel_items],
            [fmt_price(item["additional_cost"]) for item in sel_items],
            [item["risk_label"] for item in sel_items],
        ]

        tbl_data = {"지표": headers_all}
        for i, item in enumerate(sel_items):
            tbl_data[f"물건{i+1} · {item['case_number']}"] = [row[i] for row in rows_per_item]

        st.dataframe(pd.DataFrame(tbl_data), use_container_width=True, hide_index=True)

        # ── 핵심 지표 카드 비교 ─────────────────────────────────────
        st.markdown("#### 📊 핵심 지표 시각 비교")
        vi_cols = st.columns(n_sel)
        for vcol, item in zip(vi_cols, sel_items):
            risk_icon = {"안전": "🟢", "주의": "🟡", "위험": "🔴"}.get(item["risk_label"], "⚪")
            with vcol:
                st.markdown(f"""
                <div style="background:linear-gradient(135deg,#0d1428,#132040);
                            border:1px solid #1a3360; border-radius:13px;
                            padding:16px; text-align:center;">
                    <div style="color:#6eb4ff; font-size:.75rem; margin-bottom:6px;">
                        {item["case_number"]}
                    </div>
                    <div style="color:#00c9f0; font-size:2.1rem; font-weight:900; line-height:1;">
                        {item["yield_rate"]:.0f}%
                    </div>
                    <div style="color:#3a5a7a; font-size:.72rem; margin-bottom:8px;">예상 수익률</div>
                    <div style="color:#a0b8cc; font-size:.78rem; margin-bottom:3px;">
                        {risk_icon} 위험도 {item["risk_score"]:.0f}점
                    </div>
                    <div style="color:#a0b8cc; font-size:.78rem; margin-bottom:10px;">
                        🔄 유찰 {item["failed_count"]}회
                    </div>
                    <div style="background:#0a1320; border-radius:8px; padding:6px;">
                        <div style="color:#2eca7f; font-size:.8rem; font-weight:700;">
                            최저 {fmt_price(item["minimum_bid"])}
                        </div>
                    </div>
                </div>
                """, unsafe_allow_html=True)

        # ── AI 투자 의견 ─────────────────────────────────────────────
        st.markdown("#### 🤖 AI 투자 의견")

        best = max(sel_items, key=lambda x: x["yield_rate"] - x["risk_score"] * 0.5)
        worst = min(sel_items, key=lambda x: x["yield_rate"] - x["risk_score"] * 0.5)

        ai_c1, ai_c2 = st.columns([1, 2])
        with ai_c1:
            st.markdown(f"""
            <div style="background:linear-gradient(135deg,#082820,#0f4030);
                        border:1px solid #2eca7f; border-radius:13px;
                        padding:20px; text-align:center;">
                <div style="font-size:2rem;">🏆</div>
                <div style="color:#2eca7f; font-size:.82rem; font-weight:700; margin:7px 0 5px 0;">
                    AI 최우선 추천
                </div>
                <div style="color:#dde6f0; font-size:.88rem; font-weight:700;">
                    {best["case_number"]}
                </div>
                <div style="color:#7a9bbf; font-size:.72rem; margin-top:4px;">
                    수익-위험 종합 최고
                </div>
            </div>
            """, unsafe_allow_html=True)

        with ai_c2:
            add_note = (
                f"· ⚠️ 추가 인수금액 **{fmt_price(best['additional_cost'])}** 발생 — 실제 투자금 계산 필수"
                if best["additional_cost"] > 0
                else "· ✅ 추가 인수금액 없음 — 낙찰가 = 실투자금"
            )
            risk_col = {"안전": "#2eca7f", "주의": "#f0a000", "위험": "#e05252"}.get(best["risk_label"], "#aaa")
            st.markdown(f"""
            <div style="background:linear-gradient(135deg,#0d1428,#132040);
                        border:1px solid #1a3360; border-radius:13px; padding:20px;">
                <div style="color:#6eb4ff; font-weight:700; margin-bottom:10px;">📋 AI 분석 요약</div>
                <div style="color:#a0b8cc; font-size:.85rem; line-height:2;">
                    · <b style="color:#dde6f0;">{best["case_number"]}</b> 물건이 종합 투자 매력도가 가장 높습니다.<br>
                    · 감정가 대비 <b style="color:#00c9f0;">{best["discount_rate"]:.0f}% 할인</b>으로 낙찰 가능, 예상 수익률 <b style="color:#2eca7f;">{best["yield_rate"]:.0f}%</b><br>
                    · 권리분석 위험도 <b style="color:{risk_col};">{best["risk_label"]}</b> 등급 ({best["risk_score"]:.0f}점)<br>
                    · 예상 명도 난이도: <b style="color:{diff_color(best['eviction_difficulty'])};">{best["eviction_difficulty"]}</b><br>
                    {add_note}
                </div>
            </div>
            """, unsafe_allow_html=True)

        # 가장 낮은 투자 매력 물건 경고
        if n_sel >= 2 and worst["id"] != best["id"]:
            st.markdown(f"""
            <div style="background:rgba(58,10,10,.4); border:1px solid rgba(224,82,82,.35);
                        border-radius:10px; padding:12px 16px; margin-top:10px;">
                <span style="color:#e05252; font-size:.82rem;">
                    ⚠️ <b>{worst["case_number"]}</b>은(는) 비교 물건 중 투자 매력도가 가장 낮습니다.
                    {'권리 위험 항목을 반드시 검토하세요.' if worst["risk_items"] else '수익률 대비 위험도를 재검토하세요.'}
                </span>
            </div>
            """, unsafe_allow_html=True)

else:
    st.markdown("""
    <div style="background:linear-gradient(135deg,#080e1c,#0d1730);
                border:2px dashed #1a3360; border-radius:16px;
                padding:30px; text-align:center; margin-top:6px;">
        <div style="font-size:2.2rem; margin-bottom:8px;">⚖️</div>
        <div style="color:#3a5a7a; font-size:1rem; font-weight:700;">1:1 심층 비교 분석 모듈</div>
        <div style="color:#2a4060; font-size:.85rem; margin-top:8px; line-height:1.8;">
            물건 카드 상단의 <b style="color:#6eb4ff;">📌 비교 선택</b> 체크박스를 2~3개 선택하면<br>
            AI가 자동으로 투자 지표를 비교 분석합니다.
        </div>
    </div>
    """, unsafe_allow_html=True)


# ════════════════════════════════════════════════════════════════════════════
# 푸터
# ════════════════════════════════════════════════════════════════════════════
st.markdown("---")
st.markdown("""
<div style="text-align:center; color:#253a52; font-size:.72rem; padding:8px 0 20px 0; line-height:2;">
    🏛️ <b style="color:#3a5a7a;">Sentinel Alpha</b> v1.0 &nbsp;·&nbsp; AI 자율 경매 분석 에이전트<br>
    ⚠️ 본 서비스는 투자 참고용 정보를 제공하며, 최종 투자 결정은 반드시 전문가와 상담 후 진행하시기 바랍니다.<br>
    <span style="color:#1a2d44;">© 2024 Sentinel Alpha. All rights reserved.</span>
</div>
""", unsafe_allow_html=True)
