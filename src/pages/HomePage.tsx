import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, TrendingUp, MapPin, ArrowRight, BarChart3, Building2, Info } from 'lucide-react'
import { tradeApi } from '../services/tradeApi'
import { useTrades } from '../hooks/useTrades'
import { RegionStats, formatPrice } from '../types/trade'
import TradeCard from '../components/TradeCard'
import PriceTrendChart, { computeCompletedChange } from '../components/PriceTrendChart'
import DataSourceBadge from '../components/DataSourceBadge'

const HomePage = () => {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [sido, setSido] = useState('서울')
  // 수집된 데이터가 있는 지역만 노출한다. 하드코딩하면 데이터 없는 지역이
  // 눌리고 0건이 나와 고장난 것처럼 보인다.
  const [availableSido, setAvailableSido] = useState<string[]>(['서울'])
  const [stats, setStats] = useState<RegionStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const params = useMemo(() => ({ sido, sort: 'recent' as const, limit: 6 }), [sido])
  const { items, total, isLive, lastUpdate, fetchedAt, loading, error, refresh } = useTrades(params)

  // 히어로에 올릴 "신뢰되는 숫자" 하나: 완결된 월 기준 증감률.
  // 당월(집계 중)은 표본이 적어 튈 수 있으므로 제외한다 (PriceTrendChart와 동일 규칙).
  const heroChange = useMemo(
    () => (stats ? computeCompletedChange(stats.trend) : { changePct: null }),
    [stats]
  )

  useEffect(() => {
    let alive = true
    tradeApi.regions().then((regions) => {
      if (!alive || regions.length === 0) return
      const list = regions.map((r) => r.sido)
      setAvailableSido(list)
      // 기본 선택 지역에 데이터가 없으면 첫 번째 지역으로 옮긴다.
      setSido((cur) => (list.includes(cur) ? cur : list[0]))
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    setStatsLoading(true)
    tradeApi.stats({ sido }).then((s) => {
      if (alive) {
        setStats(s)
        setStatsLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [sido])

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = keyword.trim()
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
  }

  return (
    <div>
      {/* ── Hero ─────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-950">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.4),transparent_50%)]" />
        <div className="relative container mx-auto px-4 py-12 md:py-16">
          <div className="max-w-3xl mx-auto text-center">
            <div
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/15 rounded-full px-4 py-2 mb-6"
              title="매매·전월세 전체를 포함한 최신 조회 결과입니다"
            >
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-white/80 text-sm font-semibold">
                {sido} 최근 거래 <span className="text-emerald-400 font-bold">{total.toLocaleString()}건</span>
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight mb-3 tracking-tight">
              진짜 거래된 가격으로 시세를 봅니다
            </h1>
            <p className="text-base text-white/60 mb-6 max-w-xl mx-auto leading-relaxed">
              국토교통부 실거래가를 기반으로 아파트·오피스텔의 실제 거래가와 평당가 추이를 분석합니다.
            </p>

            {/* 단 하나의 신뢰되는 숫자: 선택 지역의 중위 평당가와 완결 월 기준 증감률 */}
            <div className="inline-flex flex-col items-center gap-1 mb-7 px-6 py-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-xs font-medium text-white/50">{sido} 아파트 중위 평당가</span>
              {statsLoading || !stats || stats.count === 0 ? (
                <span className="text-2xl font-black text-white/40">—</span>
              ) : (
                <>
                  <span className="text-3xl md:text-4xl font-black text-white tabular-nums">
                    {Math.round(stats.median_per_pyeong / 10000).toLocaleString()}
                    <span className="text-lg font-semibold text-white/60 ml-1">만원</span>
                  </span>
                  {heroChange.changePct !== null ? (
                    <span
                      className={`text-sm font-semibold ${
                        heroChange.changePct > 0
                          ? 'text-data-up'
                          : heroChange.changePct < 0
                          ? 'text-data-down'
                          : 'text-white/50'
                      }`}
                    >
                      {heroChange.baseMonth} 대비 {heroChange.changePct > 0 ? '+' : ''}
                      {heroChange.changePct}%
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-white/40">완결된 월이 부족해 증감률 계산 불가</span>
                  )}
                </>
              )}
            </div>

            <form onSubmit={submitSearch} className="max-w-xl mx-auto">
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="단지명이나 지역을 입력하세요 (예: 대치동 은마)"
                  className="w-full pl-14 pr-32 py-4 rounded-2xl bg-white/95 backdrop-blur text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white font-semibold text-sm hover:shadow-lg transition-all"
                >
                  검색
                </button>
              </div>
            </form>

            <div className="mt-6 flex justify-center">
              <DataSourceBadge
                isLive={isLive}
                lastUpdate={lastUpdate}
                fetchedAt={fetchedAt}
                loading={loading}
                onRefresh={refresh}
                className="text-white/70 [&_span.text-gray-500]:text-white/60 [&_span.text-gray-400]:text-white/50"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12 space-y-14">
        {error && (
          <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ── 지역 선택 ─────────────────────── */}
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 mr-2">
              <MapPin className="w-4 h-4" /> 지역
            </span>
            {availableSido.map((r) => (
              <button
                key={r}
                onClick={() => setSido(r)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  sido === r
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary-300'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </section>

        {/* ── 시세 요약 ─────────────────────── */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-primary-600" />
            {sido} 아파트 시세 요약
          </h2>
          <p
            className="text-slate-500 dark:text-slate-400 text-sm mb-6 inline-flex items-center gap-1"
            title="위 최근 조회 건수는 전월세를 포함한 최신 조회 결과라 이 집계와 다를 수 있습니다"
          >
            매매 실거래 전체 집계 기준
            <Info className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          </p>

          {statsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : !stats || stats.count === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">
              {sido} 지역의 매매 거래 데이터가 아직 없습니다.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: '매매 거래 건수', value: `${stats.count.toLocaleString()}건` },
                  { label: '중위 거래가', value: formatPrice(stats.median_price) },
                  {
                    label: '중위 평당가',
                    value: `${Math.round(stats.median_per_pyeong / 10000).toLocaleString()}만원`,
                  },
                  { label: '최고 거래가', value: formatPrice(stats.max_price) },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5"
                  >
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{s.label}</p>
                    <p className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tabular-nums">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6">
                <PriceTrendChart trend={stats.trend} />
              </div>
            </>
          )}
        </section>

        {/* ── 최근 실거래 ───────────────────── */}
        <section>
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-7 h-7 text-primary-600" />
                {sido} 최근 실거래
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                가장 최근 신고된 거래부터 (매매·전월세 전체)
              </p>
            </div>
            <Link
              to={`/search?sido=${encodeURIComponent(sido)}`}
              className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
            >
              전체 보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loading && items.length === 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">{sido} 지역 거래 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <TradeCard key={item.id} item={item} stats={stats ?? undefined} />
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              to={`/search?sido=${encodeURIComponent(sido)}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white font-semibold hover:shadow-lg transition-all"
            >
              조건 걸고 더 찾아보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

export default HomePage
