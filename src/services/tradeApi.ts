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
  min_area: params.minArea,
  max_area: params.maxArea,
  build_year_min: params.buildYearMin,
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
    }
  },

  /** 지역 시세 통계 + 월별 추이 */
  stats: async (params: { sido?: string; sggCode?: string; q?: string } = {}): Promise<RegionStats | null> => {
    try {
      const res = await axios.get(`${API_BASE_URL}/stats`, {
        params: { sido: params.sido || undefined, sgg_code: params.sggCode || undefined, q: params.q || undefined },
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
