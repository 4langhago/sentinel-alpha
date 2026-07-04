import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Heart, Share2, Calculator, MapPin, Calendar, DollarSign, Building, Scale, FileText, AlertCircle, Check } from 'lucide-react'
import { AuctionItem, PropertyType, AuctionStatus } from '../types/auction'
import { mockAuctionItems } from '../data/mockData'

const DetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const [isFavorite, setIsFavorite] = useState(false)
  
  const auction = mockAuctionItems.find(item => item.id === id) || mockAuctionItems[0]

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
      day: 'numeric',
      weekday: 'long'
    })
  }

  const investmentAnalysis = {
    totalInvestment: auction.minimumBid + 20000000 + 15000000,
    expectedProfit: auction.appraisalValue - auction.minimumBid - 35000000,
    profitRate: ((auction.appraisalValue - auction.minimumBid - 35000000) / (auction.minimumBid + 35000000)) * 100,
    monthlyRent: auction.minimumBid * 0.005,
    annualYield: ((auction.minimumBid * 0.005 * 12 * 0.85) / (auction.minimumBid + 35000000)) * 100
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              to="/search"
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>검색으로 돌아가기</span>
            </Link>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsFavorite(!isFavorite)}
                className={`p-2 rounded-lg ${isFavorite ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'} hover:bg-red-200 transition-colors`}
              >
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
              </button>
              <button className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title and Status */}
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(auction.status)}`}>
                  {getStatusLabel(auction.status)}
                </span>
                <span className="bg-primary-100 text-primary-800 px-3 py-1 rounded-full text-sm font-medium">
                  {getPropertyTypeLabel(auction.propertyType)}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {auction.caseNumber}
              </h1>
              <p className="text-xl text-gray-600">
                {auction.address}
              </p>
            </div>

            {/* Images */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(auction.images && auction.images.length > 0
                ? auction.images.slice(0, 2)
                : [null, null]
              ).map((src, idx) =>
                src ? (
                  <img
                    key={idx}
                    src={src}
                    alt={`${auction.address} ${idx + 1}번 사진`}
                    className="w-full aspect-video object-cover rounded-lg"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&h=400&fit=crop'
                    }}
                  />
                ) : (
                  <div key={idx} className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                    <Building className="w-16 h-16 text-gray-300" />
                  </div>
                )
              )}
            </div>

            {/* Key Information */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">핵심 정보</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-gray-500 mb-1">최저 입찰가</div>
                  <div className="text-2xl font-bold text-primary-600">
                    {formatCurrency(auction.minimumBid)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">감정가</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(auction.appraisalValue)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">면적</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {auction.area}㎡
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">경매일</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {formatDate(auction.auctionDate)}
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Information */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                상세 정보
              </h2>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <MapPin className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <div className="font-medium text-gray-900">소재지</div>
                    <div className="text-gray-700">{auction.address}</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Building className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <div className="font-medium text-gray-900">담당 법원</div>
                    <div className="text-gray-700">{auction.court}</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Calendar className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <div className="font-medium text-gray-900">경매 일정</div>
                    <div className="text-gray-700">{formatDate(auction.auctionDate)}</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Scale className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <div className="font-medium text-gray-900">물건 특징</div>
                    <div className="text-gray-700">{auction.description}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Investment Analysis */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                <Calculator className="w-5 h-5 mr-2" />
                투자 분석
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-sm text-green-600 mb-1">예상 차익</div>
                    <div className="text-xl font-bold text-green-700">
                      {formatCurrency(investmentAnalysis.expectedProfit)}
                    </div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-sm text-blue-600 mb-1">차익률</div>
                    <div className="text-xl font-bold text-blue-700">
                      {investmentAnalysis.profitRate.toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-3">투자 의견</h3>
                  <div className="space-y-2">
                    {investmentAnalysis.profitRate > 10 && (
                      <div className="flex items-start space-x-2">
                        <Check className="w-5 h-5 text-green-500 mt-0.5" />
                        <div className="text-sm text-gray-600">
                          예상 차익률이 10% 이상으로 우량한 투자 기회입니다.
                        </div>
                      </div>
                    )}
                    {investmentAnalysis.annualYield > 4 && (
                      <div className="flex items-start space-x-2">
                        <Check className="w-5 h-5 text-green-500 mt-0.5" />
                        <div className="text-sm text-gray-600">
                          연간 수익률이 4% 이상으로 임대 수익성이 좋습니다.
                        </div>
                      </div>
                    )}
                    {investmentAnalysis.profitRate < 5 && (
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                        <div className="text-sm text-gray-600">
                          차익률이 5% 미만으로 신중한 검토가 필요합니다.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">빠른 메뉴</h3>
              <div className="space-y-3">
                <Link
                  to="/calculator"
                  className="w-full btn-primary flex items-center justify-center space-x-2"
                >
                  <Calculator className="w-4 h-4" />
                  <span>수익 계산기</span>
                </Link>
                <button className="w-full btn-secondary">
                  법원 문의하기
                </button>
                <button className="w-full btn-secondary">
                  인근 물건 보기
                </button>
              </div>
            </div>

            {/* Contact Info */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">문의 정보</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-gray-500">담당 법원</div>
                  <div className="font-medium">{auction.court}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">사건번호</div>
                  <div className="font-medium">{auction.caseNumber}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">전화번호</div>
                  <div className="font-medium">법원 사무실에 문의</div>
                </div>
              </div>
            </div>

            {/* Related Info */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">참고 정보</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-medium text-gray-900">최저가율</div>
                  <div className="text-gray-600">
                    {((auction.minimumBid / auction.appraisalValue) * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">시세 대비</div>
                  <div className="text-gray-600">
                    {((auction.minimumBid / auction.appraisalValue) * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">예상 월세</div>
                  <div className="text-gray-600">
                    {formatCurrency(investmentAnalysis.monthlyRent)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DetailPage
