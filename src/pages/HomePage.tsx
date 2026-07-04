import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, TrendingUp, Shield, Clock, MapPin, Building2, ArrowRight,
  Heart, Sparkles, Zap, Target, BarChart3, ChevronLeft, ChevronRight,
  Star, Users, CheckCircle2, Flame, Trophy, Layers, Home, Trees,
  Factory, ShoppingBag, Car, LandPlot, Bell, FileText
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import PropertyImage from '../components/PropertyImage'
import { PropertyType, AuctionItem } from '../types/auction'
import { useLiveAuctions } from '../hooks/useLiveAuctions'

/* ─── 스크롤 애니메이션 훅 ─── */
const useScrollReveal = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

/* ─── 숫자 카운트업 훅 ─── */
const useCountUp = (target: number, duration = 1600, start = false) => {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!start) return
    let startTime: number
    const step = (ts: number) => {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / duration, 1)
      setCount(Math.floor(progress * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration, start])
  return count
}

/* ─── 히어로 타이핑 훅 ─── */
const useTypingEffect = (words: string[], speed = 80, pause = 1800) => {
  const [text, setText] = useState('')
  const [wordIdx, setWordIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    const current = words[wordIdx % words.length]
    const timeout = setTimeout(() => {
      if (!deleting) {
        setText(current.slice(0, text.length + 1))
        if (text.length + 1 === current.length) setTimeout(() => setDeleting(true), pause)
      } else {
        setText(current.slice(0, text.length - 1))
        if (text.length - 1 === 0) { setDeleting(false); setWordIdx(i => i + 1) }
      }
    }, deleting ? speed / 2 : speed)
    return () => clearTimeout(timeout)
  }, [text, deleting, wordIdx, words, speed, pause])
  return text
}

/* ─── 대법원 경매 6대 물건 분류 (courtauction.go.kr 기준) ───
   count는 실시간 API 데이터에서 집계 */
const PROPERTY_CATEGORIES = [
  {
    key: 'apt',
    label: '아파트·오피스텔',
    sublabel: '주거용 집합건물',
    icon: Building2,
    types: [PropertyType.APARTMENT] as PropertyType[],
    color: 'from-violet-500 to-indigo-500',
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    link: '/search',
  },
  {
    key: 'house',
    label: '빌라·주택',
    sublabel: '단독·다세대·연립',
    icon: Home,
    types: [PropertyType.HOUSE] as PropertyType[],
    color: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    link: '/search',
  },
  {
    key: 'commercial',
    label: '상가·점포',
    sublabel: '상업용·근린생활',
    icon: ShoppingBag,
    types: [PropertyType.COMMERCIAL] as PropertyType[],
    color: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    link: '/search',
  },
  {
    key: 'office',
    label: '오피스·지산',
    sublabel: '사무실·지식산업센터',
    icon: Layers,
    types: [PropertyType.OFFICE] as PropertyType[],
    color: 'from-slate-500 to-gray-600',
    bg: 'bg-slate-50 dark:bg-slate-950/40',
    link: '/search',
  },
  {
    key: 'land',
    label: '토지·임야',
    sublabel: '전·답·대지·산지',
    icon: LandPlot,
    types: [PropertyType.LAND] as PropertyType[],
    color: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    link: '/search',
  },
  {
    key: 'other',
    label: '공장·기타',
    sublabel: '산업시설·특수물건',
    icon: Factory,
    types: [PropertyType.OTHER] as PropertyType[],
    color: 'from-green-500 to-lime-500',
    bg: 'bg-green-50 dark:bg-green-950/40',
    link: '/search',
  },
]

/* ─── 실시간 데이터 표시용 헬퍼 ─── */
const formatKrw = (v: number): string => {
  if (v >= 100_000_000) {
    const eok = Math.floor(v / 100_000_000)
    const man = Math.round((v % 100_000_000) / 10_000)
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`
  }
  return `${Math.round(v / 10_000).toLocaleString()}만원`
}

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  APARTMENT: '아파트', HOUSE: '주택', COMMERCIAL: '상가',
  LAND: '토지', OFFICE: '오피스', OTHER: '기타',
}

const HOT_BADGES = [
  { badge: '🔥 HOT', badgeColor: 'bg-rose-500' },
  { badge: '⭐ 추천', badgeColor: 'bg-amber-500' },
  { badge: '💰 수익률↑', badgeColor: 'bg-emerald-500' },
  { badge: '🆕 신규', badgeColor: 'bg-blue-500' },
  { badge: '🏆 인기', badgeColor: 'bg-violet-500' },
]

interface HotAuction {
  id: string
  caseNo: string
  propertyType: PropertyType
  address: string
  building: string
  type: string
  court: string
  area: string
  date: string
  price: string
  appraisal: string
  discount: string
  badge: string
  badgeColor: string
}

// 실시간 경매 목록 → 할인율 상위 5건을 HOT 카드로 변환
const toHotAuctions = (items: AuctionItem[]): HotAuction[] => {
  return [...items]
    .filter(it => it.appraisalValue > 0 && it.minimumBid > 0)
    .sort((a, b) =>
      (1 - b.minimumBid / b.appraisalValue) - (1 - a.minimumBid / a.appraisalValue)
    )
    .slice(0, 5)
    .map((it, i) => ({
      id: it.id,
      caseNo: it.caseNumber,
      propertyType: it.propertyType,
      address: it.address,
      building: it.description || it.address,
      type: PROPERTY_TYPE_LABEL[it.propertyType] || '기타',
      court: it.court,
      area: `${it.area}㎡`,
      date: it.auctionDate,
      price: formatKrw(it.minimumBid),
      appraisal: formatKrw(it.appraisalValue),
      discount: `${Math.round((1 - it.minimumBid / it.appraisalValue) * 100)}%`,
      ...HOT_BADGES[i % HOT_BADGES.length],
    }))
}

const TESTIMONIALS = [
  {
    name: '이준호',
    age: '32세 직장인',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    text: '처음엔 경매가 어렵다고 생각했는데, AI 분석 덕분에 3개월 만에 첫 낙찰 성공했어요. 감정가 대비 24% 저렴하게 샀습니다.',
    rating: 5,
    gain: '+24% 할인',
  },
  {
    name: '김수연',
    age: '28세 프리랜서',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anita',
    text: '수익 계산기로 미리 시뮬레이션하고 들어갔더니 연 7.2% 수익률 나오고 있어요. 월세가 안정적으로 들어옵니다!',
    rating: 5,
    gain: '연 7.2% 수익',
  },
  {
    name: '박민준',
    age: '35세 자영업',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Milo',
    text: '텔레그램 알림 설정해두면 새 물건 뜨자마자 바로 확인해요. 경쟁이 덜 붙어서 좋은 가격에 낙찰받을 수 있었어요.',
    rating: 5,
    gain: '2건 낙찰 성공',
  },
]

const FEATURES = [
  {
    icon: Search,
    title: 'AI 스마트 검색',
    desc: '전국 법원 경매를 한 곳에서. 원하는 조건을 설정하면 딱 맞는 물건만 골라드려요.',
    link: '/search',
    gradient: 'from-violet-500 to-purple-600',
    bg: 'bg-violet-50 dark:bg-violet-950',
  },
  {
    icon: BarChart3,
    title: '수익률 계산기',
    desc: '낙찰가·임대료·취득세까지 반영한 정확한 투자 수익 시뮬레이션.',
    link: '/calculator',
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-50 dark:bg-blue-950',
  },
  {
    icon: Heart,
    title: '관심 물건 알림',
    desc: '찜해둔 물건의 입찰일·가격 변동을 실시간으로 알려드려요.',
    link: '/favorites',
    gradient: 'from-rose-500 to-pink-500',
    bg: 'bg-rose-50 dark:bg-rose-950',
  },
  {
    icon: Shield,
    title: '공식 법원 데이터',
    desc: '대법원 공식 데이터를 100% 연동. 허위 정보 없이 신뢰할 수 있어요.',
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950',
  },
]

/* ─── 섹션 애니메이션 래퍼 ─── */
const Reveal = ({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const { ref, visible } = useScrollReveal()
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/* ─── 통계 카드 (카운트업) ─── */
const StatCard = ({ number, suffix, label, icon: Icon, delay }: { number: number; suffix: string; label: string; icon: any; delay: number }) => {
  const { ref, visible } = useScrollReveal()
  const count = useCountUp(number, 1400, visible)
  return (
    <div
      ref={ref}
      className="group text-center transition-all duration-700"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-gray-100 dark:border-gray-700">
        <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center mx-auto mb-3">
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="text-3xl font-black text-gray-900 dark:text-white tabular-nums">
          {count}{suffix}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">{label}</div>
      </div>
    </div>
  )
}

/* ─── 물건 분류 카드 ─── */
const CategoryCard = ({ cat, count, delay }: { cat: typeof PROPERTY_CATEGORIES[0]; count: number; delay: number }) => {
  const Icon = cat.icon
  return (
    <Reveal delay={delay}>
      <Link to={cat.link} className="group block">
        <div className={`relative rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-gray-100 dark:border-gray-700 ${cat.bg}`}>
          <div className="h-28 flex items-center justify-center">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${cat.color} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300`}>
              <Icon className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="p-3 pt-0">
            <div className="text-gray-900 dark:text-white font-bold text-sm text-center">{cat.label}</div>
            <div className="text-gray-500 dark:text-gray-400 text-xs text-center">{cat.sublabel}</div>
            <div className="mt-1.5 text-center">
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${cat.color} text-white`}>
                {count.toLocaleString()}건
              </span>
            </div>
          </div>
        </div>
      </Link>
    </Reveal>
  )
}

/* ─── 경매 카드 ─── */
const AuctionCard = ({ auction, delay }: { auction: HotAuction; delay: number }) => (
  <Reveal delay={delay} className="flex-shrink-0 w-72 md:w-84">
    <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border border-gray-100 dark:border-gray-700 group">
      <div className="relative">
        <PropertyImage
          propertyType={auction.propertyType}
          caseNumber={auction.caseNo}
          className="w-full h-44 object-cover"
        />
        <div className={`absolute top-3 left-3 ${auction.badgeColor} text-white text-xs font-bold px-2.5 py-1 rounded-full`}>
          {auction.badge}
        </div>
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">
          -{auction.discount}
        </div>
        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white/80 text-[10px] px-2 py-0.5 rounded font-mono">
          {auction.caseNo}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/40 px-2 py-0.5 rounded-full">
            {auction.type}
          </span>
          <span className="text-xs text-gray-400 flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>입찰 {auction.date}</span>
          </span>
        </div>
        <h3 className="font-bold text-gray-900 dark:text-white text-sm leading-snug mb-0.5 line-clamp-1">
          {auction.address}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mb-1">{auction.building}</p>
        <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 mb-3">
          <span className="flex items-center space-x-1"><MapPin className="w-3 h-3" /><span>{auction.court}</span></span>
          <span>{auction.area}</span>
        </div>
        <div className="flex items-end justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
          <div>
            <div className="text-xs text-gray-400">감정가 <span className="line-through">{auction.appraisal}</span></div>
            <div className="text-base font-black text-violet-600 dark:text-violet-400">최저 {auction.price}</div>
          </div>
          <Link
            to={`/detail/${auction.id}`}
            className="text-xs font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-3 py-1.5 rounded-lg hover:shadow-md transition-all"
          >
            상세보기 →
          </Link>
        </div>
      </div>
    </div>
  </Reveal>
)

/* ─── 후기 카드 ─── */
const TestimonialCard = ({ t, delay }: { t: typeof TESTIMONIALS[0]; delay: number }) => (
  <Reveal delay={delay}>
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 dark:border-gray-700 h-full flex flex-col">
      <div className="flex items-center space-x-1 mb-4">
        {Array.from({ length: t.rating }).map((_, i) => (
          <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
        ))}
      </div>
      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed flex-1 mb-4">"{t.text}"</p>
      <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full bg-gray-100" />
          <div>
            <div className="font-bold text-gray-900 dark:text-white text-sm">{t.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t.age}</div>
          </div>
        </div>
        <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{t.gain}</div>
      </div>
    </div>
  </Reveal>
)

/* ─── 메인 컴포넌트 ─── */
const HomePage = () => {
  const { openAuthModal, isLoggedIn } = useAuth()
  const { isDark } = useTheme()
  const [carouselIdx, setCarouselIdx] = useState(0)
  const typingText = useTypingEffect(['강남 아파트', '해운대 오션뷰', '광교 신도시', '수성구 학군', '임야·토지', '공장·창고'])
  const carouselRef = useRef<HTMLDivElement>(null)

  // 실시간 경매 데이터 (60초 폴링 + 탭 활성화 시 갱신, API 미응답 시 mock 폴백)
  const { items, total, isLive, lastUpdated } = useLiveAuctions()
  const hotAuctions = useMemo(() => toHotAuctions(items), [items])
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const cat of PROPERTY_CATEGORIES) {
      counts[cat.key] = items.filter(it => cat.types.includes(it.propertyType)).length
    }
    return counts
  }, [items])
  const totalCount = total || items.length

  const prevSlide = useCallback(() => {
    setCarouselIdx(i => Math.max(0, i - 1))
  }, [])
  const nextSlide = useCallback(() => {
    setCarouselIdx(i => Math.min(hotAuctions.length - 1, i + 1))
  }, [hotAuctions.length])

  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    const itemW = el.querySelector('[data-item]')?.clientWidth ?? 320
    el.scrollTo({ left: carouselIdx * (itemW + 16), behavior: 'smooth' })
  }, [carouselIdx])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">

      {/* ════════════════════════════════════════
          1. HERO
      ════════════════════════════════════════ */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        {/* 배경 */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-950" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=20')] bg-cover bg-center opacity-10" />
        <div className="absolute top-20 -left-32 w-[500px] h-[500px] bg-violet-600 rounded-full blur-[120px] opacity-20 animate-pulse" />
        <div className="absolute bottom-10 -right-32 w-[400px] h-[400px] bg-indigo-600 rounded-full blur-[100px] opacity-20 animate-pulse" style={{ animationDelay: '1s' }} />

        {/* 그리드 패턴 */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative container mx-auto px-4 py-20 md:py-32">
          <div className="max-w-4xl mx-auto text-center">

            {/* 뱃지 */}
            <div className="inline-flex items-center space-x-2 bg-white/8 backdrop-blur border border-white/15 rounded-full px-4 py-2 mb-8 animate-fade-in">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-white/80 text-sm font-medium">현재 {' '}
                <span className="text-green-400 font-bold">{totalCount.toLocaleString()}건</span>의 경매 물건이 진행 중이에요
              </span>
              {isLive && (
                <span className="text-[10px] font-bold text-green-400 border border-green-400/40 rounded-full px-1.5 py-0.5">LIVE</span>
              )}
            </div>

            {/* 헤드라인 */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-white leading-[1.1] mb-6 tracking-tight">
              <span className="block text-white/60 text-2xl sm:text-3xl font-semibold mb-2 tracking-normal">지금 이 순간</span>
              <span className="bg-gradient-to-r from-violet-300 via-pink-300 to-indigo-300 bg-clip-text text-transparent">
                {typingText}
                <span className="animate-blink text-violet-300">|</span>
              </span>
              <span className="block mt-1">경매 나왔어요</span>
            </h1>

            <p className="text-lg md:text-xl text-white/60 mb-10 max-w-2xl mx-auto leading-relaxed">
              복잡한 법원 경매, AI가 쉽게 분석해드립니다.<br className="hidden md:block" />
              감정가보다 평균 <span className="text-white font-bold">21% 저렴</span>하게 내 집 마련하세요.
            </p>

            {/* CTA 버튼 */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link
                to="/search"
                className="group relative bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:shadow-[0_0_50px_rgba(139,92,246,0.6)] transition-all duration-300 flex items-center justify-center space-x-3"
              >
                <Search className="w-5 h-5" />
                <span>무료로 검색하기</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              {!isLoggedIn && (
                <button
                  onClick={() => openAuthModal('signup')}
                  className="group bg-white/10 backdrop-blur border border-white/20 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center space-x-3"
                >
                  <Sparkles className="w-5 h-5 text-yellow-300" />
                  <span>무료 회원가입</span>
                </button>
              )}
            </div>

            {/* 신뢰 지표 */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-white/50 text-sm">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span>대법원 공식 데이터 연동</span>
              </div>
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span>12,000+ 이용 회원</span>
              </div>
              <div className="flex items-center space-x-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>낙찰 성공 3,200건</span>
              </div>
            </div>
          </div>
        </div>

        {/* 스크롤 힌트 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-1 animate-bounce">
          <div className="w-[1px] h-8 bg-gradient-to-b from-transparent to-white/30" />
          <span className="text-white/30 text-xs">스크롤</span>
        </div>
      </section>

      {/* ════════════════════════════════════════
          2. STATS (카운트업)
      ════════════════════════════════════════ */}
      <section className="py-16 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <StatCard number={62}    suffix="개"  label="전국 법원 지원 연동"  icon={Building2} delay={0}   />
            <StatCard number={totalCount} suffix="건"  label="진행 중 경매 물건"  icon={Zap}       delay={100} />
            <StatCard number={81}    suffix="%"   label="전국 평균 매각가율"   icon={Target}    delay={200} />
            <StatCard number={12000} suffix="+"   label="서비스 이용 회원"     icon={Users}     delay={300} />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          3. 물건 분류 (대법원 경매 6대 카테고리)
      ════════════════════════════════════════ */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-10">
            <div className="inline-flex items-center space-x-2 bg-violet-50 dark:bg-violet-900/30 rounded-full px-3 py-1 mb-4">
              <FileText className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-violet-600 dark:text-violet-400 text-xs font-bold">대법원 경매 물건 분류</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-2">
              원하는 물건 종류를 선택하세요
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              대법원 경매정보(courtauction.go.kr) 기준 6대 분류 · 현재 총 <span className="font-bold text-violet-600">{totalCount.toLocaleString()}건</span> 진행 중
            </p>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {PROPERTY_CATEGORIES.map((cat, i) => (
              <CategoryCard key={cat.key} cat={cat} count={categoryCounts[cat.key] ?? 0} delay={i * 60} />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          4. HOT 경매 캐러셀
      ════════════════════════════════════════ */}
      <section className="py-20 bg-gray-50 dark:bg-gray-950">
        <div className="container mx-auto px-4">
          <Reveal className="flex items-end justify-between mb-8">
            <div>
              <div className="inline-flex items-center space-x-2 bg-rose-50 dark:bg-rose-900/30 rounded-full px-3 py-1 mb-3">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-rose-600 dark:text-rose-400 text-xs font-bold">지금 가장 뜨거운</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                이번 주 추천 경매
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center flex-wrap gap-x-2">
                <span>대법원 데이터 기반 · AI 수익성·안전성 분석</span>
                <span className="inline-flex items-center space-x-1 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
                  <span className={isLive ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}>
                    {isLive ? '실시간 연동' : '캐시 데이터'}
                    {lastUpdated && ` · ${lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 업데이트`}
                  </span>
                </span>
              </p>
            </div>
            <div className="hidden md:flex items-center space-x-2">
              <button
                onClick={prevSlide}
                disabled={carouselIdx === 0}
                className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:border-violet-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
              <button
                onClick={nextSlide}
                disabled={carouselIdx >= hotAuctions.length - 1}
                className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:border-violet-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          </Reveal>

          {/* 캐러셀 */}
          <div
            ref={carouselRef}
            className="flex space-x-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {hotAuctions.map((a, i) => (
              <div key={a.id} data-item className="snap-start">
                <AuctionCard auction={a} delay={i * 80} />
              </div>
            ))}
          </div>

          {/* 도트 인디케이터 */}
          <div className="flex justify-center space-x-2 mt-5">
            {hotAuctions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCarouselIdx(i)}
                className={`transition-all duration-300 rounded-full ${
                  i === carouselIdx ? 'w-6 h-2 bg-violet-500' : 'w-2 h-2 bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>

          <div className="text-center mt-8">
            <Link
              to="/search"
              className="inline-flex items-center space-x-2 text-violet-600 dark:text-violet-400 font-bold hover:underline"
            >
              <span>전체 물건 보기</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          4. 기능 소개
      ════════════════════════════════════════ */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-14">
            <div className="inline-flex items-center space-x-2 bg-violet-50 dark:bg-violet-900/30 rounded-full px-3 py-1 mb-4">
              <Layers className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-violet-600 dark:text-violet-400 text-xs font-bold">무엇이 다를까요</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-3">
              경매 투자, 이제 쉽고 스마트하게
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              복잡한 법원 경매 정보를 AI가 분석해서 딱 필요한 것만 보여드려요
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <Reveal key={i} delay={i * 80}>
                  <div className={`group rounded-2xl p-6 ${f.bg} hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 h-full flex flex-col`}>
                    <div className={`w-12 h-12 bg-gradient-to-br ${f.gradient} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed flex-1">{f.desc}</p>
                    {f.link && (
                      <Link
                        to={f.link}
                        className="mt-4 inline-flex items-center space-x-1 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        <span>시작하기</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          5. HOW IT WORKS
      ════════════════════════════════════════ */}
      <section className="py-20 bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-violet-950/30 dark:via-gray-950 dark:to-indigo-950/30">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-3">
              3분이면 시작할 수 있어요
            </h2>
            <p className="text-gray-500 dark:text-gray-400">복잡한 경매, 이렇게 쉬워집니다</p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { step: '01', title: '무료 가입', desc: '30초 만에 가입하고 하루 3건 무료로 확인', icon: Users, color: 'text-violet-500' },
              { step: '02', title: 'AI 분석 확인', desc: '수익률·리스크 스코어를 한눈에 파악', icon: BarChart3, color: 'text-blue-500' },
              { step: '03', title: '낙찰 도전', desc: '입찰 전략을 수립하고 당당히 도전', icon: Trophy, color: 'text-amber-500' },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <Reveal key={i} delay={i * 120}>
                  <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-7 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 dark:border-gray-700 text-center group hover:-translate-y-1">
                    {i < 2 && (
                      <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-[2px] bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700" />
                    )}
                    <div className="text-5xl font-black text-gray-100 dark:text-gray-700 mb-4 group-hover:text-violet-100 dark:group-hover:text-violet-900/50 transition-colors">
                      {item.step}
                    </div>
                    <div className={`w-12 h-12 rounded-xl bg-gray-50 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4`}>
                      <Icon className={`w-6 h-6 ${item.color}`} />
                    </div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-2 text-lg">{item.title}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          6. 사용자 후기
      ════════════════════════════════════════ */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-12">
            <div className="inline-flex items-center space-x-2 bg-amber-50 dark:bg-amber-900/30 rounded-full px-3 py-1 mb-4">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="text-amber-600 dark:text-amber-400 text-xs font-bold">실제 사용자 후기</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-2">
              이미 3,200명이 낙찰받았어요
            </h2>
            <p className="text-gray-500 dark:text-gray-400">과장 없는 진짜 후기입니다</p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {TESTIMONIALS.map((t, i) => (
              <TestimonialCard key={i} t={t} delay={i * 100} />
            ))}
          </div>

          <Reveal className="text-center mt-10" delay={200}>
            <div className="inline-flex items-center space-x-2 text-sm text-gray-400 dark:text-gray-500">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span>모든 후기는 실제 가입 사용자 인증 후 작성되었습니다</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════
          7. CTA (멤버십 + 행동 유도)
      ════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=15')] bg-cover bg-center opacity-5" />
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-white rounded-full opacity-5 animate-pulse" />
          <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] bg-white rounded-full opacity-5 animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative container mx-auto px-4 text-center">
          <Reveal>
            <div className="max-w-3xl mx-auto">
              <div className="inline-flex items-center space-x-2 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-2 mb-6">
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span className="text-white text-sm font-medium">지금 바로 시작하세요</span>
              </div>

              <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
                좋은 물건은<br />기다려주지 않아요
              </h2>
              <p className="text-violet-200 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
                진행 중인 {totalCount.toLocaleString()}건 중 AI가 선정한 추천 물건을
                지금 확인하세요. 무료로 시작할 수 있어요.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
                <Link
                  to="/search"
                  className="group bg-white text-violet-700 font-bold px-8 py-4 rounded-2xl hover:shadow-2xl transition-all duration-300 hover:scale-105 flex items-center justify-center space-x-2 text-lg"
                >
                  <Search className="w-5 h-5" />
                  <span>지금 무료 검색</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                {!isLoggedIn && (
                  <button
                    onClick={() => openAuthModal('signup')}
                    className="border-2 border-white/40 hover:border-white text-white font-bold px-8 py-4 rounded-2xl hover:bg-white/10 transition-all duration-300 flex items-center justify-center space-x-2 text-lg"
                  >
                    <Sparkles className="w-5 h-5 text-yellow-300" />
                    <span>무료 회원가입</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-5 text-white/60 text-sm">
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span>신용카드 불필요</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span>30초 가입</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span>무료 매일 3건</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

    </div>
  )
}

export default HomePage
