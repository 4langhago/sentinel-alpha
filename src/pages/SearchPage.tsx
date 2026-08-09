import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchX, ChevronLeft, ChevronRight, Info, Map, List, X } from 'lucide-react'
import TradeFilters from '../components/TradeFilters'
import TradeCard from '../components/TradeCard'
import DataSourceBadge from '../components/DataSourceBadge'
import MapPanel from '../components/map/MapPanel'
import { useTrades } from '../hooks/useTrades'
import { tradeApi } from '../services/tradeApi'
import { TradeSearchParams, RegionStats, SidoRegion, formatPrice, PROPERTY_LABELS } from '../types/trade'

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL 쿼리를 필터의 단일 진실 소스로 사용해 새로고침·공유에도 조건이 유지되게 한다.
  const filters = useMemo<TradeSearchParams>(
    () => ({
      q: searchParams.get('q') || undefined,
      sido: searchParams.get('sido') || undefined,
      sggCode: searchParams.get('sgg') || undefined,
      propertyType: (searchParams.get('type') as TradeSearchParams['propertyType']) || 'ALL',
      dealType: (searchParams.get('deal') as TradeSearchParams['dealType']) || 'ALL',
      minPrice: searchParams.get('minp') ? Number(searchParams.get('minp')) : undefined,
      maxPrice: searchParams.get('maxp') ? Number(searchParams.get('maxp')) : undefined,
      minArea: searchParams.get('mina') ? Number(searchParams.get('mina')) : undefined,
      maxArea: searchParams.get('maxa') ? Number(searchParams.get('maxa')) : undefined,
      buildYearMin: searchParams.get('by') ? Number(searchParams.get('by')) : undefined,
      sort: (searchParams.get('sort') as TradeSearchParams['sort']) || 'recent',
      page: Number(searchParams.get('page') || 1),
      limit: 24,
    }),
    [searchParams]
  )

  const applyFilters = (next: TradeSearchParams) => {
    const sp = new URLSearchParams()
    if (next.q) sp.set('q', next.q)
    if (next.sido) sp.set('sido', next.sido)
    if (next.sggCode) sp.set('sgg', next.sggCode)
    if (next.propertyType && next.propertyType !== 'ALL') sp.set('type', next.propertyType)
    if (next.dealType && next.dealType !== 'ALL') sp.set('deal', next.dealType)
    if (next.minPrice !== undefined) sp.set('minp', String(next.minPrice))
    if (next.maxPrice !== undefined) sp.set('maxp', String(next.maxPrice))
    if (next.minArea !== undefined) sp.set('mina', String(next.minArea))
    if (next.maxArea !== undefined) sp.set('maxa', String(next.maxArea))
    if (next.buildYearMin !== undefined) sp.set('by', String(next.buildYearMin))
    if (next.sort && next.sort !== 'recent') sp.set('sort', next.sort)
    if (next.page && next.page > 1) sp.set('page', String(next.page))
    setSearchParams(sp)
  }

  const {
    items,
    total,
    totalPages,
    isLive,
    lastUpdate,
    fetchedAt,
    loading,
    error,
    refresh,
    scope,
    scopeTruncated,
    scopeSize,
  } = useTrades(filters)

  const [stats, setStats] = useState<RegionStats | null>(null)
  useEffect(() => {
    let alive = true
    tradeApi
      .stats({ sido: filters.sido, sggCode: filters.sggCode, q: filters.q })
      .then((s) => alive && setStats(s))
    return () => {
      alive = false
    }
  }, [filters.sido, filters.sggCode, filters.q])

  // 지도 패널(타일 히트맵)에도 같은 시도/시군구 목록을 쓴다.
  const [regions, setRegions] = useState<SidoRegion[]>([])
  useEffect(() => {
    tradeApi.regions().then(setRegions)
  }, [])

  // 모바일/태블릿에서는 지도·목록을 토글로 전환한다. 데스크톱(lg)에서는 항상 둘 다 보인다.
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list')

  const page = filters.page || 1
  const goPage = (p: number) => {
    applyFilters({ ...filters, page: p })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sggName = regions.find((r) => r.sido === filters.sido)?.sggs.find((s) => s.code === filters.sggCode)?.name

  // 목록 상단 활성 필터 칩 — 지역/거래유형/매물종류만 대표로 보여주고 개별 해제 가능하게 한다.
  const activeChips: { label: string; onClear: () => void }[] = []
  if (filters.sido) {
    activeChips.push({
      label: sggName ? `${filters.sido} ${sggName}` : filters.sido,
      onClear: () => applyFilters({ ...filters, sido: '', sggCode: '', page: 1 }),
    })
  }
  if (filters.dealType && filters.dealType !== 'ALL') {
    activeChips.push({
      label: filters.dealType === 'TRADE' ? '매매' : '전월세',
      onClear: () => applyFilters({ ...filters, dealType: 'ALL', page: 1 }),
    })
  }
  if (filters.propertyType && filters.propertyType !== 'ALL') {
    activeChips.push({
      label: PROPERTY_LABELS[filters.propertyType],
      onClear: () => applyFilters({ ...filters, propertyType: 'ALL', page: 1 }),
    })
  }

  const handleSelectSido = (sido: string) => applyFilters({ ...filters, sido, sggCode: '', page: 1 })
  const handleSelectSgg = (sggCode: string) => applyFilters({ ...filters, sggCode, page: 1 })

  const mapPanel = (
    <MapPanel
      regions={regions}
      sido={filters.sido}
      sggCode={filters.sggCode}
      q={filters.q}
      onSelectSido={handleSelectSido}
      onSelectSgg={handleSelectSgg}
    />
  )

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mb-1">실거래 검색</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          국토교통부에 신고된 아파트·오피스텔 실제 거래 내역을 조건별로 찾아봅니다.
        </p>
        <DataSourceBadge
          isLive={isLive}
          lastUpdate={lastUpdate}
          fetchedAt={fetchedAt}
          loading={loading}
          onRefresh={refresh}
          className="mt-3"
        />
      </div>

      <TradeFilters value={filters} onChange={applyFilters} />

      {/* 현재 조건의 시세 요약 */}
      {stats && stats.count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '매매 거래', value: `${stats.count.toLocaleString()}건` },
            { label: '중위가', value: formatPrice(stats.median_price) },
            {
              label: '중위 평당가',
              value: `${Math.round(stats.median_per_pyeong / 10000).toLocaleString()}만원`,
            },
            { label: '최고가', value: formatPrice(stats.max_price) },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3"
            >
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-base md:text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 태블릿/모바일: 지도 ⇄ 목록 토글 */}
      <div className="lg:hidden flex items-center gap-2">
        <button
          onClick={() => setMobileView('list')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            mobileView === 'list'
              ? 'bg-violet-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          <List className="w-4 h-4" />
          목록
        </button>
        <button
          onClick={() => setMobileView('map')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            mobileView === 'map'
              ? 'bg-violet-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          <Map className="w-4 h-4" />
          지도
        </button>
      </div>

      {/* 태블릿/모바일 지도 패널 (토글 시에만 노출) */}
      <div className={mobileView === 'map' ? 'lg:hidden block' : 'lg:hidden hidden'}>{mapPanel}</div>

      {/* 2단 레이아웃: 좌측 목록(스크롤) + 우측 지도(sticky) */}
      <div className="lg:grid lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_440px] lg:gap-6 lg:items-start">
        <div className={`space-y-6 ${mobileView === 'map' ? 'hidden lg:block' : ''}`}>
          {/* 활성 필터 칩 + 총 건수 */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-300 shrink-0">
              총 <span className="font-bold text-violet-600 dark:text-violet-400">{total.toLocaleString()}</span>건
              {totalPages > 1 && (
                <span className="text-gray-400 ml-2">
                  ({page} / {totalPages} 페이지)
                </span>
              )}
            </p>
            {activeChips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs font-semibold rounded-full pl-3 pr-1.5 py-1"
              >
                {c.label}
                <button
                  onClick={c.onClear}
                  className="hover:bg-violet-100 dark:hover:bg-violet-500/20 rounded-full p-0.5"
                  aria-label={`${c.label} 필터 해제`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          {/* 시도/전국 범위는 최신 일부만 검색한다. 전체를 뒤진 것처럼 보이면 안 되므로 명시한다. */}
          {isLive && scopeTruncated && (
            <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 text-sky-800 dark:text-sky-300 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {scope === 'sido' ? '이 시도의' : '전국'} 최신{' '}
                <strong>{scopeSize.toLocaleString()}건</strong> 안에서 검색한 결과입니다.
                <strong> 시군구를 선택하면</strong> 해당 지역 전체 거래를 빠짐없이 검색합니다.
              </span>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <SearchX className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-700 dark:text-gray-200 font-semibold mb-1">조건에 맞는 거래가 없습니다</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">검색어나 필터를 넓혀보세요.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {items.map((item) => (
                <TradeCard key={item.id} item={item} medianPerPyeong={stats?.median_per_pyeong} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => goPage(page - 1)}
                disabled={page <= 1}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {/* 현재 페이지 주변 5개만 노출 */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                return start + i
              })
                .filter((p) => p >= 1 && p <= totalPages)
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => goPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold ${
                      p === page
                        ? 'bg-violet-600 text-white'
                        : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              <button
                onClick={() => goPage(page + 1)}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 데스크톱 지도 패널: 뷰포트 높이에 맞춰 sticky */}
        <div className="hidden lg:block sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">{mapPanel}</div>
      </div>
    </div>
  )
}

export default SearchPage
