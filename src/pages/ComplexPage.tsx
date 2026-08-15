import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Building2, MapPin, Calendar, Heart, TrendingUp, ShieldAlert, Info } from 'lucide-react'
import { tradeApi } from '../services/tradeApi'
import { ComplexDetail, estimateSupplyPyeong, formatPrice, toPyeong, TrendPoint, PROPERTY_LABELS } from '../types/trade'
import PriceTrendChart from '../components/PriceTrendChart'
import DataSourceBadge from '../components/DataSourceBadge'
import { useAuth } from '../contexts/AuthContext'
import { isFavorite, toggleFavorite } from '../services/favoriteService'
import { computeRiskScore, RiskGrade } from '../utils/riskScore'

/** 리스크 등급별 배지 스타일 (낮음=안전 톤, 높음=경고 톤) */
const RISK_GRADE_STYLE: Record<RiskGrade, { badge: string; bar: string }> = {
  낮음: { badge: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500' },
  보통: { badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400', bar: 'bg-amber-500' },
  높음: { badge: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400', bar: 'bg-rose-500' },
}

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
  const risk = computeRiskScore(detail)

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <Link
        to="/search"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600"
      >
        <ArrowLeft className="w-4 h-4" /> 검색으로
      </Link>

      {/* 헤더 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
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
                {PROPERTY_LABELS[detail.property_type] || detail.property_type}
              </span>
              {(() => {
                const rep = estimateSupplyPyeong(detail.history[0]?.area ?? 0, detail.property_type)
                return rep !== null ? (
                  <span
                    className="text-xs text-gray-400 dark:text-gray-500"
                    title="공급면적 기준 통상 평형 추정치입니다. 실제 전용률은 세대마다 달라 다를 수 있습니다."
                  >
                    통상 {rep}평형대
                  </span>
                ) : null
              })()}
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

      {/* 리스크 스코어 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-5 h-5 text-violet-600" />
          <h2 className="font-bold text-gray-900 dark:text-white">데이터 기반 리스크 스코어</h2>
        </div>

        {!risk.available ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-xl px-4 py-3">
            {risk.message}
          </p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-black text-gray-900 dark:text-white">{risk.score}</div>
              <div className="space-y-1">
                <span
                  className={`inline-block text-xs font-semibold rounded-full px-2.5 py-1 ${RISK_GRADE_STYLE[risk.grade].badge}`}
                >
                  리스크 {risk.grade}
                </span>
                <p className="text-xs text-gray-400 dark:text-gray-500">0(낮음) ~ 100(높음)</p>
              </div>
            </div>

            {/* 근거 항목: 점수만 노출하지 않고 계산에 쓰인 요소를 모두 보여준다 */}
            <ul className="space-y-3">
              {risk.factors.map((f) => (
                <li key={f.key} className="text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{f.label}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {f.skipped ? '미반영' : `${f.contribution} / ${f.weight}점`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full ${f.skipped ? 'bg-gray-300 dark:bg-gray-600' : RISK_GRADE_STYLE[risk.grade].bar}`}
                      style={{ width: f.skipped ? '0%' : `${Math.round((f.contribution / f.weight) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{f.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            이 점수는 실거래 데이터로 계산한 참고 지표이며, 투자 판단의 근거를 대신하지 않습니다. 최종 투자 결정과 그 책임은 이용자 본인에게 있습니다.
          </span>
        </p>
      </div>

      {/* 추이 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
        <PriceTrendChart trend={trend} />
      </div>

      {/* 거래 이력 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-violet-600" />
          <h2 className="font-bold text-gray-900 dark:text-white">거래 이력</h2>
          <span className="text-sm text-gray-400">최근 {detail.history.length}건</span>
        </div>

        {/* 모바일: 카드 목록. 6컬럼 테이블은 폭 600px를 넘겨 가로 스크롤을 강제하므로 쓰지 않는다. */}
        <ul className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
          {detail.history.map((h) => (
            <li key={h.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-gray-900 dark:text-white tabular-nums">
                  {formatPrice(h.price)}
                  {h.deal_type === 'RENT' && h.monthly_rent > 0 && (
                    <span className="text-xs font-medium text-gray-500 ml-1">
                      / 월 {Math.round(h.monthly_rent / 10000)}만
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 inline-block text-xs font-semibold rounded-full px-2 py-0.5 ${
                    h.deal_type === 'TRADE'
                      ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400'
                      : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400'
                  }`}
                >
                  {h.deal_type === 'TRADE' ? '매매' : h.rent_type === 'JEONSE' ? '전세' : '월세'}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                {h.deal_date} · 전용 {h.area}㎡({toPyeong(h.area)}평)
                {(() => {
                  const sp = estimateSupplyPyeong(h.area, h.property_type)
                  return sp !== null ? ` · 통상 ${sp}평형` : ''
                })()}{' '}
                · {h.floor}층
                {h.price_per_pyeong > 0 &&
                  ` · 평당 ${Math.round(h.price_per_pyeong / 10000).toLocaleString()}만원`}
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left font-medium px-6 py-3">거래일</th>
                <th className="text-left font-medium px-4 py-3">구분</th>
                <th
                  className="text-right font-medium px-4 py-3"
                  title="전용면적(실거래 기준) · 괄호 안은 흔히 부르는 공급면적 기준 평형 추정치"
                >
                  전용면적
                </th>
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
                    {(() => {
                      const sp = estimateSupplyPyeong(h.area, h.property_type)
                      return sp !== null ? (
                        <span
                          className="text-gray-400 dark:text-gray-500 ml-1"
                          title="공급면적 기준 통상 평형 추정치입니다. 실제 전용률은 세대마다 달라 다를 수 있습니다."
                        >
                          · {sp}평형
                        </span>
                      ) : null
                    })()}
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
