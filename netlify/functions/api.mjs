// Sentinel Alpha API — Netlify Functions 포팅 버전
// api/api_server.py(FastAPI)와 동일한 응답 스키마를 제공하는 서버리스 엔드포인트.
// GCP 결제 활성화 후 Cloud Run(sentinel-api) 배포 시 VITE_API_BASE_URL만 교체하면 됨.
//
// 데이터 소스: refresh-auctions.mjs(스케줄 함수)가 매일 1회 Netlify Blobs에 저장한
// 최신 데이터를 우선 서빙하고, Blob이 없거나 24시간 이상 오래되면 mock으로 폴백한다.
import { getStore } from '@netlify/blobs';

// api/scraper.py의 _MOCK_TEMPLATE 포팅 (사건번호 접미사, 법원, 주소, 종류, 면적, 최저가, 감정가, 설명, 권리)
const TEMPLATE = [
  ['10234', '서울중앙지방법원', '서울특별시 강남구 역삼동 737-1 역삼e편한세상 101동 1502호', 'APARTMENT', 84.97, 820000000, 1050000000, '강남역 도보7분, 남향 고층', []],
  ['20518', '서울남부지방법원', '서울특별시 양천구 목동 917 목동신시가지 7단지 502동 803호', 'APARTMENT', 95.58, 680000000, 870000000, '목동 7단지, 학군우수 중층', []],
  ['31047', '서울동부지방법원', '서울특별시 송파구 잠실동 188 잠실주공5단지 403동 602호', 'APARTMENT', 76.45, 1050000000, 1380000000, '잠실 재건축 대상, 2·8호선 역세권', ['선순위임차인']],
  ['42391', '부산지방법원', '부산광역시 해운대구 우동 1480 해운대엘시티더샵 B동 3201호', 'APARTMENT', 112.30, 1250000000, 1620000000, '해운대 오션뷰, 72층 초고층', []],
  ['53820', '부산지방법원 동부지원', '부산광역시 수영구 광안동 183-2 광안리트럼프월드 203호', 'COMMERCIAL', 89.20, 480000000, 620000000, '광안리 해변상가 1층 코너, 월세280만', ['유치권']],
  ['64173', '대구지방법원', '대구광역시 수성구 범어동 1043 범어SK리더스뷰 101동 2003호', 'APARTMENT', 134.62, 620000000, 790000000, '수성구 학군 최고, 33층 전망', []],
  ['70928', '울산지방법원', '울산광역시 남구 삼산동 1396 삼산현대아파트 204동 1101호', 'APARTMENT', 84.51, 285000000, 360000000, '삼산 현대 대단지, 남향', []],
  ['81456', '울산지방법원', '울산광역시 중구 복산동 284 성안e편한세상 302동 801호', 'APARTMENT', 59.82, 175000000, 228000000, '도심 소형, 1인가구 임대수요 높음', []],
  ['92037', '광주지방법원', '광주광역시 서구 치평동 1206 광주롯데캐슬 201동 1505호', 'APARTMENT', 101.97, 320000000, 415000000, '광주 신도심 대단지, 롯데몰 인접', []],
  ['10384', '대전지방법원', '대전광역시 유성구 도룡동 451 도룡SK뷰 103동 2201호', 'APARTMENT', 114.84, 430000000, 550000000, '대덕특구 핵심, 고층 남향', []],
  ['11572', '수원지방법원', '경기도 수원시 영통구 이의동 906 광교e편한세상 204동 1201호', 'APARTMENT', 84.89, 560000000, 710000000, '광교신도시, 호수공원 도보5분', []],
  ['12841', '의정부지방법원', '경기도 남양주시 다산동 3940 다산신도시자이더스타 101동 1803호', 'APARTMENT', 74.97, 380000000, 490000000, '다산신도시, GTX-B 예정역세권', []],
  ['13926', '서울서부지방법원', '서울특별시 마포구 상암동 1605 DMC아이파크2단지 B동 901호', 'OFFICE', 165.30, 1480000000, 1850000000, 'DMC 오피스, 임차인유지 월580만', []],
  ['14703', '창원지방법원', '경상남도 창원시 성산구 상남동 87 상남상가빌딩 3층 301호', 'COMMERCIAL', 58.70, 210000000, 280000000, '창원 상남동 번화가, 장기임차인', []],
  ['15087', '인천지방법원', '인천광역시 연수구 송도동 17-1 포스코더샵퍼스트월드 A동 3501호', 'APARTMENT', 122.41, 730000000, 940000000, '송도 랜드마크, 센트럴파크뷰', []],
  ['16394', '청주지방법원', '충청북도 청주시 흥덕구 복대동 2691 테크노폴리스힐스테이트 1102호', 'APARTMENT', 84.95, 245000000, 315000000, '청주 테크노폴리스 신축, 삼성·LG', []],
  ['17628', '전주지방법원', '전라북도 전주시 완산구 효자동 763-10 효자더샵스타시티 605호', 'APARTMENT', 59.96, 145000000, 192000000, '전주 효자동 소형, 전북대병원 인근', []],
  ['18512', '대구지방법원 서부지원', '대구광역시 달서구 감삼동 1250 달서중흥S클래스 301동 1401호', 'HOUSE', 149.80, 385000000, 490000000, '달서 준주택, 개별주차 3대', ['법정지상권']],
  ['19304', '수원지방법원 안산지원', '경기도 화성시 동탄2신도시 반석로 210 반도유보라 201동 2205호', 'APARTMENT', 84.90, 440000000, 570000000, '동탄2신도시, GTX-A 동탄역 도보10분', ['선순위임차인']],
  ['20196', '부산지방법원 서부지원', '부산광역시 사하구 신평동 648-12 사하신평역세권오피스텔 805호', 'OFFICE', 36.22, 78000000, 105000000, '신평역 1분 역세권 오피스텔', []],
  ['21038', '서울중앙지방법원', '서울특별시 서초구 방배동 813 방배아트자이 201동 1301호', 'APARTMENT', 114.23, 980000000, 1240000000, '서초 방배동 브랜드, 2호선 방배역', []],
  ['22147', '부산지방법원', '부산광역시 동래구 온천동 463 동래래미안아이파크 103동 2101호', 'APARTMENT', 84.79, 390000000, 510000000, '동래온천 역세권, 남향 고층', []],
  ['23256', '인천지방법원 부천지원', '경기도 부천시 상동 535 상동아이파크 2차 304동 1202호', 'APARTMENT', 84.93, 350000000, 460000000, '부천 상동, 7호선 역세권', []],
  ['24365', '서울북부지방법원', '서울특별시 노원구 상계동 344 상계주공 8단지 702호', 'APARTMENT', 49.59, 320000000, 425000000, '노원 대단지, 4·7호선 환승', []],
  ['25474', '대전지방법원', '대전광역시 서구 둔산동 1408 둔산대림아파트 108동 1503호', 'APARTMENT', 84.80, 295000000, 388000000, '대전 둔산 핵심, 법원·행정타운 인근', []],
  ['26583', '대구지방법원', '대구광역시 북구 칠성동 240 북부상업지 근린생활시설 1층', 'COMMERCIAL', 72.10, 165000000, 220000000, '칠성시장 인근 상가 1층, 유동인구 풍부', ['유치권']],
  ['27692', '수원지방법원', '경기도 성남시 분당구 정자동 6 파크뷰 102동 805호', 'APARTMENT', 84.87, 620000000, 820000000, '분당 정자동, 신분당선 역세권', []],
  ['28801', '광주지방법원 순천지원', '전라남도 순천시 조례동 1540 순천만자이 203동 906호', 'APARTMENT', 84.72, 215000000, 278000000, '순천 신시가지, 순천만 생태공원 인근', []],
  ['29910', '대전지방법원 천안지원', '충청남도 천안시 서북구 불당동 1534 불당지웰푸르지오 101동 604호', 'APARTMENT', 84.93, 265000000, 345000000, '천안 불당동, SRT·KTX 역세권', []],
  ['30019', '부산지방법원', '부산광역시 금정구 구서동 571 부산대힐스테이트 2차 202동 1801호', 'APARTMENT', 84.95, 340000000, 440000000, '부산대역 도보5분, 대학가 임대수요', []],
];

// scraper._generate_dynamic_items 포팅: 입찰일을 오늘 기준 7~60일에 분산, 주말은 월요일로
const generateItems = () => {
  const today = new Date();
  const year = today.getFullYear();
  return TEMPLATE.map((t, i) => {
    const [suffix, court, address, propertyType, area, minBid, appraisal, desc, rights] = t;
    const offsetDays = 7 + ((i * 53 / TEMPLATE.length) | 0) % 54;
    const dt = new Date(today.getTime() + offsetDays * 86400000);
    while (dt.getDay() === 0 || dt.getDay() === 6) dt.setDate(dt.getDate() + 1);
    const caseNumber = `${year}타경${suffix}`;
    return {
      id: caseNumber,
      case_number: caseNumber,
      court,
      address,
      property_type: propertyType,
      area,
      minimum_bid: minBid,
      appraisal_value: appraisal,
      auction_date: dt.toISOString().slice(0, 10),
      description: desc,
      images: [],
      status: 'SCHEDULED',
      rights,
      risk_score: rights.length * 25,
      discount_rate: Math.round((1 - minBid / appraisal) * 1000) / 10,
      yield_rate: 0,
      risk_items: rights,
    };
  });
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });

const DAY_MS = 24 * 60 * 60 * 1000;

// refresh-auctions.mjs가 저장한 일일 데이터를 읽는다.
// 없거나(첫 배포 직후 등) 24시간 이상 오래됐으면 null 반환 → 호출부에서 mock으로 폴백.
async function getDailySnapshot() {
  try {
    const store = getStore('auctions');
    const payload = await store.get('latest.json', { type: 'json' });
    if (!payload || !Array.isArray(payload.items) || !payload.last_update) return null;
    const age = Date.now() - new Date(payload.last_update.replace(' ', 'T') + 'Z').getTime();
    if (age > DAY_MS) return null;
    return payload;
  } catch (e) {
    console.warn('[api] Blobs 조회 실패, mock으로 폴백:', e.message);
    return null;
  }
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';

  if (path === '/health') {
    const snapshot = await getDailySnapshot();
    const source = snapshot?.source || 'mock';
    return json({
      status: 'ok',
      db: Boolean(snapshot),
      // 실제 외부 데이터로 갱신된 스냅샷일 때만 true. mock 폴백 중이면 false.
      scraper: source !== 'mock',
      is_live: source !== 'mock',
      source,
      last_update: snapshot?.last_update || 'never',
      version: 'netlify-fn-1.0.0',
    });
  }

  if (path === '/auctions') {
    const region = url.searchParams.get('region') || '';
    const minPrice = Number(url.searchParams.get('min_price') || 0);
    const maxPrice = Number(url.searchParams.get('max_price') || 2_000_000_000);
    const propertyType = url.searchParams.get('property_type') || 'ALL';
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20)));

    const snapshot = await getDailySnapshot();
    let items = snapshot ? snapshot.items : generateItems();
    // "서울 강남"처럼 여러 키워드를 넣으면 모두 만족하는 물건만 남긴다(AND).
    // some()이면 "서울"만 걸려도 통과해 강남 필터가 무시된다.
    if (region.trim()) {
      const keywords = region.trim().split(/\s+/);
      items = items.filter((it) =>
        keywords.every((k) => it.address.includes(k) || it.court.includes(k))
      );
    }
    if (propertyType && propertyType !== 'ALL') {
      items = items.filter((it) => it.property_type === propertyType);
    }
    items = items.filter((it) => it.minimum_bid >= minPrice && it.minimum_bid <= maxPrice);

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    return json({
      items: items.slice(start, start + limit),
      total,
      page,
      total_pages: totalPages,
      has_more: page < totalPages,
      source: snapshot?.source || 'mock',
      last_update: snapshot?.last_update || null,
    });
  }

  const reportMatch = path.match(/^\/report\/(.+)$/);
  if (reportMatch) {
    const caseNumber = decodeURIComponent(reportMatch[1]);
    const snapshot = await getDailySnapshot();
    const items = snapshot ? snapshot.items : generateItems();
    const item = items.find((it) => it.case_number === caseNumber);
    if (!item) return json({ detail: `사건번호 ${caseNumber}를 찾을 수 없습니다.` }, 404);
    const expectedProfit = item.appraisal_value - item.minimum_bid;
    return json({
      case_number: item.case_number,
      address: item.address,
      area: item.area,
      appraisal_value: item.appraisal_value,
      minimum_bid: item.minimum_bid,
      auction_date: item.auction_date,
      risk_items: item.risk_items,
      risk_score: item.risk_score,
      expected_profit: expectedProfit,
      profit_rate: Math.round((expectedProfit / item.minimum_bid) * 1000) / 10,
      overall_score: Math.max(0, Math.min(100, Math.round(item.discount_rate * 3 - item.risk_score))),
      recommendation: item.risk_score > 0 ? '권리 관계 확인 후 신중 입찰' : '안전 물건, 입찰 추천',
    });
  }

  if (path === '/regions') {
    const regions = ['서울', '경기', '인천', '부산', '대구', '울산', '광주', '대전', '경남', '전북', '충북', '충남', '전남'];
    return json({ regions: regions.map((name) => ({ id: name, name, courts: [] })) });
  }

  return json({ detail: 'Not Found' }, 404);
};

export const config = {
  path: '/api/*',
};
