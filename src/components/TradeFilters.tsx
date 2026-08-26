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

// 실거래는 전용면적(㎡)만 주지만, 사람들은 "20평대/30평대"처럼 공급면적
// 기준 평형으로 아파트를 찾는다(예: 국민평형은 전용 84㎡인데 흔히 "34평형"
// 이라 부른다). 여기 구간은 아파트의 통상 전용률(75%)로 역산해, 사람들이
// 실제로 찾는 평형대에 맞도록 경계를 잡았다 — 전용면적을 그대로 3.3으로
// 나눈 값(예: 84㎡→25평)으로 구간을 나누면 "30평대"를 눌러도 국민평형이
// 걸리지 않는 혼란이 생긴다.
const AREA_RANGES = [
  { label: '전체', min: undefined, max: undefined },
  { label: '20평대 이하', min: 0, max: 74 },
  { label: '30평대', min: 74, max: 99 },
  { label: '40평대', min: 99, max: 124 },
  { label: '50평대 이상', min: 124, max: undefined },
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
  // 지역·가격·평형·준공연도 상세 조건은 첫 화면부터 항상 펼쳐서 보여준다.
  // 모바일 하단 시트는 화면이 좁아 계속 펼쳐두면 목록이 안 보이므로 그때만 토글로 연다.
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

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
        <p
          className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2"
          title="흔히 부르는 공급면적 기준 평형대입니다(전용면적 기준 필터링, 통상 전용률로 환산). 단지·세대에 따라 실제와 다를 수 있습니다."
        >
          평형대 <span className="font-normal text-slate-400">(공급면적 기준, 추정)</span>
        </p>
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
          {/* 모바일/태블릿에서만 보이는 토글 — 데스크톱은 아래에 항상 펼쳐져 있다 */}
          <button
            onClick={() => setMobileSheetOpen(true)}
            className="lg:hidden inline-flex items-center gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-primary-600"
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

      {/* 데스크톱/태블릿: 첫 화면부터 항상 펼쳐서 보여준다 (더 이상 토글 뒤에 숨기지 않음) */}
      <div className="hidden lg:block space-y-4 pt-2 border-t border-slate-100 dark:border-slate-700">{filterBody}</div>

      {/* 모바일: 화면이 좁아 상시 펼치면 목록이 안 보이므로 하단 시트로만 제공 */}
      {mobileSheetOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            aria-label="필터 닫기"
            onClick={() => setMobileSheetOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900 dark:text-white">상세 필터</p>
              <button
                onClick={() => setMobileSheetOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {filterBody}
            <button
              onClick={() => setMobileSheetOpen(false)}
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
