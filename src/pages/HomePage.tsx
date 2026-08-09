import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, TrendingUp, MapPin, ArrowRight, BarChart3, Building2 } from 'lucide-react'
import { tradeApi } from '../services/tradeApi'
import { useTrades } from '../hooks/useTrades'
import { RegionStats, formatPrice } from '../types/trade'
import TradeCard from '../components/TradeCard'
import PriceTrendChart from '../components/PriceTrendChart'
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
        <div className="relative container mx-auto px-4 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/15 rounded-full px-4 py-2 mb-8">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-white/80 text-sm font-medium">
                {sido} 최근 조회된 실거래(매매·전월세 전체){' '}
                <span className="text-emerald-400 font-bold">{total.toLocaleString()}건</span>
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white leading-tight mb-5 tracking-tight">
              <span className="bg-gradient-to-r from-violet-300 via-pink-300 to-indigo-300 bg-clip-text text-transparent">
                진짜 거래된 가격
              </span>
              <span className="block mt-2">으로 시세를 봅니다</span>
            </h1>
            <p className="text-lg text-white/60 mb-10 max-w-xl mx-auto leading-relaxed">
              국토교통부 실거래가를 기반으로 아파트·오피스텔의 실제 거래가와 평당가 추이를 분석합니다.
            </p>

            <form onSubmit={submitSearch} className="max-w-xl mx-auto">
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="단지명이나 지역을 입력하세요 (예: 대치동 은마)"
                  className="w-full pl-14 pr-32 py-4 rounded-2xl bg-white/95 backdrop-blur text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm hover:shadow-lg transition-all"
                >
                  검색
                </button>
              </div>
            </form>

            <div className="mt-8 flex justify-center">
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
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200 mr-2">
              <MapPin className="w-4 h-4" /> 지역
            </span>
            {availableSido.map((r) => (
              <button
                key={r}
                onClick={() => setSido(r)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  sido === r
                    ? 'bg-violet-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-violet-300'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </section>

        {/* ── 시세 요약 ─────────────────────── */}
        <section>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mb-1 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-violet-600" />
            {sido} 아파트 시세 요약
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            매매 실거래 전체 집계 기준 (위 최근 조회 건수는 전월세를 포함한 최신 조회 결과라 이 집계와 다를 수 있습니다)
          </p>

          {statsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : !stats || stats.count === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
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
                    className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5"
                  >
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{s.label}</p>
                    <p className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
                <PriceTrendChart trend={stats.trend} />
              </div>
            </>
          )}
        </section>

        {/* ── 최근 실거래 ───────────────────── */}
        <section>
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-7 h-7 text-violet-600" />
                {sido} 최근 실거래
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                가장 최근 신고된 거래부터 (매매·전월세 전체)
              </p>
            </div>
            <Link
              to={`/search?sido=${encodeURIComponent(sido)}`}
              className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
              전체 보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loading && items.length === 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">{sido} 지역 거래 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <TradeCard key={item.id} item={item} medianPerPyeong={stats?.median_per_pyeong} />
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              to={`/search?sido=${encodeURIComponent(sido)}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:shadow-lg transition-all"
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
