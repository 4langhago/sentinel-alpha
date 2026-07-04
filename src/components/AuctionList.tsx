import React from 'react'
import { Link } from 'react-router-dom'
import { AuctionItem, PropertyType, AuctionStatus } from '../types/auction'
import { MapPin, Building, Lock, Crown, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import PropertyImage from './PropertyImage'

interface AuctionListProps {
  auctions: AuctionItem[]
  loading: boolean
}

const AuctionList = ({ auctions, loading }: AuctionListProps) => {
  const { checkCanView, markViewed, openAuthModal, openMembershipModal, isLoggedIn, dailyLimit, remainingViews } = useAuth()

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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (auctions.length === 0) {
    return (
      <div className="text-center py-12">
        <Building className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-600 mb-2">검색 결과가 없습니다</h3>
        <p className="text-gray-500">검색 조건을 변경해보세요</p>
      </div>
    )
  }

  return (
    <div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {/* Usage warning banner */}
          {dailyLimit !== null && remainingViews !== null && remainingViews <= 1 && remainingViews > 0 && (
            <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <span className="text-sm text-amber-700 font-medium">
                오늘 조회 가능한 물건이 <strong>{remainingViews}건</strong> 남았습니다.
              </span>
              <button
                onClick={openMembershipModal}
                className="text-sm font-semibold text-violet-600 hover:text-violet-700 flex items-center space-x-1"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>업그레이드</span>
              </button>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {auctions.map((auction) => {
              const canView = checkCanView(auction.id)
              const isLocked = !canView

              return (
                <div key={auction.id} className={`card hover:shadow-lg transition-shadow relative ${isLocked ? 'overflow-hidden' : ''}`}>
                  <PropertyImage
                    src={auction.images?.[0]}
                    alt={auction.address}
                    propertyType={auction.propertyType}
                    caseNumber={auction.caseNumber}
                    className={`w-full h-48 object-cover rounded-t-lg ${isLocked ? 'blur-sm' : ''}`}
                  />

                  {/* Locked overlay */}
                  {isLocked && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-lg">
                      <div className="bg-white rounded-2xl shadow-xl p-6 mx-4 text-center max-w-xs">
                        <div className="w-14 h-14 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Lock className="w-7 h-7 text-violet-500" />
                        </div>
                        <h4 className="font-bold text-gray-900 mb-1">오늘 조회 한도 초과</h4>
                        <p className="text-sm text-gray-500 mb-4">
                          무료 회원은 하루 <strong>{dailyLimit}건</strong>까지 조회할 수 있습니다.<br />
                          더 많은 물건을 보려면 멤버십을 업그레이드하세요.
                        </p>
                        <button
                          onClick={isLoggedIn ? openMembershipModal : () => openAuthModal('signup')}
                          className="w-full flex items-center justify-center space-x-2 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-all"
                        >
                          <Crown className="w-4 h-4" />
                          <span>{isLoggedIn ? '멤버십 업그레이드' : '회원가입 후 더 보기'}</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={`p-4 ${isLocked ? 'blur-sm select-none pointer-events-none' : ''}`}>
                    <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                      <MapPin className="w-4 h-4" />
                      <span>{auction.court}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {auction.address}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span className="bg-primary-100 text-primary-800 px-2 py-1 rounded">
                        {getPropertyTypeLabel(auction.propertyType)}
                      </span>
                      <span>{auction.auctionDate}</span>
                    </div>
                    <div className="text-gray-600 mt-2">{auction.description}</div>
                  </div>
                  <div className={`flex items-center justify-between p-4 border-t ${isLocked ? 'blur-sm select-none pointer-events-none' : ''}`}>
                    <div className="text-2xl font-bold text-primary-600">
                      {formatCurrency(auction.minimumBid)}
                    </div>
                    {!isLocked && (
                      <Link
                        to={`/detail/${auction.id}`}
                        onClick={() => markViewed(auction.id)}
                        className="btn-primary text-sm"
                      >
                        상세 보기
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default AuctionList;
