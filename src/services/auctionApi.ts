import axios from 'axios'
import { AuctionItem } from '../types/auction'
import { mockAuctionItems } from '../data/mockData'
import { REGIONS_DATA } from '../data/regions'

// API 기본 설정 (FastAPI 서버: localhost:8000)
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000'

export interface AuctionSearchParams {
  regions?: string[]
  amountRange?: {
    min: number
    max: number
  }
  investmentRange?: {
    min: number
    max: number
  }
  propertyTypes?: string[]
  page?: number
  limit?: number
}

export interface AuctionSearchResult {
  items: AuctionItem[]
  total: number
  page: number
  totalPages: number
  hasMore: boolean
}

export interface AuctionReport {
  case_number: string
  address: string
  area: number
  appraisal_value: number
  minimum_bid: number
  auction_date: string
  risk_items: string[]
  risk_score: number
  expected_profit: number
  profit_rate: number
  overall_score: number
  recommendation: string
}

export interface SystemHealth {
  status: string
  db: boolean
  scraper: boolean
  last_update: string
  version: string
}

const isFastApiAvailable = async (): Promise<boolean> => {
  try {
    await axios.get(`${API_BASE_URL}/health`, { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

export const auctionApi = {
  // 경매 물건 검색
  searchAuctions: async (params: AuctionSearchParams): Promise<AuctionSearchResult> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auctions`, {
        params: {
          region: params.regions?.join(' ') || '',
          min_price: params.amountRange?.min ?? params.investmentRange?.min ?? 0,
          max_price: params.amountRange?.max ?? params.investmentRange?.max ?? 2_000_000_000,
          property_type: params.propertyTypes?.[0] || 'ALL',
          risk_filter: true,
          page: params.page || 1,
          limit: params.limit || 20,
        },
        timeout: 5000,
      })
      const data = response.data
      return {
        items: (data.items || []).map(transformFastApiItem),
        total: data.total || 0,
        page: data.page || 1,
        totalPages: data.total_pages || 1,
        hasMore: data.has_more || false,
      }
    } catch (error) {
      console.warn('FastAPI 서버 미응답, mock 데이터 사용:', error)
      return getMockAuctionData(params)
    }
  },

  // 특정 물건 심층 분석 리포트
  getReport: async (caseNumber: string): Promise<AuctionReport | null> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/report/${caseNumber}`, { timeout: 10000 })
      return response.data as AuctionReport
    } catch (error) {
      console.error('리포트 조회 실패:', error)
      return null
    }
  },

  // 시스템 상태 확인
  getHealth: async (): Promise<SystemHealth | null> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 3000 })
      return response.data as SystemHealth
    } catch {
      return null
    }
  },

  // 지역 목록 조회
  getRegions: async (): Promise<any[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/regions`, { timeout: 3000 })
      return response.data.regions || []
    } catch {
      return []
    }
  },

  // 지역별 법원 목록 조회 (하위 호환)
  getCourtsByRegion: async (regionId: string): Promise<string[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/regions`, { timeout: 3000 })
      const regions: any[] = response.data.regions || []
      const found = regions.find((r: any) => r.id === regionId)
      return found?.courts || getMockCourtsByRegion(regionId)
    } catch (error) {
      console.warn('지역 목록 조회 실패, mock 사용:', error)
      return getMockCourtsByRegion(regionId)
    }
  },

  // 투자금액별 통계 조회
  getInvestmentStats: async (params: AuctionSearchParams): Promise<any> => {
    return getMockInvestmentStats(params)
  },
}

// FastAPI 응답(snake_case) → AuctionItem(camelCase) 변환
const transformFastApiItem = (item: any): AuctionItem => {
  return {
    id: item.id || item.case_number,
    caseNumber: item.case_number || '',
    court: item.court || '',
    address: item.address || '',
    propertyType: item.property_type as any,
    area: item.area || 0,
    minimumBid: item.minimum_bid || 0,
    appraisalValue: item.appraisal_value || 0,
    auctionDate: item.auction_date || '',
    description: item.description || '',
    images: item.images || [],
    status: (item.status || 'SCHEDULED') as any,
  }
}

// API 응답을 우리 형식으로 변환하는 함수
const transformApiItem = (apiItem: any): AuctionItem => {
  return {
    id: apiItem.case_number || apiItem.id,
    caseNumber: apiItem.case_number || '',
    court: apiItem.court_name || apiItem.court,
    address: apiItem.address || apiItem.location,
    propertyType: mapPropertyType(apiItem.property_type || apiItem.type),
    area: apiItem.area || apiItem.size || 0,
    minimumBid: apiItem.minimum_bid || apiItem.min_price || 0,
    appraisalValue: apiItem.appraisal_value || apiItem.appraised_price || 0,
    auctionDate: apiItem.auction_date || apiItem.date || '',
    description: apiItem.description || apiItem.remarks || '',
    images: apiItem.images || [apiItem.image_url],
    status: mapAuctionStatus(apiItem.status || 'SCHEDULED')
  }
}

const mapPropertyType = (type: string): any => {
  const typeMap: { [key: string]: any } = {
    '아파트': 'APARTMENT',
    '주택': 'HOUSE',
    '상가': 'COMMERCIAL',
    '토지': 'LAND',
    '오피스': 'OFFICE'
  }
  return typeMap[type] || 'OTHER'
}

const mapAuctionStatus = (status: string): any => {
  const statusMap: { [key: string]: any } = {
    '예정': 'SCHEDULED',
    '진행중': 'IN_PROGRESS',
    '완료': 'COMPLETED',
    '취소': 'CANCELLED',
    'SCHEDULED': 'SCHEDULED',
    'IN_PROGRESS': 'IN_PROGRESS',
    'COMPLETED': 'COMPLETED',
    'CANCELLED': 'CANCELLED'
  }
  return statusMap[status] || 'SCHEDULED'
}

// 선택된 district/region ID 목록에서 해당 법원명 집합을 반환
const getCourtsForSelectedIds = (selectedIds: string[]): Set<string> => {
  const courts = new Set<string>()
  for (const region of REGIONS_DATA) {
    if (selectedIds.includes(region.id)) {
      region.districts.forEach(d => d.courts.forEach(c => courts.add(c)))
    }
    for (const district of region.districts) {
      if (selectedIds.includes(district.id)) {
        district.courts.forEach(c => courts.add(c))
      }
    }
  }
  return courts
}

// 모의 데이터 함수 — mockData.ts를 단일 소스로 사용
const getMockAuctionData = (params: AuctionSearchParams): AuctionSearchResult => {
  let filteredItems: AuctionItem[] = [...mockAuctionItems]

  // 지역 필터 (district ID 또는 region ID 모두 처리)
  if (params.regions && params.regions.length > 0) {
    const selectedCourts = getCourtsForSelectedIds(params.regions)
    if (selectedCourts.size > 0) {
      filteredItems = filteredItems.filter(item => selectedCourts.has(item.court))
    }
  }

  // 금액 범위 필터
  const minPrice = params.amountRange?.min ?? params.investmentRange?.min ?? 0
  const maxPrice = params.amountRange?.max ?? params.investmentRange?.max ?? Infinity
  if (minPrice > 0 || maxPrice < Infinity) {
    filteredItems = filteredItems.filter(item =>
      item.minimumBid >= minPrice && item.minimumBid <= maxPrice
    )
  }

  // 물건 종류 필터
  if (params.propertyTypes && params.propertyTypes.length > 0) {
    filteredItems = filteredItems.filter(item =>
      params.propertyTypes!.includes(item.propertyType as string)
    )
  }

  return {
    items: filteredItems,
    total: filteredItems.length,
    page: params.page || 1,
    totalPages: 1,
    hasMore: false
  }
}

const getMockCourtsByRegion = (regionId: string): string[] => {
  const region = REGIONS_DATA.find(r => r.id === regionId)
  if (region) {
    return [...new Set(region.districts.flatMap(d => d.courts))]
  }
  return []
}

const getMockInvestmentStats = (_params: AuctionSearchParams) => {
  return {
    averageYield: 8.5,
    totalItems: 156,
    averageInvestment: 280000000,
    successRate: 78.3
  }
}

// 법원 이름으로 region ID 찾기
const getRegionByCourt = (courtName: string): string => {
  for (const region of REGIONS_DATA) {
    for (const district of region.districts) {
      if (district.courts.includes(courtName)) return region.id
    }
  }
  return 'unknown'
}

export default auctionApi
