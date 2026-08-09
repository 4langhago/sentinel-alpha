import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Building2, MapPin, Calendar, Heart, TrendingUp } from 'lucide-react'
import { tradeApi } from '../services/tradeApi'
import { ComplexDetail, formatPrice, toPyeong, TrendPoint } from '../types/trade'
import PriceTrendChart from '../components/PriceTrendChart'
import DataSourceBadge from '../components/DataSourceBadge'
import { useAuth } from '../contexts/AuthContext'
import { isFavorite, toggleFavorite } from '../services/favoriteService'

const median = (nums: number[]) => {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/** 거래 이력을 월별 중위 평당가로 묶어 추이 데이터를 만든다. */
const buildTrend = (detail: ComplexDetail): TrendPoint[] => {
  const byMonth = new Map<string, number[]>()
  for (const h of detail.history) {
    if (h.deal_type !== 'TRADE' || h.price_per_pyeong <= 0) continue
    const ym = h.deal_date.slice(0, 7)
    if (!byMonth.has(ym)) byMonth.set(ym, [])
    byMonth.get(ym)!.push(h.price_per_pyeong)
  }
  return [...byMonth.entries()]
    .map(([month, vals]) => ({ month, count: vals.length, median_per_pyeong: median(vals) }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

const ComplexPage = () => {
  const { name = '' } = useParams()
  const decoded = decodeURIComponent(name)
  const { isLoggedIn, openAuthModal } = useAuth()

  const [detail, setDetail] = useState<ComplexDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [faved, setFaved] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    tradeApi.complex(decoded).then((d) => {
      if (!alive) return
      setDetail(d)
      setLoading(false)
    })
    setFaved(isFavorite(decoded))
    return () => {
      alive = false
    }
  }, [decoded])

  const onToggleFavorite = () => {
    if (!isLoggedIn) {
      openAuthModal('login')
      return
    }
    setFaved(toggleFavorite(decoded))
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-10 space-y-4">
        <div className="h-8 w-56 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
        <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          '{decoded}' 거래 내역을 찾을 수 없습니다
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          수집된 기간 내에 이 단지의 거래가 없거나, 단지명이 다를 수 있습니다.
        </p>
        <Link
          to="/search"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> 검색으로 돌아가기
        </Link>
      </div>
    )
  }

  const trend = buildTrend(detail)
  const rents = detail.history.filter((h) => h.deal_type === 'RENT')

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <Link
        to="/search"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600"
      >
        <ArrowLeft className="w-4 h-4" /> 검색으로
      </Link>

      {/* 헤더 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mb-2">
              {detail.name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {detail.region_name} {detail.address}
              </span>
              {detail.build_year > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {detail.build_year}년 준공
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-4 h-4" />
                {detail.property_type === 'APARTMENT' ? '아파트' : '오피스텔'}
              </span>
            </p>
          </div>
          <button
            onClick={onToggleFavorite}
            aria-pressed={faved}
            className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              faved
                ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-rose-300'
            }`}
          >
            <Heart className={`w-4 h-4 ${faved ? 'fill-current' : ''}`} />
            {faved ? '관심 단지' : '관심 등록'}
          </button>
        </div>

        <DataSourceBadge isLive={detail.is_live} lastUpdate={detail.last_update} className="mt-4" />
      </div>

      {/* 시세 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '매매 거래', value: `${detail.trade_count.toLocaleString()}건` },
          { label: '중위 거래가', value: formatPrice(detail.median_price) },
          {
            label: '중위 평당가',
            value: `${Math.round(detail.median_per_pyeong / 10000).toLocaleString()}만원`,
          },
          { label: '최근 거래일', value: detail.latest_deal_date },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{s.label}</p>
            <p className="text-lg md:text-xl font-black text-gray-900 dark:text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* 추이 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
        <PriceTrendChart trend={trend} />
      </div>

      {/* 거래 이력 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-violet-600" />
          <h2 className="font-bold text-gray-900 dark:text-white">거래 이력</h2>
          <span className="text-sm text-gray-400">최근 {detail.history.length}건</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left font-medium px-6 py-3">거래일</th>
                <th className="text-left font-medium px-4 py-3">구분</th>
                <th className="text-right font-medium px-4 py-3">전용면적</th>
                <th className="text-right font-medium px-4 py-3">층</th>
                <th className="text-right font-medium px-4 py-3">거래금액</th>
                <th className="text-right font-medium px-6 py-3">평당가</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {detail.history.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                  <td className="px-6 py-3 text-gray-700 dark:text-gray-200">{h.deal_date}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block text-xs font-semibold rounded-full px-2 py-0.5 ${
                        h.deal_type === 'TRADE'
                          ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400'
                          : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400'
                      }`}
                    >
                      {h.deal_type === 'TRADE' ? '매매' : h.rent_type === 'JEONSE' ? '전세' : '월세'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {h.area}㎡ ({toPyeong(h.area)}평)
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{h.floor}층</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                    {formatPrice(h.price)}
                    {h.deal_type === 'RENT' && h.monthly_rent > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        / 월 {Math.round(h.monthly_rent / 10000)}만
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-600 dark:text-gray-300">
                    {h.price_per_pyeong > 0
                      ? `${Math.round(h.price_per_pyeong / 10000).toLocaleString()}만원`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rents.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          전월세 {rents.length}건이 포함되어 있습니다. 평당가·중위가 통계는 매매 거래만으로 계산합니다.
        </p>
      )}
    </div>
  )
}

export default ComplexPage
