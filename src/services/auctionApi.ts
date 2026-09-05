// 온비드 공매 API 클라이언트
// tradeApi.ts와 같은 형태이지만 엔드포인트·타입이 완전히 분리돼 있다.
// 공매 데이터가 없어도 실거래는 정상 동작해야 하므로 서로를 참조하지 않는다.
import axios from 'axios'
import {
  AuctionItem,
  AuctionSearchParams,
  AuctionSearchResult,
  AuctionStats,
} from '../types/auction'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const toQuery = (params: AuctionSearchParams) => ({
  q: params.q || undefined,
  sido: params.sido || undefined,
  sgg_code: params.sggCodes?.length ? params.sggCodes.join(',') : undefined,
  use_type: params.useTypes?.length ? params.useTypes.join(',') : undefined,
  use_scls: params.useSubTypes?.length ? params.useSubTypes.join(',') : undefined,
  division: params.divisions?.length ? params.divisions.join(',') : undefined,
  min_price: params.minPrice,
  max_price: params.maxPrice,
  min_appraisal: params.minAppraisal,
  max_appraisal: params.maxAppraisal,
  min_area: params.minArea,
  max_area: params.maxArea,
  min_discount: params.minDiscount,
  max_discount: params.maxDiscount,
  min_fail: params.minFailCount,
  // 0(신건만)도 유효한 값이라 falsy 체크로 걸러내면 안 된다.
  max_fail: params.maxFailCount === undefined ? undefined : params.maxFailCount,
  exclude_share: params.excludeShare ? 1 : undefined,
  bid_method: params.bidMethods?.length ? params.bidMethods.join(',') : undefined,
  // 서버는 존재 여부로 판단하므로 켰을 때만 보낸다(0은 "끔"과 구분되지 않는다).
  private_contract: params.privateContract ? 1 : undefined,
  deadline_days: params.deadlineDays,
  status: params.status || undefined,
  sort: params.sort || undefined,
  page: params.page || 1,
  limit: params.limit || 20,
})

export const auctionApi = {
  /** 공매 물건 검색 */
  search: async (params: AuctionSearchParams = {}): Promise<AuctionSearchResult> => {
    const res = await axios.get(`${API_BASE_URL}/auctions`, {
      params: toQuery(params),
      timeout: 10_000,
    })
    const d = res.data
    return {
      items: (d.items || []) as AuctionItem[],
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
      facets: d.facets,
    }
  },

  /** 지역 집계. 지역 미지정이면 전국 총계. */
  stats: async (sido?: string, sggCode?: string): Promise<AuctionStats> => {
    const res = await axios.get(`${API_BASE_URL}/auctions/stats`, {
      params: { sido: sido || undefined, sgg_code: sggCode || undefined },
      timeout: 10_000,
    })
    const d = res.data
    return {
      count: d.count || 0,
      openCount: d.open_count || 0,
      closedCount: d.closed_count || 0,
      medianMinBid: d.median_min_bid,
      medianAppraisal: d.median_appraisal,
      medianDiscountRate: d.median_discount_rate,
      pricedCount: d.priced_count,
      divisionTotals: d.division_totals,
      useTotals: d.use_totals,
      source: d.source || 'unknown',
      isLive: Boolean(d.is_live),
      lastUpdate: d.last_update ?? null,
      message: d.message,
    }
  },

  /** 물건 1건 */
  detail: async (id: string): Promise<AuctionItem | null> => {
    try {
      const res = await axios.get(`${API_BASE_URL}/auctions/${encodeURIComponent(id)}`, {
        timeout: 10_000,
      })
      return (res.data?.item as AuctionItem) || null
    } catch {
      return null
    }
  },
}
