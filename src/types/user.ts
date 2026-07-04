export type MembershipTier = 'FREE' | 'BASIC' | 'PREMIUM' | 'BUSINESS'

export interface MembershipPlan {
  tier: MembershipTier
  name: string
  price: number
  dailyLimit: number | null
  features: string[]
  popular?: boolean
  color: string
}

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    tier: 'FREE',
    name: '무료',
    price: 0,
    dailyLimit: 3,
    color: 'gray',
    features: [
      '하루 3건 조회',
      '기본 검색',
      '물건 주소 / 최저가 확인',
    ]
  },
  {
    tier: 'BASIC',
    name: '베이직',
    price: 3000,
    dailyLimit: 50,
    color: 'blue',
    features: [
      '하루 50건 조회',
      '전체 상세 정보',
      '관심 물건 저장',
      '입찰일 알림',
    ]
  },
  {
    tier: 'PREMIUM',
    name: '프리미엄',
    price: 7000,
    dailyLimit: null,
    color: 'purple',
    popular: true,
    features: [
      '무제한 조회',
      'AI 수익 분석 리포트',
      '리스크 스코어 확인',
      '관심 물건 저장',
      '입찰일 알림',
      '고급 필터',
    ]
  },
  {
    tier: 'BUSINESS',
    name: '비즈니스',
    price: 10000,
    dailyLimit: null,
    color: 'gold',
    features: [
      '무제한 조회',
      'AI 수익 분석 리포트',
      '리스크 스코어 확인',
      '텔레그램 알림 봇',
      '관심 물건 저장',
      '입찰일 알림',
      '고급 필터',
      '엑셀 데이터 다운로드',
    ]
  }
]

export interface User {
  id: string
  name: string
  email: string
  membership: MembershipTier
  membershipExpiry?: string
  createdAt: string
}

export interface DailyUsage {
  date: string
  count: number
  viewedIds: string[]
}

export const FREE_DAILY_LIMIT = 3
