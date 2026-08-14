// 국토교통부 실거래가 기반 도메인 타입

export type PropertyType = 'APARTMENT' | 'OFFICETEL' | 'COMMERCIAL' | 'LAND'

export const PROPERTY_LABELS: Record<PropertyType, string> = {
  APARTMENT: '아파트',
  OFFICETEL: '오피스텔',
  COMMERCIAL: '상가·사무실',
  LAND: '토지',
}
export type DealType = 'TRADE' | 'RENT'
export type RentType = 'JEONSE' | 'MONTHLY' | null

export interface TradeItem {
  id: string
  /** 단지명 (아파트/오피스텔 이름) */
  name: string
  sgg_code: string
  sido: string
  sgg: string
  /** "서울 강남구" */
  region_name: string
  /** 법정동 */
  umd: string
  jibun: string
  address: string
  /** 도로명 (아파트 매매 상세자료에만 존재) */
  road_name?: string
  /** '중개거래' | '직거래' (아파트 매매 상세자료에만 존재) */
  dealing_type?: string
  /** 상가는 건물주용도(제2종근린생활시설 등), 토지는 지목 */
  use_type?: string
  /** 지분 거래 여부. 면적당 단가가 왜곡되므로 통계에서 제외된다. */
  share_deal?: boolean
  /** 상가의 대지면적 (㎡) */
  land_area?: number
  property_type: PropertyType
  deal_type: DealType
  rent_type: RentType
  /** 전용면적 (㎡) */
  area: number
  floor: number
  build_year: number
  /** YYYY-MM-DD */
  deal_date: string
  /** 매매가 또는 전월세 보증금 (원) */
  price: number
  /** 월세 (원). 전세면 0 */
  monthly_rent: number
  /** 3.3㎡당 가격 (원) */
  price_per_pyeong: number
}

export interface TradeSearchResult {
  items: TradeItem[]
  total: number
  page: number
  totalPages: number
  hasMore: boolean
  source: string
  isLive: boolean
  lastUpdate: string | null
  /** 검색이 이루어진 범위: 시군구 전체 / 시도 최신 일부 / 전국 최신 일부 */
  scope: 'sgg' | 'sido' | 'recent' | 'sample' | string
  /** true면 해당 범위의 최신 일부만 검색한 결과 */
  scopeTruncated: boolean
  /** 검색 대상이 된 건수 */
  scopeSize: number
}

export interface TrendPoint {
  month: string
  count: number
  median_per_pyeong: number
}

export interface RegionStats {
  count: number
  median_price: number
  avg_price: number
  min_price: number
  max_price: number
  median_per_pyeong: number
  /**
   * 종목별 평당가. 아파트·오피스텔·상가·토지는 평당가 스케일이 달라서
   * "지역 중위 대비 %"를 낼 때는 같은 종목끼리 비교해야 한다.
   * 인덱스가 갱신되기 전이면 없을 수 있다.
   */
  per_property?: Partial<Record<PropertyType, { count: number; median_per_pyeong: number }>>
  trend: TrendPoint[]
  source: string
  is_live: boolean
  last_update: string | null
  message?: string
}

/**
 * 거래 한 건을 비교할 기준 평당가를 고른다.
 * 같은 종목의 중위값이 있으면 그것을, 없으면 전체 중위값으로 되돌아간다.
 */
export const baselinePerPyeong = (
  stats: Pick<RegionStats, 'median_per_pyeong' | 'per_property'> | undefined,
  propertyType: PropertyType
): number => {
  if (!stats) return 0
  const own = stats.per_property?.[propertyType]
  if (own && own.count > 0 && own.median_per_pyeong > 0) return own.median_per_pyeong
  return stats.median_per_pyeong || 0
}

export interface ComplexDetail {
  name: string
  region_name: string
  address: string
  property_type: PropertyType
  build_year: number
  trade_count: number
  median_price: number
  median_per_pyeong: number
  latest_deal_date: string
  history: TradeItem[]
  source: string
  is_live: boolean
  last_update: string | null
}

export interface SidoRegion {
  sido: string
  sggs: { code: string; name: string }[]
}

/** 지도 타일 히트맵용 배치 집계 1건 (시도 또는 시군구 단위) */
export interface RegionTileStat {
  /** 시도명 또는 시군구 법정동코드 */
  code: string
  name: string
  count: number
  median_price: number
  median_per_pyeong: number
}

export interface TradeSearchParams {
  q?: string
  sido?: string
  sggCode?: string
  propertyType?: PropertyType | 'ALL'
  dealType?: DealType | 'ALL'
  minPrice?: number
  maxPrice?: number
  minArea?: number
  maxArea?: number
  buildYearMin?: number
  sort?: 'recent' | 'price_desc' | 'price_asc' | 'area_desc' | 'pyeong_desc' | 'pyeong_asc'
  page?: number
  limit?: number
}

export const SORT_LABELS: Record<NonNullable<TradeSearchParams['sort']>, string> = {
  recent: '최신 거래순',
  price_desc: '가격 높은순',
  price_asc: '가격 낮은순',
  area_desc: '면적 넓은순',
  pyeong_desc: '평당가 높은순',
  pyeong_asc: '평당가 낮은순',
}

/** ㎡ → 평 */
export const toPyeong = (area: number): number => Math.round((area / 3.305785) * 10) / 10

/** 원 단위 금액을 "12억 3,400만원" 형태로 */
export const formatPrice = (won: number): string => {
  if (!won) return '-'
  const eok = Math.floor(won / 100_000_000)
  const man = Math.floor((won % 100_000_000) / 10_000)
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`
  return `${man.toLocaleString()}만원`
}
