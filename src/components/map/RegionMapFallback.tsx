import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { tradeApi } from '../../services/tradeApi'
import { SidoRegion } from '../../types/trade'

interface Props {
  regions: SidoRegion[]
  sido?: string
  sggCode?: string
  /** 통계 조회 시 함께 반영할 검색어 (지역 필터와 동일한 조건으로 집계) */
  q?: string
  onSelectSido: (sido: string) => void
  onSelectSgg: (sggCode: string) => void
}

interface TileStat {
  count: number
  medianPerPyeong: number
  /** 통계 API가 값을 못 준 경우(엔드포인트 부재/오류) */
  unavailable: boolean
}

/**
 * 지도 타일 통계를 채운다.
 * - 검색어(q)가 없으면 /api/regions/stats 배치 호출 1회로 그리드 전체를 채운다.
 * - 검색어가 있으면 배치 엔드포인트가 반영하지 못하므로(사전 계산치라 검색 필터링 불가)
 *   지역별로 /api/stats를 개별 호출해 검색 조건이 반영된 정확한 값을 구한다.
 * - 배치 호출이 실패하면(엔드포인트 장애 등) 같은 개별 호출 방식으로 폴백한다.
 * 두 경로 모두 값을 못 구한 지역은 목록에서 빠지고, 화면은 "집계 준비 중"으로 표시한다.
 */
const useRegionStats = (
  level: 'sido' | 'sgg',
  sido: string | undefined,
  keys: { key: string; sido?: string; sggCode?: string }[],
  q?: string
) => {
  const [stats, setStats] = useState<Record<string, TileStat>>({})
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  const fetchIndividually = async () => {
    const results = await Promise.all(
      keys.map(async ({ key, sido: s, sggCode }) => {
        const stat = await tradeApi.stats({ sido: s, sggCode, q })
        return [key, stat] as const
      })
    )
    const next: Record<string, TileStat> = {}
    for (const [key, s] of results) {
      if (s) next[key] = { count: s.count, medianPerPyeong: s.median_per_pyeong, unavailable: false }
    }
    return next
  }

  useEffect(() => {
    const id = ++reqId.current
    if (keys.length === 0) {
      setStats({})
      return
    }
    setLoading(true)

    const run = async () => {
      if (q) {
        // 검색어가 걸려 있으면 배치(사전 계산치)로는 정확한 집계를 못 주므로 개별 호출만 사용
        return fetchIndividually()
      }
      try {
        const rows =
          level === 'sgg' && sido
            ? await tradeApi.regionStats({ level: 'sgg', sido })
            : await tradeApi.regionStats({ level: 'sido' })
        const next: Record<string, TileStat> = {}
        for (const r of rows) {
          next[r.code] = { count: r.count, medianPerPyeong: r.median_per_pyeong, unavailable: false }
        }
        return next
      } catch (e) {
        console.warn('[RegionMapFallback] 배치 집계 조회 실패, 개별 호출로 폴백:', e)
        return fetchIndividually()
      }
    }

    run().then((next) => {
      if (reqId.current !== id) return
      setStats(next)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, sido, JSON.stringify(keys.map((k) => k.key)), q])

  return { stats, loading }
}

/** 거래량에 따른 히트맵 배경 진하기 (violet 톤, 라이트/다크 공통 rgba) */
const heatBg = (count: number, max: number) => {
  if (max <= 0 || count <= 0) return undefined
  const ratio = Math.min(1, count / max)
  const alpha = 0.08 + ratio * 0.32
  return `rgba(124, 58, 237, ${alpha.toFixed(2)})`
}

const RegionMapFallback = ({ regions, sido, sggCode, q, onSelectSido, onSelectSgg }: Props) => {
  const currentSggs = useMemo(() => regions.find((r) => r.sido === sido)?.sggs || [], [regions, sido])

  const keys = useMemo(
    () =>
      sido
        ? currentSggs.map((s) => ({ key: s.code, sido, sggCode: s.code }))
        : regions.map((r) => ({ key: r.sido, sido: r.sido })),
    [sido, currentSggs, regions]
  )
  const { stats, loading } = useRegionStats(sido ? 'sgg' : 'sido', sido, keys, q)

  const maxCount = useMemo(
    () => Math.max(0, ...Object.values(stats).map((s) => s.count)),
    [stats]
  )

  const sggName = currentSggs.find((s) => s.code === sggCode)?.name

  return (
    <div className="space-y-4">
      {/* 브레드크럼: 현재 보고 있는 범위 */}
      <div className="flex items-center gap-1.5 text-sm">
        <button
          onClick={() => onSelectSido('')}
          className={`font-semibold hover:text-violet-600 dark:hover:text-violet-400 ${
            !sido ? 'text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          전국
        </button>
        {sido && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
            <button
              onClick={() => onSelectSgg('')}
              className={`font-semibold hover:text-violet-600 dark:hover:text-violet-400 ${
                !sggCode ? 'text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {sido}
            </button>
          </>
        )}
        {sido && sggCode && sggName && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
            <span className="font-semibold text-violet-600 dark:text-violet-400">{sggName}</span>
          </>
        )}
        {loading && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin ml-1" />}
      </div>

      {/* 시도 미선택 → 시도 타일 / 시도 선택 → 시군구 타일 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {!sido
          ? regions.map((r) => {
              const s = stats[r.sido]
              return (
                <button
                  key={r.sido}
                  onClick={() => onSelectSido(r.sido)}
                  style={{ backgroundColor: s ? heatBg(s.count, maxCount) : undefined }}
                  className="text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
                >
                  <p className="font-bold text-gray-900 dark:text-white text-sm">{r.sido}</p>
                  {s && !s.unavailable ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      {s.count.toLocaleString()}건
                      {s.count > 0 && ` · 평당 ${Math.round(s.medianPerPyeong / 10000).toLocaleString()}만`}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">집계 준비 중</p>
                  )}
                </button>
              )
            })
          : currentSggs.map((sgg) => {
              const s = stats[sgg.code]
              const active = sggCode === sgg.code
              return (
                <button
                  key={sgg.code}
                  onClick={() => onSelectSgg(sgg.code)}
                  style={{ backgroundColor: s ? heatBg(s.count, maxCount) : undefined }}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    active
                      ? 'border-violet-500 ring-2 ring-violet-500/40 dark:ring-violet-400/40'
                      : 'border-gray-200 dark:border-gray-700 hover:border-violet-400 dark:hover:border-violet-500'
                  } bg-gray-50 dark:bg-gray-900/40`}
                >
                  <p className="font-bold text-gray-900 dark:text-white text-sm">{sgg.name}</p>
                  {s && !s.unavailable ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      {s.count.toLocaleString()}건
                      {s.count > 0 && ` · 평당 ${Math.round(s.medianPerPyeong / 10000).toLocaleString()}만`}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">집계 준비 중</p>
                  )}
                </button>
              )
            })}
      </div>

      {sido && currentSggs.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
          이 시도의 시군구 목록을 아직 불러오지 못했습니다.
        </p>
      )}
    </div>
  )
}

export default RegionMapFallback
