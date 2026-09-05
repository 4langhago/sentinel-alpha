import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchX, ChevronLeft, ChevronRight, AlertTriangle, Gavel, FlaskConical, Database } from 'lucide-react'
import AuctionFilters from '../components/AuctionFilters'
import AuctionCard from '../components/AuctionCard'
import { auctionApi } from '../services/auctionApi'
import { tradeApi } from '../services/tradeApi'
import { AuctionSearchParams, AuctionSearchResult, AuctionStats } from '../types/auction'
import { formatPrice } from '../types/trade'
import type { RegionStats } from '../types/trade'

/**
 * 경공매(온비드 공매) 물건 화면.
 *
 * 실거래 화면과 분리한 이유는 데이터의 성격이 근본적으로 다르기 때문이다.
 * 실거래는 이미 끝난 사실이라 틀려도 "정보가 부정확한" 정도지만, 공매는
 * 사용자가 그 정보를 보고 실제로 돈을 거는 미래 일정이다. 그래서 이 화면은
 * 다음 세 가지를 구조적으로 강제한다:
 *   1. 상단에 "우리 데이터는 하루 2회 스냅샷"이라는 고지
 *   2. 카드마다 last_seen_at (우리가 마지막으로 확인한 시각)
 *   3. 카드마다 온비드 원문 링크
 */
const AuctionPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL 쿼리를 필터의 단일 진실 소스로 삼아 새로고침·공유에도 조건이 유지되게 한다.
  const filters = useMemo<AuctionSearchParams>(() => {
    // `searchParams.get(k) ? …` 로 쓰면 '0'이 falsy로 걸러져, "유찰 0회(신건만)"
    // 같은 조건이 URL을 공유하는 순간 사라진다. 빈 문자열만 미지정으로 본다.
    const num = (k: string) => {
      const raw = searchParams.get(k)
      return raw === null || raw === '' ? undefined : Number(raw)
    }
    const list = (k: string) => searchParams.get(k)?.split(',').filter(Boolean) || undefined
    return {
      q: searchParams.get('q') || undefined,
      sido: searchParams.get('sido') || undefined,
      sggCodes: list('sgg'),
      useTypes: list('ut'),
      useSubTypes: list('us'),
      divisions: list('div'),
      minPrice: num('minp'),
      maxPrice: num('maxp'),
      minAppraisal: num('mina'),
      maxAppraisal: num('maxa'),
      minArea: num('minsq'),
      maxArea: num('maxsq'),
      minDiscount: num('mindisc'),
      maxDiscount: num('disc'),
      minFailCount: num('fail'),
      maxFailCount: num('maxfail'),
      excludeShare: searchParams.get('noshare') === '1' || undefined,
      bidMethods: list('bm'),
      privateContract: searchParams.get('pvct') === '1' || undefined,
      deadlineDays: num('dl'),
      status: (searchParams.get('st') as AuctionSearchParams['status']) || 'ACTIVE',
      sort: (searchParams.get('sort') as AuctionSearchParams['sort']) || 'deadline',
      page: num('page') || 1,
      limit: 24,
    }
  }, [searchParams])

  const applyFilters = (next: AuctionSearchParams) => {
    const p = new URLSearchParams()
    if (next.q) p.set('q', next.q)
    if (next.sido) p.set('sido', next.sido)
    if (next.sggCodes?.length) p.set('sgg', next.sggCodes.join(','))
    if (next.useTypes?.length) p.set('ut', next.useTypes.join(','))
    if (next.useSubTypes?.length) p.set('us', next.useSubTypes.join(','))
    if (next.divisions?.length) p.set('div', next.divisions.join(','))
    if (next.minPrice) p.set('minp', String(next.minPrice))
    if (next.maxPrice) p.set('maxp', String(next.maxPrice))
    if (next.minAppraisal) p.set('mina', String(next.minAppraisal))
    if (next.maxAppraisal) p.set('maxa', String(next.maxAppraisal))
    if (next.minArea) p.set('minsq', String(next.minArea))
    if (next.maxArea) p.set('maxsq', String(next.maxArea))
    if (next.minDiscount) p.set('mindisc', String(next.minDiscount))
    if (next.maxDiscount) p.set('disc', String(next.maxDiscount))
    if (next.minFailCount) p.set('fail', String(next.minFailCount))
    if (next.maxFailCount !== undefined) p.set('maxfail', String(next.maxFailCount))
    if (next.excludeShare) p.set('noshare', '1')
    if (next.bidMethods?.length) p.set('bm', next.bidMethods.join(','))
    if (next.privateContract) p.set('pvct', '1')
    if (next.deadlineDays) p.set('dl', String(next.deadlineDays))
    if (next.status && next.status !== 'ACTIVE') p.set('st', next.status)
    if (next.sort && next.sort !== 'deadline') p.set('sort', next.sort)
    if (next.page && next.page > 1) p.set('page', String(next.page))
    setSearchParams(p)
  }

  /**
   * 요약 카드와 실거래 시세 비교의 기준 시군구.
   * 시군구를 여러 개 고르면 "이 지역의 중위값"이라는 말 자체가 성립하지 않으므로,
   * 정확히 하나를 골랐을 때만 지역 기준 지표를 보여준다.
   */
  const soleSgg = filters.sggCodes?.length === 1 ? filters.sggCodes[0] : undefined

  const [result, setResult] = useState<AuctionSearchResult | null>(null)
  const [stats, setStats] = useState<AuctionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /**
   * 같은 지역 실거래 중위 평당가. 공매의 가치는 "감정가 대비"만이 아니라
   * "실제 시세 대비"에서 나온다 — 우리는 실거래 데이터를 이미 갖고 있으므로
   * 이 교차 비교가 다른 경공매 서비스에 없는 우리 강점이다.
   * 시군구를 골랐을 때만 의미가 있어(전국 평균은 비교 기준이 못 된다) 그때만 부른다.
   */
  const [marketStats, setMarketStats] = useState<RegionStats | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    auctionApi
      .search(filters)
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(e?.message || '물건을 불러오지 못했습니다.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [filters])

  useEffect(() => {
    let cancelled = false
    auctionApi
      .stats(filters.sido, soleSgg)
      .then((s) => !cancelled && setStats(s))
      .catch(() => !cancelled && setStats(null))
    return () => {
      cancelled = true
    }
  }, [filters.sido, soleSgg])

  useEffect(() => {
    if (!soleSgg) {
      setMarketStats(null)
      return
    }
    let cancelled = false
    tradeApi
      .stats({ sggCode: soleSgg })
      .then((s) => !cancelled && setMarketStats(s ?? null))
      .catch(() => !cancelled && setMarketStats(null))
    return () => {
      cancelled = true
    }
  }, [soleSgg])

  const isLive = result?.isLive ?? false
  const items = result?.items || []
  const page = filters.page || 1
  const totalPages = result?.totalPages || 1

  const goPage = (p: number) => {
    applyFilters({ ...filters, page: p })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* 헤더 */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Gavel className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">경공매 물건</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          한국자산관리공사 온비드에 등록된 공매 부동산을 감정가·체감률·마감일 기준으로 찾아봅니다.
        </p>

        <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mt-3">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
              isLive
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
            }`}
          >
            {isLive ? <Database className="w-3 h-3" /> : <FlaskConical className="w-3 h-3" />}
            {isLive ? '온비드 공매 물건' : '샘플 데이터 (실제 물건 아님)'}
          </span>
          {result?.lastUpdate && (
            <span className="text-gray-500 dark:text-gray-400">
              {new Date(result.lastUpdate).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              수집
            </span>
          )}
        </div>
      </div>

      {/* 신선도 고지. 공매는 사용자가 이 정보를 보고 돈을 거는 미래 일정이라,
          "우리 화면이 최신이 아닐 수 있다"를 숨기지 않는 것이 이 화면의 전제다. */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          이 목록은 온비드 공개 API를 하루 2회 조회해 저장한 <strong>스냅샷</strong>입니다. 입찰
          일정·최저가는 그사이 바뀔 수 있으니, <strong>입찰 전 반드시 각 물건의 “온비드 원문”
          링크에서 최종 확인</strong>하세요. 권리관계·명도 책임 등은 이 화면에 표시되지 않습니다.
        </p>
      </div>

      {/* 지역 요약. 공매에서 의미 있는 요약은 "중위 거래가"가 아니라
          "지금 입찰 가능한 물건 수"와 "감정가 대비 얼마나 떨어졌는가"다. */}
      {stats && stats.count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '입찰 가능', value: `${stats.openCount.toLocaleString()}건` },
            {
              label: '중위 최저입찰가',
              value: stats.medianMinBid ? formatPrice(stats.medianMinBid) : '-',
            },
            {
              label: '중위 감정가',
              value: stats.medianAppraisal ? formatPrice(stats.medianAppraisal) : '-',
            },
            {
              label: '중위 체감률',
              value: stats.medianDiscountRate ? `감정가의 ${stats.medianDiscountRate}%` : '-',
            },
          ].map((c) => (
            <div
              key={c.label}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{c.label}</p>
              <p className="text-base sm:text-lg font-black text-gray-900 dark:text-white">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <AuctionFilters value={filters} onChange={applyFilters} facets={result?.facets} />

      {/* 결과 개수 + 범위 고지 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {loading ? '불러오는 중...' : `${(result?.total || 0).toLocaleString()}건`}
        </p>
        {result?.scopeTruncated && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            전체가 아니라 이 범위의 일부({result.scopeSize.toLocaleString()}건)에서 검색한 결과입니다.
            지역을 좁히면 더 정확해집니다.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <SearchX className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">조건에 맞는 공매 물건이 없습니다.</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            체감률·마감일 조건을 넓히거나 지역을 바꿔보세요.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <AuctionCard key={item.id} item={item} marketStats={marketStats ?? undefined} />
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => goPage(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => goPage(page + 1)}
            disabled={page >= totalPages}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center pt-4">
        출처: 한국자산관리공사 온비드 공개 API (공공데이터포털). 이 화면의 정보는 참고용이며 법적
        효력이 없습니다.
      </p>
    </div>
  )
}

export default AuctionPage
