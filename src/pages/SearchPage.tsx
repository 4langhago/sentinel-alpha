import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchX, ChevronLeft, ChevronRight, Info, Map, List, X, LayoutGrid, Rows3 } from 'lucide-react'
import TradeFilters from '../components/TradeFilters'
import TradeCard from '../components/TradeCard'
import TradeTable from '../components/TradeTable'
import DataSourceBadge from '../components/DataSourceBadge'
import MapPanel from '../components/map/MapPanel'
import { useTrades } from '../hooks/useTrades'
import { tradeApi } from '../services/tradeApi'
import {
  TradeSearchParams,
  RegionStats,
  SidoRegion,
  AreaUnit,
  baselinePerPyeong,
  formatPrice,
  PROPERTY_LABELS,
} from '../types/trade'
import { buildActiveConditions, sanitizeForPropertyType } from '../utils/filterRules'
import { RecentSearch, loadRecentSearches, saveRecentSearch } from '../utils/recentSearches'

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL 쿼리를 필터의 단일 진실 소스로 사용해 새로고침·공유에도 조건이 유지되게 한다.
  const filters = useMemo<TradeSearchParams>(() => {
    const parsed: TradeSearchParams = {
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
      // 상가 건물용도 / 토지 지목은 다중 선택이라 콤마로 직렬화한다.
      useTypes: searchParams.get('ut') ? searchParams.get('ut')!.split(',').filter(Boolean) : undefined,
      minLandArea: searchParams.get('minla') ? Number(searchParams.get('minla')) : undefined,
      maxLandArea: searchParams.get('maxla') ? Number(searchParams.get('maxla')) : undefined,
      excludeShare: searchParams.get('nosd') === '1' ? true : undefined,
      sort: (searchParams.get('sort') as TradeSearchParams['sort']) || 'recent',
      page: Number(searchParams.get('page') || 1),
      limit: 24,
    }
    // 종목 전환 클릭은 sanitizeForPropertyType을 거치지만, URL을 직접 열거나
    // (공유 링크·북마크·주소창 편집) 뒤로가기로 복원된 상태는 이 함수를 한 번도
    // 안 거친다. 그러면 "이 종목엔 없는 조건"이 필터 UI에는 안 보이면서
    // 서버로는 그대로 나가 원인 불명의 0건이나 틀린 결과를 만든다.
    // URL이 곧 진실 소스이므로, 그 값을 읽는 이 지점에서 반드시 한 번 거른다.
    return sanitizeForPropertyType(parsed, parsed.propertyType || 'ALL').params
  }, [searchParams])

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
    if (next.useTypes && next.useTypes.length > 0) sp.set('ut', next.useTypes.join(','))
    if (next.minLandArea !== undefined) sp.set('minla', String(next.minLandArea))
    if (next.maxLandArea !== undefined) sp.set('maxla', String(next.maxLandArea))
    if (next.excludeShare) sp.set('nosd', '1')
    if (next.sort && next.sort !== 'recent') sp.set('sort', next.sort)
    if (next.page && next.page > 1) sp.set('page', String(next.page))
    // view(카드/테이블)와 au(면적 표기 단위)는 검색 조건이 아니라 화면 표시 방식이라
    // 필터를 갈아끼워도 그대로 유지한다.
    const currentView = searchParams.get('view')
    if (currentView) sp.set('view', currentView)
    const currentUnit = searchParams.get('au')
    if (currentUnit) sp.set('au', currentUnit)
    setSearchParams(sp)
  }

  // 데스크톱 전용 목록 표시 방식(카드/테이블). URL 쿼리로 보존해 새로고침·공유에도 유지된다.
  const view = (searchParams.get('view') as 'card' | 'table') || 'card'
  const setView = (v: 'card' | 'table') => {
    const sp = new URLSearchParams(searchParams)
    if (v === 'table') sp.set('view', 'table')
    else sp.delete('view')
    setSearchParams(sp)
  }

  // 면적 표기 단위(㎡/평/평형). 목록·표가 한 단위로 통일돼야 카드끼리 비교가 된다.
  const areaUnit = (searchParams.get('au') as AreaUnit) || 'sqm'
  const setAreaUnit = (u: AreaUnit) => {
    const sp = new URLSearchParams(searchParams)
    if (u === 'sqm') sp.delete('au')
    else sp.set('au', u)
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
    facets,
  } = useTrades(filters)

  const [stats, setStats] = useState<RegionStats | null>(null)
  // 요약 카드 아래 각주에 쓸 값들.
  const statsTruncated = Boolean(stats?.scope_truncated)
  // 추이의 마지막 달 = 아직 신고가 다 안 들어온 "집계 중" 달.
  const latestMonthLabel = stats?.trend?.length ? stats.trend[stats.trend.length - 1].month : null
  useEffect(() => {
    let alive = true
    // 요약 통계도 지금 보고 있는 종목·거래유형에 맞춰야 한다. 토지를 보면서
    // 아파트가 섞인 중위 평당가를 요약으로 보여주면 숫자가 거짓말이 된다.
    tradeApi
      .stats({
        sido: filters.sido,
        sggCode: filters.sggCode,
        q: filters.q,
        propertyType: filters.propertyType,
        dealType: filters.dealType,
      })
      .then((s) => alive && setStats(s))
    return () => {
      alive = false
    }
  }, [filters.sido, filters.sggCode, filters.q, filters.propertyType, filters.dealType])

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

  // 활성 조건 목록 — TradeFilters의 개수 배지와 같은 함수를 써서 숫자가 어긋나지 않는다.
  // 지역·거래유형·종목뿐 아니라 가격·면적·준공연도·용도·지분거래까지 전부 칩이 된다.
  const activeConditions = buildActiveConditions(filters, {
    sggName,
    propertyLabel: (pt) => PROPERTY_LABELS[pt],
  })
  const clearCondition = (clear: Partial<TradeSearchParams>) =>
    applyFilters({ ...filters, ...clear, page: 1 })

  // 종목을 바꾸며 무효해진 조건을 자동 해제했을 때 한 줄로 알린다.
  // 조용히 지우면 "내가 건 조건이 왜 사라졌지"가 되고, 남겨두면 이유 없는 0건이 된다.
  const [notice, setNotice] = useState<string | null>(null)

  // 최근 검색 조건 — URL 쿼리가 이미 조건의 단일 진실 소스라 그 문자열을 그대로 저장한다.
  //
  // 다만 page(페이지 번호)·view(카드/테이블)·au(면적 단위)는 "검색 조건"이
  // 아니라 화면 표시 방식이다. 이 값들까지 키에 넣으면 5페이지까지만 넘겨도
  // 서로 다른 이력 5개가 쌓여 정작 최근 5건 한도 안에 실제 검색 조건이
  // 하나도 안 남는 사고가 난다 — 페이지를 넘기는 흔한 행동이 이력을 밀어낸다.
  // 그래서 이 세 키를 뺀 사본으로 저장 키와 복원용 쿼리를 만든다.
  const conditionQuery = useMemo(() => {
    const sp = new URLSearchParams(searchParams)
    sp.delete('page')
    sp.delete('view')
    sp.delete('au')
    return sp.toString()
  }, [searchParams])

  const [recent, setRecent] = useState<RecentSearch[]>(() => loadRecentSearches())
  useEffect(() => {
    // 조건이 하나도 없는 첫 진입까지 이력에 쌓으면 드롭다운이 빈 검색으로 채워진다.
    if (activeConditions.length === 0 && !filters.q) return
    const label = [filters.q, ...activeConditions.map((c) => c.label)].filter(Boolean).join(' · ')
    setRecent(saveRecentSearch({ query: conditionQuery, label }))
    // 페이지·뷰·면적단위 전환만으로는 새 이력을 만들지 않도록 조건 문자열이
    // 바뀔 때만(=conditionQuery가 바뀔 때만) 저장한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditionQuery])

  const restoreRecent = (entry: RecentSearch) => setSearchParams(new URLSearchParams(entry.query))

  const handleSelectSido = (sido: string) => applyFilters({ ...filters, sido, sggCode: '', page: 1 })
  const handleSelectSgg = (sggCode: string) => applyFilters({ ...filters, sggCode, page: 1 })

  // 요약 칩 라벨/값. "매매 거래"라고 써놓고 전월세가 섞이거나, "중위 평당가"라며
  // 아파트·상가·토지 혼합값을 보여주면 숫자가 거짓말이 된다.
  const summaryScopeLabel =
    filters.dealType === 'RENT' ? '전월세' : filters.dealType === 'TRADE' ? '매매' : '전체'
  const summaryProperty = filters.propertyType && filters.propertyType !== 'ALL' ? filters.propertyType : null
  const summaryPerPyeong = summaryProperty
    ? baselinePerPyeong(stats ?? undefined, summaryProperty)
    : stats?.median_per_pyeong || 0
  const summaryPerPyeongLabel =
    summaryProperty && stats?.per_property?.[summaryProperty]
      ? `${PROPERTY_LABELS[summaryProperty]} 중위 평당가`
      : '중위 평당가 (전체 종목)'

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
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-1">실거래 검색</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          국토교통부에 신고된 아파트·오피스텔·상가·토지 실제 거래 내역을 조건별로 찾아봅니다.
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

      <TradeFilters
        value={filters}
        onChange={applyFilters}
        facets={facets}
        areaUnit={areaUnit}
        onAreaUnitChange={setAreaUnit}
        recent={recent}
        onRestoreRecent={restoreRecent}
        onNotice={setNotice}
      />

      {/* 현재 조건의 시세 요약 — 모바일은 첫 거래까지 스크롤을 줄이려 가로 스크롤 칩으로, md 이상은 4칸 그리드로 */}
      {stats && stats.count > 0 && (
        <div className="flex md:grid md:grid-cols-4 gap-3 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0 snap-x snap-mandatory md:snap-none scrollbar-hide">
          {[
            { label: `${summaryScopeLabel} 거래`, value: `${stats.count.toLocaleString()}건` },
            { label: '중위가', value: formatPrice(stats.median_price) },
            {
              // 종목별 중위값이 있으면 그것을 쓴다. 없으면 전 종목 혼합값이므로 라벨을 바꿔 밝힌다.
              label: summaryPerPyeongLabel,
              value: `${Math.round(summaryPerPyeong / 10000).toLocaleString()}만원`,
            },
            { label: '최고가', value: formatPrice(stats.max_price) },
          ].map((s) => (
            <div
              key={s.label}
              className="shrink-0 w-[42vw] sm:w-[180px] md:w-auto snap-start bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3"
            >
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.label}</p>
              <p className="text-base md:text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 요약 숫자가 어떤 모집단에서 나왔는지 밝힌다.
          - 검색어를 붙이면 사전 계산치 대신 최신 N건 표본에서 다시 계산돼 건수가 급감한다.
          - 당월은 신고 기한(계약 후 30일) 때문에 아직 덜 들어와 중위값이 낮게 나온다.
            차트는 이미 당월을 점선으로 구분하지만 요약 카드는 그대로 섞고 있었다. */}
      {stats && stats.count > 0 && (statsTruncated || latestMonthLabel) && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-3">
          {statsTruncated && (
            <span>
              최근 {(stats.scope_size || 0).toLocaleString()}건 표본 기준
              {latestMonthLabel ? ' · ' : ''}
            </span>
          )}
          {latestMonthLabel && <span>{latestMonthLabel} 거래 포함(집계 중, 확정치 아님)</span>}
        </p>
      )}

      {/* 태블릿/모바일 지도 패널 (토글 시에만 노출). 하단 sticky 토글바에 가리지 않게 여백을 둔다. */}
      <div className={mobileView === 'map' ? 'lg:hidden block pb-16' : 'lg:hidden hidden'}>{mapPanel}</div>

      {/* 2단 레이아웃: 좌측 목록(스크롤) + 우측 지도(sticky) */}
      <div className="lg:grid lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_440px] lg:gap-6 lg:items-start">
        <div className={`space-y-6 ${mobileView === 'map' ? 'hidden lg:block' : 'pb-16 lg:pb-0'}`}>
          {/* 활성 필터 칩 + 총 건수 + (데스크톱) 카드/테이블 전환 */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-600 dark:text-slate-300 shrink-0">
              총 <span className="font-bold text-primary-600 dark:text-primary-400">{total.toLocaleString()}</span>건
              {totalPages > 1 && (
                <span className="text-slate-400 ml-2">
                  ({page} / {totalPages} 페이지)
                </span>
              )}
            </p>
            {activeConditions.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 text-xs font-semibold rounded-full pl-3 pr-1.5 py-1"
                title={`${c.group}: ${c.label}`}
              >
                {c.label}
                <button
                  onClick={() => clearCondition(c.clear)}
                  className="hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-full p-0.5"
                  aria-label={`${c.group} ${c.label} 조건 해제`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {/* 여러 거래의 가격을 세로로 비교하려면 테이블 뷰가 유리하다. 데스크톱 전용. */}
            <div className="hidden lg:inline-flex ml-auto items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setView('card')}
                aria-pressed={view === 'card'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  view === 'card'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                카드
              </button>
              <button
                onClick={() => setView('table')}
                aria-pressed={view === 'table'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  view === 'table'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Rows3 className="w-3.5 h-3.5" />
                테이블
              </button>
            </div>
          </div>

          {/* 종목을 바꾸며 무효해진 조건을 자동 해제했음을 한 줄로 알린다 */}
          {notice && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 rounded-xl px-4 py-2.5 text-sm flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1">{notice}</span>
              <button
                onClick={() => setNotice(null)}
                aria-label="안내 닫기"
                className="shrink-0 hover:text-amber-900 dark:hover:text-amber-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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
                <div key={i} className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 px-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
              <SearchX className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-700 dark:text-slate-200 font-semibold mb-1">조건에 맞는 거래가 없습니다</p>
              {/* "필터를 넓혀보세요"만 적어두면 어느 조건이 결과를 죽였는지 알 수 없다.
                  걸린 조건을 그대로 나열해 한 번의 클릭으로 하나씩 풀 수 있게 한다. */}
              {activeConditions.length > 0 || filters.q ? (
                <>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
                    아래 조건을 하나씩 풀어보세요.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {filters.q && (
                      <button
                        onClick={() => applyFilters({ ...filters, q: undefined, page: 1 })}
                        className="inline-flex items-center gap-1 text-xs font-semibold rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-rose-300 hover:text-rose-600 dark:hover:text-rose-400 pl-3 pr-2 py-1.5"
                      >
                        검색어 &ldquo;{filters.q}&rdquo; 해제
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {activeConditions.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => clearCondition(c.clear)}
                        className="inline-flex items-center gap-1 text-xs font-semibold rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-rose-300 hover:text-rose-600 dark:hover:text-rose-400 pl-3 pr-2 py-1.5"
                      >
                        {c.group} {c.label} 해제
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                    <button
                      onClick={() => applyFilters({ sort: filters.sort, page: 1, limit: filters.limit })}
                      className="text-xs font-semibold rounded-full bg-primary-600 text-white px-3 py-1.5 hover:bg-primary-700"
                    >
                      조건 전체 초기화
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  이 범위에 신고된 거래가 아직 없습니다.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* 모바일/태블릿은 항상 카드. 데스크톱은 view에 따라 카드 또는 조밀 테이블. */}
              <div className={`grid md:grid-cols-2 gap-4 ${view === 'table' ? 'lg:hidden' : ''}`}>
                {items.map((item) => (
                  <TradeCard key={item.id} item={item} stats={stats ?? undefined} areaUnit={areaUnit} />
                ))}
              </div>
              {view === 'table' && (
                <div className="hidden lg:block">
                  <TradeTable items={items} stats={stats ?? undefined} areaUnit={areaUnit} />
                </div>
              )}
            </>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => goPage(page - 1)}
                disabled={page <= 1}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
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
                        ? 'bg-primary-600 text-white'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              <button
                onClick={() => goPage(page + 1)}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 데스크톱 지도 패널: 뷰포트 높이에 맞춰 sticky */}
        <div className="hidden lg:block sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">{mapPanel}</div>
      </div>

      {/* 모바일/태블릿 하단 고정 지도⇄목록 토글. 최상단에 쌓아두지 않아 첫 매물까지 스크롤이 짧아진다. */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-t border-slate-100 dark:border-slate-700 px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 max-w-md mx-auto">
          <button
            onClick={() => setMobileView('list')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              mobileView === 'list'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <List className="w-4 h-4" />
            목록
          </button>
          <button
            onClick={() => setMobileView('map')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              mobileView === 'map'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Map className="w-4 h-4" />
            지도
          </button>
        </div>
      </div>
    </div>
  )
}

export default SearchPage
