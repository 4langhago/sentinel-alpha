// 온비드 공매 물건 도메인 타입
//
// TradeItem과 의도적으로 분리했다. 실거래는 "이미 체결된 과거의 사실"이라 불변이지만,
// 공매는 "앞으로 돈을 걸 수 있는 미래 일정"이다 — 회차마다 최저가가 떨어지고,
// 유찰·낙찰·취소로 상태가 바뀌며, 입찰이 끝나면 원본 API에서 사라진다.
// 두 타입을 합치면 실거래 중위가·평당가 통계가 공매 최저가에 오염된다.
//
// 금액은 전부 원 단위, 일시는 전부 ISO 문자열(타임존 포함)이다.
// (2026-08-31 실제 API 응답으로 확인 — 온비드는 원 단위이고 국토부처럼 만원 단위가 아니다.)

/** 우리가 판정하는 3단계 상태. 온비드의 12가지 입찰결과코드를 접은 것이다. */
export type AuctionStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED'

export const AUCTION_STATUS_LABELS: Record<AuctionStatus, string> = {
  SCHEDULED: '입찰예정',
  OPEN: '입찰진행중',
  CLOSED: '마감',
}

export interface AuctionItem {
  /** "물건관리번호-공매조건번호". 회차가 바뀌면 공매조건번호가 바뀌어 스냅샷이 나란히 쌓인다. */
  id: string
  cltr_mng_no: string
  pbct_cdtn_no: string
  onbid_cltr_no: string
  onbid_pbanc_no: string
  pbct_no: string
  /** 회차 (유찰되며 올라간다) */
  bid_round: number

  /** 물건명. 공매는 단지명이 아니라 소재지 문자열인 경우가 대부분이다. */
  name: string
  /** 시군구 법정동코드 5자리. PNU에서 뽑아내 실거래와 정확히 조인된다. 없을 수 있다. */
  sgg_code: string
  sido: string
  sgg: string
  umd: string
  region_name: string
  address: string

  prpt_div_code: string
  /** 압류재산 / 국유재산 / 기타일반재산 / 공유재산 */
  prpt_div: string
  /** 매각 / 임대 */
  disposal: string
  use_mcls_code: string
  /** 용도 중분류: 토지 / 주거용건물 / 상가용및업무용건물 … */
  use_mcls: string
  /** 용도 소분류: 임야 / 아파트 / 근린생활시설 … */
  use_scls: string
  /** 실거래 종목으로 매핑한 것. 대응이 없으면 'ETC'. */
  property_type: 'APARTMENT' | 'OFFICETEL' | 'COMMERCIAL' | 'LAND' | 'ETC'

  /** 건물면적 (㎡) */
  area: number
  /** 토지면적 (㎡) */
  land_area: number

  /** 감정평가금액 (원) */
  appraisal_price: number
  /** 최저입찰가 (원). 비공개면 0이고 min_bid_undisclosed가 true다. */
  min_bid_price: number
  /** 최저입찰가가 비공개인 물건. 0원 물건이 아니라 "값을 모르는" 물건이다. */
  min_bid_undisclosed: boolean
  /** 감정가 대비 최저입찰가 비율(%). 경공매의 핵심 지표. 산출 불가면 null. */
  discount_rate: number | null
  /** 유찰 횟수 */
  fail_count: number
  private_contract: boolean
  /**
   * 지분 매각 여부. 지분만 낙찰받으면 단독 처분·개발이 불가능해
   * 공유자와 협의하거나 소송을 거쳐야 한다 — 싸 보이는 이유가 여기 있는 경우가 많다.
   */
  share_deal?: boolean
  /** 입찰방식 (일반경쟁 / 제한경쟁 / 지명경쟁 / 수의계약) */
  bid_method?: string
  /** 입찰구분 (전자입찰 / 현장입찰) */
  bid_div?: string
  /**
   * 명도책임 주체. "매수자"면 명도 부담이 낙찰자에게 있다는 뜻이다.
   * 공매는 인도명령이 없어 협의 불발 시 명도소송(5~6개월)을 해야 한다.
   */
  eviction_responsibility?: string
  /** 배분요구종기일 */
  distribution_deadline?: string

  bid_start_at: string
  bid_end_at: string

  bid_status_code: string
  /** 온비드 원문 표기 (입찰준비중 / 입찰진행중 / 유찰 …) */
  bid_status: string
  status: AuctionStatus

  org_name: string
  request_org: string

  /**
   * 우리가 이 물건을 처음/마지막으로 확인한 시각.
   * 온비드는 끝난 물건을 더 이상 주지 않으므로 우리 스냅샷이 유일한 이력이다.
   * last_seen_at은 화면에 반드시 노출한다 — 입찰 마감 정보가 틀리면 실질적 피해가 난다.
   */
  first_seen_at: string
  last_seen_at: string
  /** 이번 수집에서 사라진 것을 감지한 시각(CLOSED 처리 시점) */
  closed_detected_at?: string

  /** 온비드 원문 링크. 최종 확인은 반드시 원문에서 하도록 카드마다 건다. */
  detail_url: string
}

export interface AuctionFacets {
  use_types?: { value: string; count: number }[]
  /** 용도 소분류. 중분류를 고른 뒤의 목록에서 센 값이다. */
  use_sub_types?: { value: string; count: number }[]
  divisions?: { value: string; count: number }[]
  /** 입찰방식(일반경쟁/수의계약 등). 온비드 고유 축이다. */
  bid_methods?: { name: string; count: number }[]
  /** 잘린 범위(전국·시도 최신 N건)에서 낸 집계인지. true면 확정치처럼 보여주면 안 된다. */
  approximate?: boolean
}

export interface AuctionSearchResult {
  items: AuctionItem[]
  total: number
  page: number
  totalPages: number
  hasMore: boolean
  source: string
  isLive: boolean
  lastUpdate: string | null
  scope: string
  scopeTruncated: boolean
  scopeSize: number
  facets?: AuctionFacets
}

export interface AuctionStats {
  count: number
  openCount: number
  closedCount: number
  medianMinBid?: number
  medianAppraisal?: number
  medianDiscountRate?: number
  pricedCount?: number
  divisionTotals?: Record<string, number>
  useTotals?: Record<string, number>
  source: string
  isLive: boolean
  lastUpdate: string | null
  message?: string
}

export type AuctionSort =
  | 'deadline'
  | 'price_asc'
  | 'price_desc'
  | 'discount_asc'
  | 'fail_desc'
  | 'appraisal_desc'
  | 'area_desc'

export const AUCTION_SORT_LABELS: Record<AuctionSort, string> = {
  deadline: '마감임박순',
  discount_asc: '체감률 낮은순',
  price_asc: '최저가 낮은순',
  price_desc: '최저가 높은순',
  fail_desc: '유찰 많은순',
  appraisal_desc: '감정가 높은순',
  area_desc: '면적 넓은순',
}

export interface AuctionSearchParams {
  q?: string
  sido?: string
  /** 시군구 다중 선택. 인접 구를 묶어 보는 것이 경공매의 일반적인 탐색 방식이다. */
  sggCodes?: string[]
  /** 용도 중분류명 다중 선택 (토지 / 주거용건물 / 상가·업무용 …) */
  useTypes?: string[]
  /** 용도 소분류명 다중 선택 (아파트 / 빌라 / 임야 …) */
  useSubTypes?: string[]
  /** 재산유형명 다중 선택 */
  divisions?: string[]
  /** 최저입찰가 범위 (원) */
  minPrice?: number
  maxPrice?: number
  /** 감정평가액 범위 (원). 최저입찰가와 별개 조건이다. */
  minAppraisal?: number
  maxAppraisal?: number
  /** 대표면적 범위 (㎡) */
  minArea?: number
  maxArea?: number
  /**
   * 감정가 대비 체감률 범위(%).
   * 지지옥션·태인이 "감정가대비"를 하한~상한 범위로 받는 것을 따랐다 —
   * 상한만 있으면 "너무 싼 것(=문제 있는 물건)"을 걸러낼 수 없다.
   */
  minDiscount?: number
  maxDiscount?: number
  /** 유찰 횟수 범위. 타 사이트도 0~10회 범위로 받는다. */
  minFailCount?: number
  maxFailCount?: number
  privateContract?: boolean
  /**
   * 지분 매각 물건 제외.
   * 포함/제외 중 제외만 두는 이유는, 지분을 일부러 찾는 것은 소수의 전략이고
   * 대부분의 사용자에게는 "싸 보이는 함정"을 걷어내는 쪽이 필요하기 때문이다.
   */
  excludeShare?: boolean
  /** 입찰방식 다중 선택 (일반경쟁 / 수의계약 …) */
  bidMethods?: string[]
  /** 남은 일수 이내에 마감되는 물건만 */
  deadlineDays?: number
  status?: 'ACTIVE' | 'ALL' | AuctionStatus
  sort?: AuctionSort
  page?: number
  limit?: number
}

/**
 * 지금 몇 개의 조건이 걸려 있는가.
 *
 * filterRules.ts가 실거래에서 얻은 교훈을 그대로 따른다 — 화면 두 곳(필터의 활성
 * 개수 배지, 목록 상단의 조건 칩)이 각자 세면 반드시 어긋난다. 계산을 여기 한 곳에
 * 두고 양쪽이 같은 배열을 쓴다. (실거래의 filterRules를 그대로 import하지 않는 이유는
 * 그쪽이 PropertyType 기반이라, 재사용하려면 공매 개념을 TradeItem 타입에 끼워넣게
 * 되어 두 도메인을 분리한 결정과 정면으로 충돌하기 때문이다.)
 */
export const auctionActiveConditions = (p: AuctionSearchParams): string[] => {
  const out: string[] = []
  if (p.q) out.push(`검색어 "${p.q}"`)
  if (p.sido) out.push(p.sido)
  if (p.sggCodes?.length) out.push(`시군구 ${p.sggCodes.length}곳`)
  if (p.useTypes?.length) out.push(p.useTypes.join('·'))
  if (p.useSubTypes?.length) out.push(p.useSubTypes.join('·'))
  if (p.divisions?.length) out.push(p.divisions.join('·'))
  if (p.minPrice || p.maxPrice) out.push('최저입찰가')
  if (p.minAppraisal || p.maxAppraisal) out.push('감정가')
  if (p.minArea || p.maxArea) out.push('면적')
  if (p.minDiscount && p.maxDiscount) out.push(`감정가의 ${p.minDiscount}~${p.maxDiscount}%`)
  else if (p.maxDiscount) out.push(`감정가의 ${p.maxDiscount}% 이하`)
  else if (p.minDiscount) out.push(`감정가의 ${p.minDiscount}% 이상`)
  if (p.minFailCount && p.maxFailCount) out.push(`유찰 ${p.minFailCount}~${p.maxFailCount}회`)
  else if (p.minFailCount) out.push(`유찰 ${p.minFailCount}회 이상`)
  else if (p.maxFailCount !== undefined) out.push(`유찰 ${p.maxFailCount}회 이하`)
  if (p.privateContract) out.push('수의계약 가능')
  if (p.excludeShare) out.push('지분 제외')
  if (p.bidMethods?.length) out.push(p.bidMethods.join('·'))
  if (p.deadlineDays) out.push(`${p.deadlineDays}일 이내 마감`)
  if (p.status && p.status !== 'ACTIVE') out.push('마감 물건 포함')
  return out
}

/**
 * 남은 시간을 "D-3" / "오늘 마감" / "마감" 으로.
 * 공매에서 가장 급한 정보라 카드에서 가장 눈에 띄어야 한다.
 * @returns days가 음수면 이미 지난 것
 */
export const remainingDays = (isoEnd: string): number | null => {
  if (!isoEnd) return null
  const end = new Date(isoEnd).getTime()
  if (Number.isNaN(end)) return null
  return Math.ceil((end - Date.now()) / 86_400_000)
}

/** ISO 일시를 "12/16 17:00" 형태로 (한국 시간 기준) */
export const formatBidTime = (iso: string): string => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 이 물건의 대표 면적. 토지 물건은 land_area만, 건물 물건은 area만 채워지는 경우가
 * 많아 "면적 0㎡"로 보이는 칸이 생긴다. 둘 중 값이 있는 쪽을 라벨과 함께 고른다.
 */
export const primaryArea = (item: AuctionItem): { label: string; sqm: number } | null => {
  if (item.area > 0) return { label: '건물', sqm: item.area }
  if (item.land_area > 0) return { label: '토지', sqm: item.land_area }
  return null
}
