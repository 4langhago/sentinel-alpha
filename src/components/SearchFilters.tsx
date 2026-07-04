import React, { useState } from 'react'
import { Search, Filter, DollarSign, MapPin, Building } from 'lucide-react'
import { PropertyType, AuctionStatus, SearchFilters as SearchFiltersType } from '../types/auction'
import { courts } from '../data/mockData'
import RegionSelector from './RegionSelector'
import { REGIONS_DATA } from '../data/regions'

const SearchFilters = ({ onSearch }: { onSearch: (filters: SearchFiltersType) => void }) => {
  const [filters, setFilters] = useState<SearchFiltersType>({
    propertyTypes: [],
    minInvestment: 0,
    maxInvestment: 0,
    courts: [],
    address: '',
    status: [AuctionStatus.SCHEDULED, AuctionStatus.IN_PROGRESS]
  })

  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  const propertyTypeOptions = [
    { value: PropertyType.APARTMENT, label: '아파트' },
    { value: PropertyType.HOUSE, label: '주택' },
    { value: PropertyType.COMMERCIAL, label: '상가' },
    { value: PropertyType.LAND, label: '토지' },
    { value: PropertyType.OFFICE, label: '오피스' },
    { value: PropertyType.OTHER, label: '기타' }
  ]

  const statusOptions = [
    { value: AuctionStatus.SCHEDULED, label: '예정' },
    { value: AuctionStatus.IN_PROGRESS, label: '진행중' },
    { value: AuctionStatus.COMPLETED, label: '완료' },
    { value: AuctionStatus.CANCELLED, label: '취소' }
  ]

  const handlePropertyTypeChange = (type: PropertyType, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      propertyTypes: checked 
        ? [...prev.propertyTypes, type]
        : prev.propertyTypes.filter(t => t !== type)
    }))
  }

  const handleCourtChange = (court: string, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      courts: checked 
        ? [...prev.courts, court]
        : prev.courts.filter(c => c !== court)
    }))
  }

  const handleStatusChange = (status: AuctionStatus, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      status: checked 
        ? [...prev.status, status]
        : prev.status.filter(s => s !== status)
    }))
  }

  const handleRegionChange = (districtIds: string[]) => {
    setSelectedRegions(districtIds)
    // 선택된 구/군의 법원들을 필터에 추가
    const districtCourts = districtIds.flatMap(districtId => {
      for (const region of REGIONS_DATA) {
        const district = region.districts.find(d => d.id === districtId)
        if (district) return district.courts
      }
      return []
    })
    setFilters(prev => ({
      ...prev,
      courts: districtCourts
    }))
  }

  const handleSearch = () => {
    onSearch(filters)
  }

  const handleReset = () => {
    setFilters({
      propertyTypes: [],
      minInvestment: 0,
      maxInvestment: 0,
      courts: [],
      address: '',
      status: [AuctionStatus.SCHEDULED, AuctionStatus.IN_PROGRESS]
    })
    setSelectedRegions([])
  }

  return (
    <div className="card">
      <div className="space-y-4">
        {/* Row 1: 지역 선택 */}
        <RegionSelector
          selectedRegions={selectedRegions}
          onRegionChange={handleRegionChange}
        />

        {/* Row 2: 물건 종류 + 투자 금액 한 줄 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 물건 종류 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center text-gray-700">
              <Building className="w-4 h-4 mr-1.5" />
              물건 종류
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {propertyTypeOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => handlePropertyTypeChange(option.value, !filters.propertyTypes.includes(option.value))}
                  className={`px-3 py-2 rounded-lg border text-sm transition-all duration-200 font-medium ${
                    filters.propertyTypes.includes(option.value)
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 투자 금액 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center text-gray-700">
              <DollarSign className="w-4 h-4 mr-1.5" />
              투자 금액 (최소 입찰가)
            </h3>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="최소 금액"
                value={filters.minInvestment || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, minInvestment: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <input
                type="number"
                placeholder="최대 금액"
                value={filters.maxInvestment || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, maxInvestment: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Row 3: 검색 버튼 + 초기화 */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center space-x-1.5 text-sm text-primary-600 hover:text-primary-700"
            >
              <Filter className="w-4 h-4" />
              <span>{showAdvanced ? '고급 필터 숨기기' : '고급 필터 보기'}</span>
            </button>
            <button onClick={handleReset} className="btn-secondary text-sm">
              초기화
            </button>
          </div>
          <button
            onClick={handleSearch}
            className="btn-primary flex items-center space-x-2 px-8"
          >
            <Search className="w-4 h-4" />
            <span>검색</span>
          </button>
        </div>

        {/* 고급 필터 */}
        {showAdvanced && (
          <div className="space-y-6 pt-6 border-t">
            {/* 법원 */}
            <div>
              <h3 className="text-lg font-semibold mb-3">법원</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-40 overflow-y-auto">
                {courts.map(court => (
                  <label key={court} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.courts.includes(court)}
                      onChange={(e) => handleCourtChange(court, e.target.checked)}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-gray-700 text-sm">{court}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 경매 상태 */}
            <div>
              <h3 className="text-lg font-semibold mb-3">경매 상태</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statusOptions.map(option => (
                  <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(option.value)}
                      onChange={(e) => handleStatusChange(option.value, e.target.checked)}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-gray-700">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchFilters
