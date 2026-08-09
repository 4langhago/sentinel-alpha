import { useEffect, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { tradeApi } from '../services/tradeApi'
import { SidoRegion, TradeSearchParams, SORT_LABELS } from '../types/trade'

interface Props {
  value: TradeSearchParams
  onChange: (next: TradeSearchParams) => void
}

const PRICE_RANGES = [
  { label: '전체', min: undefined, max: undefined },
  { label: '3억 이하', min: 0, max: 300_000_000 },
  { label: '3~6억', min: 300_000_000, max: 600_000_000 },
  { label: '6~10억', min: 600_000_000, max: 1_000_000_000 },
  { label: '10~20억', min: 1_000_000_000, max: 2_000_000_000 },
  { label: '20억 이상', min: 2_000_000_000, max: undefined },
]

const AREA_RANGES = [
  { label: '전체', min: undefined, max: undefined },
  { label: '~20평', min: 0, max: 66 },
  { label: '20~30평', min: 66, max: 99 },
  { label: '30~40평', min: 99, max: 132 },
  { label: '40평~', min: 132, max: undefined },
]

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
    active
      ? 'bg-violet-600 text-white'
      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
  }`

const TradeFilters = ({ value, onChange }: Props) => {
  const [regions, setRegions] = useState<SidoRegion[]>([])
  const [keyword, setKeyword] = useState(value.q || '')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    tradeApi.regions().then(setRegions)
  }, [])

  // 검색어는 입력 중 매 글자 요청하지 않도록 400ms 디바운스
  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q || '') !== keyword) onChange({ ...value, q: keyword, page: 1 })
    }, 400)
    return () => clearTimeout(t)
  }, [keyword])

  const set = (patch: Partial<TradeSearchParams>) => onChange({ ...value, ...patch, page: 1 })

  const sggList = regions.find((r) => r.sido === value.sido)?.sggs || []
  const activeCount =
    (value.sido ? 1 : 0) +
    (value.sggCode ? 1 : 0) +
    (value.propertyType && value.propertyType !== 'ALL' ? 1 : 0) +
    (value.dealType && value.dealType !== 'ALL' ? 1 : 0) +
    (value.minPrice || value.maxPrice ? 1 : 0) +
    (value.minArea || value.maxArea ? 1 : 0) +
    (value.buildYearMin ? 1 : 0)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
      {/* 검색어 */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="단지명·지역으로 검색 (예: 대치동 은마, 분당 파크뷰)"
          className="w-full pl-11 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
        {keyword && (
          <button
            onClick={() => setKeyword('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 거래유형 · 매물종류 · 정렬 */}
      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'TRADE', 'RENT'] as const).map((t) => (
          <button key={t} onClick={() => set({ dealType: t })} className={chip((value.dealType || 'ALL') === t)}>
            {t === 'ALL' ? '전체' : t === 'TRADE' ? '매매' : '전월세'}
          </button>
        ))}
        <span className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-1" />
        {(['ALL', 'APARTMENT', 'OFFICETEL'] as const).map((t) => (
          <button
            key={t}
            onClick={() => set({ propertyType: t })}
            className={chip((value.propertyType || 'ALL') === t)}
          >
            {t === 'ALL' ? '전체' : t === 'APARTMENT' ? '아파트' : '오피스텔'}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={value.sort || 'recent'}
            onChange={(e) => set({ sort: e.target.value as TradeSearchParams['sort'] })}
            className="text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {Object.entries(SORT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-violet-600"
          >
            <SlidersHorizontal className="w-4 h-4" />
            상세
            {activeCount > 0 && (
              <span className="ml-0.5 bg-violet-600 text-white text-[10px] rounded-full px-1.5 py-0.5">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-700">
          {/* 지역 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">지역</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => set({ sido: '', sggCode: '' })} className={chip(!value.sido)}>
                전국
              </button>
              {regions.map((r) => (
                <button
                  key={r.sido}
                  onClick={() => set({ sido: r.sido, sggCode: '' })}
                  className={chip(value.sido === r.sido)}
                >
                  {r.sido}
                </button>
              ))}
            </div>
            {sggList.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 pl-1">
                <button onClick={() => set({ sggCode: '' })} className={chip(!value.sggCode)}>
                  전체
                </button>
                {sggList.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => set({ sggCode: s.code })}
                    className={chip(value.sggCode === s.code)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 가격 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">가격</p>
            <div className="flex flex-wrap gap-2">
              {PRICE_RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => set({ minPrice: r.min, maxPrice: r.max })}
                  className={chip(value.minPrice === r.min && value.maxPrice === r.max)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* 면적 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">전용면적</p>
            <div className="flex flex-wrap gap-2">
              {AREA_RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => set({ minArea: r.min, maxArea: r.max })}
                  className={chip(value.minArea === r.min && value.maxArea === r.max)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* 준공연도 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">준공연도</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '전체', v: undefined },
                { label: '2020년 이후', v: 2020 },
                { label: '2010년 이후', v: 2010 },
                { label: '2000년 이후', v: 2000 },
              ].map((o) => (
                <button
                  key={o.label}
                  onClick={() => set({ buildYearMin: o.v })}
                  className={chip(value.buildYearMin === o.v)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {activeCount > 0 && (
            <button
              onClick={() =>
                onChange({ q: value.q, sort: value.sort, page: 1, limit: value.limit })
              }
              className="text-sm text-gray-500 hover:text-rose-600 underline"
            >
              필터 전체 초기화
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default TradeFilters
