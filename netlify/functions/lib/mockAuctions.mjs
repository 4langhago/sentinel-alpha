// 공매 샘플 데이터
//
// ONBID_API_KEY가 없거나 아직 한 번도 수집하지 않은 환경에서도 화면 구조를
// 확인할 수 있게 하는 폴백이다. 실거래의 mockTrades.mjs와 같은 역할이며,
// 응답의 is_live=false와 화면의 "샘플 데이터" 배지로 항상 구분된다.
//
// 값의 형태(금액 단위 원, ISO 일시, 체감률)는 실제 응답과 똑같이 맞춰 두었다 —
// 샘플에서만 통하는 렌더링 코드가 생기지 않게 하려는 것이다.
import { detailUrl } from './onbid.mjs'

const SEED = [
  { name: '서울특별시 마포구 연남동 245-42 삼정도나빌 제2층 제204호', sido: '서울', sgg: '마포구', umd: '연남동', code: '11440', mcls: '주거용건물', scls: '빌라', pt: 'ETC', app: 285_000_000, rate: 0.7, area: 42.6, land: 0 },
  { name: '경기도 성남시 분당구 정자동 178 아이파크분당 제10층 제1003호', sido: '경기', sgg: '성남시 분당구', umd: '정자동', code: '41135', mcls: '주거용건물', scls: '아파트', pt: 'APARTMENT', app: 1_240_000_000, rate: 0.8, area: 84.9, land: 0 },
  { name: '부산광역시 해운대구 우동 1407 산 12-3', sido: '부산', sgg: '해운대구', umd: '우동', code: '26350', mcls: '토지', scls: '임야', pt: 'LAND', app: 96_400_000, rate: 0.5, area: 0, land: 1320 },
  { name: '인천광역시 서구 청라동 155-1 청라프라자 제1층 제105호', sido: '인천', sgg: '서구', umd: '청라동', code: '28275', mcls: '상가용및업무용건물', scls: '근린생활시설', pt: 'COMMERCIAL', app: 410_000_000, rate: 0.64, area: 58.2, land: 0 },
  { name: '대구광역시 수성구 범어동 78-4 범어오피스텔 제7층 제701호', sido: '대구', sgg: '수성구', umd: '범어동', code: '27260', mcls: '용도복합용건물', scls: '오피스텔', pt: 'OFFICETEL', app: 178_000_000, rate: 0.9, area: 33.1, land: 0 },
  { name: '충청남도 아산시 탕정면 명암리 512-8', sido: '충남', sgg: '아산시', umd: '탕정면', code: '44200', mcls: '토지', scls: '전', pt: 'LAND', app: 52_300_000, rate: 0.4, area: 0, land: 860 },
]

const DIVISIONS = ['압류재산', '기타일반재산', '국유재산', '공유재산']
const DIV_CODES = ['0007', '0005', '0010', '0002']

/** 샘플 물건 목록을 만든다. 날짜는 호출 시점 기준이라 항상 "지금 진행 중"으로 보인다. */
export function generateAuctions(count = 48) {
  const now = Date.now()
  const seenAt = new Date(now).toISOString()
  const out = []

  for (let i = 0; i < count; i++) {
    const s = SEED[i % SEED.length]
    const round = (i % 6) + 1
    // 회차가 올라갈수록 최저가가 떨어지는 실제 공매 흐름을 흉내낸다.
    const rate = Math.max(0.2, s.rate - (round - 1) * 0.1)
    const minBid = Math.round((s.app * rate) / 10_000) * 10_000
    // 절반은 진행 중, 절반은 예정으로 흩어 마감임박 필터가 동작하는지 볼 수 있게 한다.
    const startOffset = (i % 12) - 4 // -4 ~ +7일
    const start = new Date(now + startOffset * 86_400_000)
    const end = new Date(start.getTime() + 2 * 86_400_000)
    const status = startOffset > 0 ? 'SCHEDULED' : 'OPEN'

    const item = {
      id: `SAMPLE-${2020 + (i % 5)}-${1000 + i}-${i}`,
      cltr_mng_no: `SAMPLE-${2020 + (i % 5)}-${1000 + i}`,
      pbct_cdtn_no: String(6_000_000 + i),
      onbid_cltr_no: String(2_000_000 + i),
      onbid_pbanc_no: String(900_000 + i),
      pbct_no: String(10_000_000 + i),
      bid_round: round,
      name: s.name,
      sgg_code: s.code,
      sido: s.sido,
      sgg: s.sgg,
      umd: s.umd,
      region_name: `${s.sido} ${s.sgg}`,
      address: `${s.sido} ${s.sgg} ${s.umd}`,
      prpt_div_code: DIV_CODES[i % DIV_CODES.length],
      prpt_div: DIVISIONS[i % DIVISIONS.length],
      disposal: '매각',
      use_mcls_code: '',
      use_mcls: s.mcls,
      use_scls: s.scls,
      property_type: s.pt,
      land_area: s.land,
      area: s.area,
      appraisal_price: s.app,
      min_bid_price: minBid,
      min_bid_undisclosed: false,
      discount_rate: Math.round(rate * 1000) / 10,
      fail_count: round - 1,
      private_contract: i % 7 === 0,
      bid_start_at: start.toISOString(),
      bid_end_at: end.toISOString(),
      bid_status_code: status === 'OPEN' ? '0002' : '0001',
      bid_status: status === 'OPEN' ? '입찰진행중' : '입찰준비중',
      status,
      org_name: '한국자산관리공사',
      request_org: '샘플세무서',
      first_seen_at: seenAt,
      last_seen_at: seenAt,
    }
    item.detail_url = detailUrl(item)
    out.push(item)
  }
  return out
}
