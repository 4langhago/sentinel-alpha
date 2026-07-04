import React, { useState } from 'react'
import { Heart, Search, Filter, X, Star, MapPin, Calendar, DollarSign } from 'lucide-react'
import { AuctionItem, PropertyType, AuctionStatus } from '../types/auction'
import { mockAuctionItems } from '../data/mockData'

const FavoritesPage = () => {
  const [favorites, setFavorites] = useState<AuctionItem[]>(mockAuctionItems.slice(0, 2))
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState<PropertyType | 'all'>('all')

  const propertyTypeOptions = [
    { value: 'all', label: '전체' },
    { value: PropertyType.APARTMENT, label: '아파트' },
    { value: PropertyType.HOUSE, label: '주택' },
    { value: PropertyType.COMMERCIAL, label: '상가' },
    { value: PropertyType.LAND, label: '토지' },
    { value: PropertyType.OFFICE, label: '오피스' }
  ]

  const getPropertyTypeLabel = (type: PropertyType) => {
    const labels = {
      [PropertyType.APARTMENT]: '아파트',
      [PropertyType.HOUSE]: '주택',
      [PropertyType.COMMERCIAL]: '상가',
      [PropertyType.LAND]: '토지',
      [PropertyType.OFFICE]: '오피스',
      [PropertyType.OTHER]: '기타'
    }
    return labels[type]
  }

  const getStatusLabel = (status: AuctionStatus) => {
    const labels = {
      [AuctionStatus.SCHEDULED]: '예정',
      [AuctionStatus.IN_PROGRESS]: '진행중',
      [AuctionStatus.COMPLETED]: '완료',
      [AuctionStatus.CANCELLED]: '취소'
    }
    return labels[status]
  }

  const getStatusColor = (status: AuctionStatus) => {
    const colors = {
      [AuctionStatus.SCHEDULED]: 'bg-blue-100 text-blue-800',
      [AuctionStatus.IN_PROGRESS]: 'bg-green-100 text-green-800',
      [AuctionStatus.COMPLETED]: 'bg-gray-100 text-gray-800',
      [AuctionStatus.CANCELLED]: 'bg-red-100 text-red-800'
    }
    return colors[status]
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const removeFromFavorites = (id: string) => {
    setFavorites(prev => prev.filter(item => item.id !== id))
  }

  const filteredFavorites = favorites.filter(auction => {
    const matchesSearch = auction.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         auction.caseNumber.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = selectedType === 'all' || auction.propertyType === selectedType
    return matchesSearch && matchesType
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center space-x-2">
          <Heart className="w-8 h-8 text-red-500" />
          <span>관심 물건</span>
        </h2>
        <p className="text-gray-600">
          저장한 경매 물건들을 관리하고 알림을 받으세요
        </p>
      </div>

      {favorites.length === 0 ? (
        <div className="text-center py-12">
          <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">관심 물건이 없습니다</h3>
          <p className="text-gray-500 mb-6">마음에 드는 경매 물건을 추가해보세요</p>
          <button className="btn-primary">
            경매 물건 검색하기
          </button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="card">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="주소나 사건번호로 검색"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Type Filter */}
              <div className="md:w-48">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as PropertyType | 'all')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {propertyTypeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-900">
                관심 물건 <span className="text-primary-600">({filteredFavorites.length})</span>
              </h3>
            </div>

            {filteredFavorites.length === 0 ? (
              <div className="text-center py-8">
                <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">검색 결과가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredFavorites.map((auction) => (
                  <div key={auction.id} className="card hover:shadow-lg transition-shadow">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:space-x-6">
                      {/* Image */}
                      <div className="w-full lg:w-48 h-48 flex-shrink-0 mb-4 lg:mb-0">
                        <img
                          src={auction.images && auction.images.length > 0
                            ? auction.images[0]
                            : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=300&fit=crop'}
                          alt={auction.address}
                          className="w-full h-48 object-cover rounded-lg"
                          onError={(e) => {
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=300&fit=crop'
                          }}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-lg font-semibold text-gray-900 mb-2">
                              {auction.caseNumber}
                            </h4>
                            <div className="flex items-center space-x-2 text-sm text-gray-600">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(auction.status)}`}>
                                {getStatusLabel(auction.status)}
                              </span>
                              <span>{getPropertyTypeLabel(auction.propertyType)}</span>
                            </div>
                          </div>
                          <div className="text-right mt-2 sm:mt-0">
                            <div className="text-2xl font-bold text-primary-600">
                              {formatCurrency(auction.minimumBid)}
                            </div>
                            <div className="text-sm text-gray-500">최저 입찰가</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="flex items-center space-x-2">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            <div>
                              <div className="text-sm text-gray-500">위치</div>
                              <div className="text-sm font-medium">{auction.court}</div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <div>
                              <div className="text-sm text-gray-500">경매일</div>
                              <div className="text-sm font-medium">{formatDate(auction.auctionDate)}</div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <DollarSign className="w-4 h-4 text-gray-400" />
                            <div>
                              <div className="text-sm text-gray-500">감정가</div>
                              <div className="text-sm font-medium">{formatCurrency(auction.appraisalValue)}</div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Star className="w-4 h-4 text-gray-400" />
                            <div>
                              <div className="text-sm text-gray-500">면적</div>
                              <div className="text-sm font-medium">{auction.area}㎡</div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm text-gray-700">{auction.address}</div>
                          <div className="text-sm text-gray-600">{auction.description}</div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-4 border-t">
                          <button className="btn-primary text-sm">
                            상세 정보 보기
                          </button>
                          <button className="btn-secondary text-sm">
                            투자 수익 계산
                          </button>
                          <button 
                            onClick={() => removeFromFavorites(auction.id)}
                            className="btn-secondary text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="w-4 h-4 mr-1" />
                            관심 물건 삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default FavoritesPage
