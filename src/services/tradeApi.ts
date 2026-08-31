// 실거래가 API 클라이언트
import axios from 'axios'
import {
  TradeItem,
  TradeSearchParams,
  TradeSearchResult,
  RegionStats,
  ComplexDetail,
  SidoRegion,
  RegionTileStat,
  TradeFacets,
  PropertyType,
  DealType,
} from '../types/trade'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export interface SystemHealth {
  status: string
  db: boolean
  is_live: boolean
  source: string
  last_update: string | null
  total_items: number
  months: string[] | null
  version: string
}

const toQuery = (params: TradeSearchParams) => ({
  q: params.q || undefined,
  sido: params.sido || undefined,
  sgg_code: params.sggCode || undefined,
  property_type: params.propertyType || undefined,
  deal_type: params.dealType || undefined,
  min_price: params.minPrice,
  max_price: params.maxPrice,
  // 상가 연면적·토지 대지면적은 별도 컬럼이 아니라 area에 들어온다.
  // (토지의 land_area는 전량 0, 상가는 23.7%만 값이 있어 범위 조건으로 쓸 수 없다.)
  // 종목을 바꾸면 sanitizeForPropertyType이 반대쪽을 지우므로 둘이 동시에 차 있지 않다.
  min_area: params.minArea ?? params.minLandArea,
  max_area: params.maxArea ?? params.maxLandArea,
  build_year_min: params.buildYearMin,
  // 용도(상가 건물용도 / 토지 용도지역)는 다중 선택이라 콤마로 이어 보낸다.
  use_type: params.useTypes && params.useTypes.length > 0 ? params.useTypes.join(',') : undefined,
  // 서버는 존재 여부로 판단하므로 켰을 때만 보낸다(0을 보내면 "제외 안 함"과 구분이 안 된다).
  exclude_share: params.excludeShare ? 1 : undefined,
  sort: params.sort || undefined,
  page: params.page || 1,
  limit: params.limit || 20,
})

export const tradeApi = {
  /** 실거래 검색 */
  search: async (params: TradeSearchParams = {}): Promise<TradeSearchResult> => {
    const res = await axios.get(`${API_BASE_URL}/trades`, {
      params: toQuery(params),
      timeout: 10_000,
    })
    const d = res.data
    return {
      items: (d.items || []) as TradeItem[],
      total: d.total || 0,
      page: d.page || 1,
      totalPages: d.total_pages || 1,
      hasMore: Boolean(d.has_more),
      source: d.source || 'unknown',
      isLive: Boolean(d.is_live),
      lastUpdate: d.last_update ?? null,
      scope: d.scope || 'unknown',
      scopeTruncated: Boolean(d.scope_truncated),
      scopeSize: d.scope_size || 0,
      // facets는 서버 배포가 끝나기 전까지 없을 수 있다. 없으면 undefined로 두고
      // 화면에서 용도 칩 섹션 자체를 숨긴다(빈 칩 줄이 남지 않게).
      facets: (d.facets as TradeFacets | undefined) || undefined,
    }
  },

  /** 지역 시세 통계 + 월별 추이 */
  stats: async (
    params: {
      sido?: string
      sggCode?: string
      q?: string
      /** 요약 통계를 현재 보고 있는 종목/거래유형에 맞춘다. 'ALL'이면 서버에 보내지 않는다. */
      propertyType?: PropertyType | 'ALL'
      dealType?: DealType | 'ALL'
    } = {}
  ): Promise<RegionStats | null> => {
    try {
      const res = await axios.get(`${API_BASE_URL}/stats`, {
        params: {
          sido: params.sido || undefined,
          sgg_code: params.sggCode || undefined,
          q: params.q || undefined,
          property_type: params.propertyType && params.propertyType !== 'ALL' ? params.propertyType : undefined,
          deal_type: params.dealType && params.dealType !== 'ALL' ? params.dealType : undefined,
        },
        timeout: 10_000,
      })
      return res.data as RegionStats
    } catch (e) {
      console.warn('[tradeApi] 시세 통계 조회 실패:', e)
      return null
    }
  },

  /** 단지 상세 + 거래 이력 */
  complex: async (name: string): Promise<ComplexDetail | null> => {
    try {
      const res = await axios.get(`${API_BASE_URL}/complex/${encodeURIComponent(name)}`, { timeout: 10_000 })
      return res.data as ComplexDetail
    } catch (e) {
      console.warn('[tradeApi] 단지 상세 조회 실패:', e)
      return null
    }
  },

  /** 시도/시군구 목록 */
  regions: async (): Promise<SidoRegion[]> => {
    try {
      const res = await axios.get(`${API_BASE_URL}/regions`, { timeout: 10_000 })
      return (res.data.regions || []) as SidoRegion[]
    } catch {
      return []
    }
  },

  /**
   * 지도 타일 히트맵용 배치 집계. 시도 전체(level='sido') 또는 특정 시도의
   * 시군구 전체(level='sgg' + sido)를 한 번에 반환한다. 데이터가 없는 지역은
   * 응답 배열에서 빠지므로, 화면은 목록에 없는 지역을 "집계 준비 중"으로 표시하면 된다.
   */
  regionStats: async (
    params: { level: 'sido' } | { level: 'sgg'; sido: string }
  ): Promise<RegionTileStat[]> => {
    const res = await axios.get(`${API_BASE_URL}/regions/stats`, {
      params: params.level === 'sgg' ? { level: 'sgg', sido: params.sido } : { level: 'sido' },
      timeout: 10_000,
    })
    return (res.data.regions || []) as RegionTileStat[]
  },

  health: async (): Promise<SystemHealth | null> => {
    try {
      const res = await axios.get(`${API_BASE_URL}/health`, { timeout: 5_000 })
      return res.data as SystemHealth
    } catch {
      return null
    }
  },
}

export default tradeApi
