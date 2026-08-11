import { useEffect, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { tradeApi } from '../services/tradeApi'
import { SidoRegion, TradeSearchParams, SORT_LABELS, PROPERTY_LABELS } from '../types/trade'

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
  `px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
    active
      ? 'bg-primary-600 text-white'
      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
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

  // 지역/가격/면적/준공연도 상세 필터. 데스크톱 인라인 패널과 모바일 하단 시트가 그대로 재사용한다.
  const filterBody = (
    <>
      {/* 지역 */}
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">지역</p>
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
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">가격</p>
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
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">전용면적</p>
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
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">준공연도</p>
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
          onClick={() => onChange({ q: value.q, sort: value.sort, page: 1, limit: value.limit })}
          className="text-sm text-slate-500 hover:text-rose-600 underline"
        >
          필터 전체 초기화
        </button>
      )}
    </>
  )

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 space-y-4">
      {/* 검색어 */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="단지명·지역으로 검색 (예: 대치동 은마, 분당 파크뷰)"
          className="w-full pl-11 pr-10 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {keyword && (
          <button
            onClick={() => setKeyword('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
        <span className="w-px h-5 bg-slate-200 dark:bg-slate-600 mx-1" />
        {(['ALL', 'APARTMENT', 'OFFICETEL', 'COMMERCIAL', 'LAND'] as const).map((t) => (
          <button
            key={t}
            onClick={() => set({ propertyType: t })}
            className={chip((value.propertyType || 'ALL') === t)}
          >
            {t === 'ALL' ? '전체' : PROPERTY_LABELS[t]}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={value.sort || 'recent'}
            onChange={(e) => set({ sort: e.target.value as TradeSearchParams['sort'] })}
            className="text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {Object.entries(SORT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-primary-600"
          >
            <SlidersHorizontal className="w-4 h-4" />
            상세
            {activeCount > 0 && (
              <span className="ml-0.5 bg-primary-600 text-white text-[10px] rounded-full px-1.5 py-0.5">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 데스크톱: 기존처럼 같은 카드 안에 인라인으로 펼침 */}
      {expanded && <div className="hidden lg:block space-y-4 pt-2 border-t border-slate-100 dark:border-slate-700">{filterBody}</div>}

      {/* 모바일/태블릿: 하단 시트로 띄운다 — 인라인으로 펼치면 목록까지 스크롤이 너무 길어진다 */}
      {expanded && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            aria-label="필터 닫기"
            onClick={() => setExpanded(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900 dark:text-white">상세 필터</p>
              <button
                onClick={() => setExpanded(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {filterBody}
            <button
              onClick={() => setExpanded(false)}
              className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold text-sm"
            >
              결과 보기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default TradeFilters
