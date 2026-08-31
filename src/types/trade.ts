// 국토교통부 실거래가 기반 도메인 타입

export type PropertyType = 'APARTMENT' | 'OFFICETEL' | 'COMMERCIAL' | 'LAND'

export const PROPERTY_LABELS: Record<PropertyType, string> = {
  APARTMENT: '아파트',
  OFFICETEL: '오피스텔',
  COMMERCIAL: '상가·사무실',
  LAND: '토지',
}
/**
 * "단지"가 실재해 단지 상세로 묶어도 되는 종목.
 *
 * 상가·토지는 단지가 아니라 필지 단위라 name이 국토부가 끝자리를 가린
 * 지번("청운동 9*")이다. 이걸 키로 이력을 묶으면 서로 다른 땅의 거래가 한
 * 화면에 섞인다 — 마스킹된 이름 5,091개 중 1,001개가 서로 다른 시군구로
 * 동시에 매핑됐다(예: "신당동 3**" → 서울 중구 + 충남 아산).
 * 서버도 같은 이유로 이 종목들에는 단지 상세를 주지 않는다.
 */
export const COMPLEX_TYPES: PropertyType[] = ['APARTMENT', 'OFFICETEL']
export const hasComplexPage = (pt: PropertyType): boolean => COMPLEX_TYPES.includes(pt)

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
  /** 현재 조건 하 종목별·용도별 건수. 서버가 아직 안 주면 undefined. */
  facets?: TradeFacets
}

export interface TrendPoint {
  month: string
  count: number
  median_per_pyeong: number
}

export interface RegionStats {
  count: number
  /**
   * 이 통계가 전체가 아니라 "최신 N건" 표본에서 나온 것인지.
   * 검색어를 붙이면 사전 계산치 대신 잘린 샤드에서 다시 계산하므로
   * 서울 18,572건이 441건으로 줄어든다 — 사용자가 급감을 시세 변화로
   * 오해하지 않게 화면이 반드시 밝혀야 한다.
   */
  scope_truncated?: boolean
  scope_size?: number
  /** 전국 통계처럼 지역별 중위값을 가중평균한 근사치인지 */
  approximate?: boolean
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
  /**
   * 건물용도(상가) 또는 지목(토지) 다중 선택. 서버에는 콤마로 이어 보낸다.
   * 아파트·오피스텔에는 use_type이 없어 이 조건이 의미가 없다.
   */
  useTypes?: string[]
  /** 상가 연면적 / 토지 대지면적 범위 (㎡). 전용면적(area)과는 다른 컬럼이다. */
  minLandArea?: number
  maxLandArea?: number
  /** 지분거래 제외. 지분거래는 면적당 단가가 왜곡돼 시세 비교를 망친다. */
  excludeShare?: boolean
  sort?: 'recent' | 'price_desc' | 'price_asc' | 'area_desc' | 'pyeong_desc' | 'pyeong_asc'
  page?: number
  limit?: number
}

/**
 * 현재 조건 하에서 각 값이 몇 건인지 알려주는 서버 집계.
 * 용도 칩은 종목마다 값 목록이 완전히 달라서(상가는 근린생활시설…, 토지는 전·답·대…)
 * 프론트에 하드코딩할 수 없다. 그래서 서버가 준 상위 목록을 그대로 칩으로 만든다.
 */
export interface TradeFacets {
  property?: Partial<Record<PropertyType, number>>
  use_types?: { value: string; count: number }[]
  /**
   * 이 집계가 잘린 범위(전국·시도 최신 N건)에서 나왔는지.
   * true면 종목별 건수가 실제보다 훨씬 작으므로 확정치처럼 보여주면 안 된다.
   */
  approximate?: boolean
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

/**
 * 실거래가는 전용면적만 제공한다. 하지만 사람들이 일상적으로 부르는
 * "OO평"(예: 34평 아파트)은 전용면적이 아니라 공급면적(전용+공용+주차장 등)
 * 기준이라, 전용면적을 그대로 평으로 환산한 값과는 다르다.
 * 예: 전용 84.98㎡는 흔히 "34평형"으로 불리지만 전용면적만 평으로
 * 바꾸면 25.7평이 되어 훨씬 작아 보인다 — 이 괴리가 사용자 혼란의 원인.
 *
 * 단지·세대별 실제 전용률(전용면적/공급면적)은 제각각이라 정확히 계산할
 * 수 없다. 아파트·오피스텔의 통상적인 평균 전용률로 근사한 "통상 평형"을
 * 별도로 보여줘 실제 매물 정보와 비교할 기준을 준다. 상가·토지는 이런
 * 관행적 표준 전용률이 없어 추정하지 않는다.
 *
 * @returns 통상적으로 불리는 평형(정수), 추정할 수 없으면 null
 */
const SUPPLY_RATIO: Partial<Record<PropertyType, number>> = {
  APARTMENT: 0.75, // 예: 전용 84㎡ → 약 34평형("국민평형")
  OFFICETEL: 0.5, // 오피스텔은 전용률이 아파트보다 훨씬 낮다(통상 40~55%)
}
export const estimateSupplyPyeong = (area: number, propertyType: PropertyType): number | null => {
  const ratio = SUPPLY_RATIO[propertyType]
  if (!ratio || area <= 0) return null
  return Math.round(area / 3.305785 / ratio)
}

/**
 * 면적 표기 단위. 실거래 원본은 ㎡뿐이지만 한국 사용자는 평으로 감을 잡고,
 * 매물 광고는 공급면적 기준 "평형"으로 부른다. 세 표기를 한 줄에 다 늘어놓으면
 * 오히려 읽기 어려워, 하나를 골라 통일하고 나머지는 툴팁으로 남긴다.
 */
export type AreaUnit = 'sqm' | 'pyeong' | 'supply'

/**
 * 종목별 면적의 이름. 실거래 원본은 모두 area 한 컬럼이지만 의미가 다르다 —
 * 주거용은 전용면적, 상가는 건물 연면적, 토지는 대지(거래)면적이다.
 * 전부 "전용면적"이라 쓰면 토지·상가에서 틀린 설명이 된다.
 */
export const AREA_NAME: Record<PropertyType, string> = {
  APARTMENT: '전용',
  OFFICETEL: '전용',
  COMMERCIAL: '연면적',
  LAND: '대지',
}

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sqm: '㎡',
  pyeong: '평(전용)',
  supply: '평형(공급추정)',
}

/**
 * 선택한 단위 하나로 면적을 표기한다.
 * 공급평형은 아파트·오피스텔에만 추정값이 있으므로(estimateSupplyPyeong가 null),
 * 상가·토지에서 'supply'를 골라도 전용 평으로 폴백해 빈칸이 생기지 않게 한다.
 *
 * @returns text = 화면에 찍을 문자열, title = 나머지 표기를 모아둔 툴팁
 */
export const formatArea = (
  area: number,
  propertyType: PropertyType,
  unit: AreaUnit
): { text: string; title: string } => {
  const pyeong = toPyeong(area)
  const supply = estimateSupplyPyeong(area, propertyType)
  const name = AREA_NAME[propertyType]
  const parts = [`${name} ${area}㎡`, `${name} ${pyeong}평`]
  if (supply !== null) parts.push(`통상 ${supply}평형(공급면적 기준 추정)`)
  const title = parts.join(' · ')

  if (unit === 'sqm') return { text: `${area}㎡`, title }
  if (unit === 'supply' && supply !== null) return { text: `${supply}평형`, title }
  return { text: `${pyeong}평`, title }
}

/**
 * 공급면적 기준 평형("34평형") → 전용면적(㎡). estimateSupplyPyeong의 역함수다.
 * 필터 구간 경계를 만들 때 쓰며, 표시와 같은 전용률을 써야 카드에 "30평형"이라
 * 찍힌 매물이 "30평대" 필터에 걸린다.
 */
export const supplyPyeongToArea = (supplyPyeong: number, propertyType: PropertyType): number => {
  const ratio = SUPPLY_RATIO[propertyType] ?? 0.75
  return Math.round(supplyPyeong * 3.305785 * ratio)
}

/** 원 단위 금액을 "12억 3,400만원" 형태로 */
export const formatPrice = (won: number): string => {
  if (!won) return '-'
  const eok = Math.floor(won / 100_000_000)
  const man = Math.floor((won % 100_000_000) / 10_000)
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`
  return `${man.toLocaleString()}만원`
}
