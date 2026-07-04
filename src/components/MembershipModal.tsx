import React, { useState } from 'react'
import { X, Check, Crown, Zap, Star, Building2, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { MEMBERSHIP_PLANS, MembershipTier } from '../types/user'

const tierIcons: Record<string, React.ReactNode> = {
  FREE: <Building2 className="w-6 h-6" />,
  BASIC: <Zap className="w-6 h-6" />,
  PREMIUM: <Star className="w-6 h-6" />,
  BUSINESS: <Crown className="w-6 h-6" />,
}

const tierGradients: Record<string, string> = {
  FREE: 'from-gray-400 to-gray-500',
  BASIC: 'from-blue-500 to-cyan-500',
  PREMIUM: 'from-violet-500 to-purple-600',
  BUSINESS: 'from-amber-500 to-orange-500',
}

const tierBorder: Record<string, string> = {
  FREE: 'border-gray-200',
  BASIC: 'border-blue-200',
  PREMIUM: 'border-violet-400 ring-2 ring-violet-400',
  BUSINESS: 'border-amber-300',
}

const MembershipModal = () => {
  const { showMembershipModal, closeMembershipModal, user, upgradeMembership, openAuthModal, isLoggedIn } = useAuth()
  const [confirming, setConfirming] = useState<MembershipTier | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!showMembershipModal) return null

  const handleSelect = (tier: MembershipTier) => {
    if (!isLoggedIn) {
      closeMembershipModal()
      openAuthModal('signup')
      return
    }
    if (tier === 'FREE') return
    if (user?.membership === tier) return
    setConfirming(tier)
  }

  const handleConfirm = () => {
    if (!confirming) return
    upgradeMembership(confirming)
    const plan = MEMBERSHIP_PLANS.find((p) => p.tier === confirming)
    setSuccess(`${plan?.name} 멤버십으로 업그레이드되었습니다!`)
    setConfirming(null)
    setTimeout(() => {
      setSuccess(null)
      closeMembershipModal()
    }, 2000)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeMembershipModal} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-8 pt-8 pb-6 text-white rounded-t-3xl">
          <button
            onClick={closeMembershipModal}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 bg-white/10 rounded-full px-4 py-1.5 mb-4">
              <Crown className="w-4 h-4 text-yellow-300" />
              <span className="text-sm font-medium">멤버십 플랜</span>
            </div>
            <h2 className="text-3xl font-bold mb-2">더 많은 물건을 발견하세요</h2>
            <p className="text-indigo-200">
              한 달에 <span className="text-white font-bold">3,000원</span>부터 시작하는 프리미엄 서비스
            </p>
          </div>
        </div>

        {/* Success message */}
        {success && (
          <div className="mx-8 mt-6 bg-green-50 border border-green-200 text-green-700 rounded-2xl px-6 py-4 flex items-center space-x-3">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span className="font-semibold">{success}</span>
          </div>
        )}

        {/* Plans */}
        <div className="p-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {MEMBERSHIP_PLANS.map((plan) => {
              const isCurrentPlan = user?.membership === plan.tier
              const isFree = plan.tier === 'FREE'

              return (
                <div
                  key={plan.tier}
                  className={`relative rounded-2xl border-2 p-6 flex flex-col transition-all duration-200 ${tierBorder[plan.tier]} ${
                    plan.popular ? 'shadow-xl' : 'shadow-md'
                  } ${isFree ? 'opacity-75' : 'hover:shadow-xl hover:-translate-y-1'}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap shadow-lg">
                      가장 인기
                    </div>
                  )}

                  {/* Icon + Name */}
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tierGradients[plan.tier]} flex items-center justify-center text-white mb-4`}>
                    {tierIcons[plan.tier]}
                  </div>

                  <div className="font-bold text-xl text-gray-900 mb-1">{plan.name}</div>

                  {/* Price */}
                  <div className="mb-4">
                    {plan.price === 0 ? (
                      <div className="text-3xl font-bold text-gray-700">무료</div>
                    ) : (
                      <div className="flex items-end space-x-1">
                        <span className="text-3xl font-bold text-gray-900">
                          {plan.price.toLocaleString()}
                        </span>
                        <span className="text-gray-500 text-sm mb-1">원/월</span>
                      </div>
                    )}
                    <div className="text-sm text-gray-500 mt-0.5">
                      {plan.dailyLimit === null
                        ? '무제한 조회'
                        : `하루 ${plan.dailyLimit}건 조회`}
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 flex-1 mb-6">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-start space-x-2 text-sm text-gray-600">
                        <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isFree ? 'text-gray-400' : 'text-violet-500'}`} />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {isCurrentPlan ? (
                    <div className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 text-center text-sm font-semibold">
                      현재 플랜
                    </div>
                  ) : isFree ? (
                    <div className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-400 text-center text-sm">
                      기본 제공
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelect(plan.tier)}
                      className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all duration-200 bg-gradient-to-r ${tierGradients[plan.tier]} hover:shadow-lg hover:opacity-90`}
                    >
                      {!isLoggedIn ? '가입 후 구독' : '구독하기'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Note */}
          <div className="mt-6 flex items-start space-x-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
            <span>
              현재는 데모 버전으로 실제 결제가 이루어지지 않습니다.
              구독 버튼 클릭 시 즉시 해당 플랜으로 업그레이드됩니다.
            </span>
          </div>
        </div>

        {/* Confirm dialog */}
        {confirming && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirming(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
              <Crown className="w-12 h-12 mx-auto mb-4 text-violet-500" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">멤버십 구독</h3>
              <p className="text-gray-600 mb-6">
                <span className="font-bold text-violet-600">
                  {MEMBERSHIP_PLANS.find((p) => p.tier === confirming)?.name}
                </span>{' '}
                플랜을 구독하시겠습니까?
                <br />
                <span className="text-sm text-gray-500">
                  (월 {MEMBERSHIP_PLANS.find((p) => p.tier === confirming)?.price.toLocaleString()}원)
                </span>
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setConfirming(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:shadow-lg transition-all"
                >
                  구독하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MembershipModal
