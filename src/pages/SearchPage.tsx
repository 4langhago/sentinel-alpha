import React, { useState, useEffect, useCallback } from 'react'
import SearchFilters from '../components/SearchFilters'
import AuctionList from '../components/AuctionList'
import { AuctionItem, SearchFilters as SearchFiltersType } from '../types/auction'
import { mockAuctionItems } from '../data/mockData'
import { useAuth } from '../contexts/AuthContext'
import { auctionApi } from '../services/auctionApi'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'

const SearchPage = () => {
  const [auctions, setAuctions] = useState<AuctionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [isApiConnected, setIsApiConnected] = useState<boolean | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const { refreshUsage } = useAuth()

  const fetchAuctions = useCallback(async (params: {
    region?: string
    minPrice?: number
    maxPrice?: number
    propertyType?: string
    page?: number
    limit?: number
  } = {}) => {
    setLoading(true)
    try {
      const result = await auctionApi.searchAuctions({
        regions: params.region ? [params.region] : [],
        amountRange: {
          min: params.minPrice ?? 0,
          max: params.maxPrice ?? 2_000_000_000,
        },
        propertyTypes: params.propertyType && params.propertyType !== 'ALL'
          ? [params.propertyType] : [],
        page: params.page ?? 1,
        limit: params.limit ?? 30,
      })
      setAuctions(result.items)
      setIsApiConnected(true)
      setLastUpdated(new Date().toLocaleString('ko-KR'))
    } catch (err) {
      console.warn('[SearchPage] API 호출 실패, mockData 사용:', err)
      setAuctions(mockAuctionItems)
      setIsApiConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAuctions()
    refreshUsage()
  }, [fetchAuctions])

  const handleSearch = (filters: SearchFiltersType) => {
    const region = filters.address || (filters.courts.length > 0 ? filters.courts[0] : '')
    const propertyType = filters.propertyTypes.length === 1 ? filters.propertyTypes[0] : 'ALL'
    fetchAuctions({
      region,
      minPrice: filters.minInvestment || 0,
      maxPrice: filters.maxInvestment || 2_000_000_000,
      propertyType,
    })
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          전국 법원 경매 물건 검색
        </h2>
        <p className="text-gray-600">
          원하는 조건으로 경매 물건을 찾아보세요
        </p>
        <div className="flex items-center justify-center gap-3 mt-3 text-sm">
          {isApiConnected === true && (
            <span className="flex items-center gap-1 text-green-600">
              <Wifi size={14} />
              실시간 데이터 연결됨
              {lastUpdated && <span className="text-gray-400 ml-1">· {lastUpdated} 기준</span>}
            </span>
          )}
          {isApiConnected === false && (
            <span className="flex items-center gap-1 text-amber-600">
              <WifiOff size={14} />
              오프라인 데이터 사용 중
            </span>
          )}
          <button
            onClick={() => fetchAuctions()}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <SearchFilters onSearch={handleSearch} />
        <AuctionList auctions={auctions} loading={loading} />
      </div>
    </div>
  )
}

export default SearchPage
