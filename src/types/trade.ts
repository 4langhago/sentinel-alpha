// 국토교통부 실거래가 기반 도메인 타입

export type PropertyType = 'APARTMENT' | 'OFFICETEL'
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
  trend: TrendPoint[]
  source: string
  is_live: boolean
  last_update: string | null
  message?: string
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
