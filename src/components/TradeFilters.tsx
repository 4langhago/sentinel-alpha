import { useEffect, useRef, useState } from 'react'
import { Search, SlidersHorizontal, X, Clock } from 'lucide-react'
import { tradeApi } from '../services/tradeApi'
import {
  SidoRegion,
  TradeSearchParams,
  TradeFacets,
  AreaUnit,
  AREA_UNIT_LABELS,
  SORT_LABELS,
  PROPERTY_LABELS,
  PropertyType,
  supplyPyeongToArea,
} from '../types/trade'
import { filterCapabilities, sanitizeForPropertyType, buildActiveConditions } from '../utils/filterRules'
import { RecentSearch } from '../utils/recentSearches'

interface Props {
  value: TradeSearchParams
  onChange: (next: TradeSearchParams) => void
  /** 현재 조건 하 용도별 건수. 용도 칩 목록은 종목마다 값이 달라 서버 집계로만 만들 수 있다. */
  facets?: TradeFacets | null
  areaUnit: AreaUnit
  onAreaUnitChange: (unit: AreaUnit) => void
  /** 최근 검색 조건 — 검색창 포커스 시 드롭다운으로 복원 */
  recent?: RecentSearch[]
  onRestoreRecent?: (entry: RecentSearch) => void
  /** 종목 전환으로 조건을 자동 해제했을 때 목록 상단에 알리기 위한 콜백 */
  onNotice?: (message: string | null) => void
}

const PRICE_RANGES = [
  { label: '전체', min: undefined, max: undefined },
  // min을 0으로 두면 활성 칩이 "0원~3억"으로 찍힌다. undefined로 둬야
  // rangeLabel이 "3억 이하" 형태를 고른다(필터 동작은 동일 — 서버 기본값이 0).
  { label: '3억 이하', min: undefined, max: 300_000_000 },
  { label: '3~6억', min: 300_000_000, max: 600_000_000 },
  { label: '6~10억', min: 600_000_000, max: 1_000_000_000 },
  { label: '10~20억', min: 1_000_000_000, max: 2_000_000_000 },
  { label: '20억 이상', min: 2_000_000_000, max: undefined },
]

// 실거래는 전용면적(㎡)만 주지만, 사람들은 "20평대/30평대"처럼 공급면적
// 기준 평형으로 아파트를 찾는다(예: 국민평형은 전용 84㎡인데 흔히 "34평형"
// 이라 부른다). 그래서 구간 경계를 종목의 통상 전용률로 역산한다 — 전용면적을
// 그대로 3.3으로 나눈 값(84㎡→25평)으로 끊으면 "30평대"를 눌러도 국민평형이
// 걸리지 않는다.
//
// 전용률은 종목마다 다르다(아파트 0.75, 오피스텔 0.5). 경계를 아파트 기준으로
// 고정해두면 카드에 "30평형"이라 찍힌 오피스텔이 "30평대" 필터에 안 걸리는
// 모순이 생긴다 — 실제로 서울 오피스텔 86건 중 85건이 20평대 이하로 몰렸다.
// 그래서 표시(estimateSupplyPyeong)와 같은 전용률로 경계를 만든다.
const SUPPLY_PYEONG_EDGES = [30, 40, 50] // 30평형·40평형·50평형 경계
const areaRangesFor = (pt: PropertyType | 'ALL' | undefined) => {
  // 종목이 '전체'면 아파트 기준으로 잡는다(거래의 대부분이 아파트다).
  const type: PropertyType = pt === 'OFFICETEL' ? 'OFFICETEL' : 'APARTMENT'
  const edges = SUPPLY_PYEONG_EDGES.map((p) => supplyPyeongToArea(p, type))
  const labels = ['20평대 이하', '30평대', '40평대', '50평대 이상']
  return [
    { label: '전체', min: undefined, max: undefined },
    { label: labels[0], min: undefined, max: edges[0] },
    { label: labels[1], min: edges[0], max: edges[1] },
    { label: labels[2], min: edges[1], max: edges[2] },
    { label: labels[3], min: edges[2], max: undefined },
  ]
}

// 상가 연면적 / 토지 대지면적. 아파트 평형대와 달리 공급면적 환산 관행이
// 없어 ㎡ 그대로 끊는다. 토지는 소필지부터 1,000㎡ 이상까지 스케일이 넓어
// 등간격이 아니라 자릿수에 가깝게 구간을 벌렸다.
const LAND_AREA_RANGES = [
  { label: '전체', min: undefined, max: undefined },
  // min을 0으로 두면 rangeLabel이 "0㎡~100㎡"로 찍는다("…이하"가 아니라 범위처럼
  // 보임). undefined로 둬야 rangeLabel이 "100㎡ 이하" 형태를 고른다.
  { label: '100㎡ 이하', min: undefined, max: 100 },
  { label: '100~300㎡', min: 100, max: 300 },
  { label: '300~1,000㎡', min: 300, max: 1000 },
  { label: '1,000㎡ 이상', min: 1000, max: undefined },
]

const BUILD_YEARS = [
  { label: '전체', v: undefined },
  { label: '2020년 이후', v: 2020 },
  { label: '2010년 이후', v: 2010 },
  { label: '2000년 이후', v: 2000 },
]

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
    active
      ? 'bg-primary-600 text-white'
      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
  }`

const inputCls =
  'w-24 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500'

interface RangeInputsProps {
  minValue?: number
  maxValue?: number
  /** 내부 저장 단위(원/㎡) → 입력창 표시 단위 */
  toInput: (v: number) => number
  /** 입력창 표시 단위 → 내부 저장 단위 */
  fromInput: (v: number) => number
  /** 입력창 오른쪽에 붙는 단위 표기 */
  suffix: string
  step?: number
  minLabel: string
  maxLabel: string
  onCommit: (min: number | undefined, max: number | undefined) => void
}

/**
 * 프리셋 구간만으로는 "7억 5천 이하"처럼 사이 값을 찾을 수 없다.
 * 다만 매 글자마다 재조회하면 중간 상태(예: "1")로 엉뚱한 결과가 잠깐 뜨므로,
 * 입력을 마쳤다는 신호(blur 또는 Enter)에만 커밋한다.
 */
const RangeInputs = ({
  minValue,
  maxValue,
  toInput,
  fromInput,
  suffix,
  step,
  minLabel,
  maxLabel,
  onCommit,
}: RangeInputsProps) => {
  const show = (v: number | undefined) => (v === undefined ? '' : String(toInput(v)))
  const [lo, setLo] = useState(show(minValue))
  const [hi, setHi] = useState(show(maxValue))

  // 프리셋 칩이나 URL(뒤로가기·공유 링크)로 값이 바뀌면 입력창도 따라가야 한다.
  // 칩과 입력창이 서로 다른 값을 보여주면 어느 쪽이 적용된 조건인지 알 수 없다.
  useEffect(() => {
    setLo(show(minValue))
    setHi(show(maxValue))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minValue, maxValue])

  const commit = () => {
    const parse = (t: string) => {
      const n = Number(t)
      return t.trim() === '' || Number.isNaN(n) || n < 0 ? undefined : fromInput(n)
    }
    let a = parse(lo)
    let b = parse(hi)
    // 최소/최대를 거꾸로 넣는 건 흔한 실수다. 0건을 보여주는 대신 뒤집어 받아준다.
    if (a !== undefined && b !== undefined && a > b) {
      const t = a
      a = b
      b = t
    }
    if (a !== minValue || b !== maxValue) onCommit(a, b)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={lo}
        aria-label={minLabel}
        placeholder="최소"
        onChange={(e) => setLo(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={inputCls}
      />
      <span className="text-slate-400 text-sm">~</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={hi}
        aria-label={maxLabel}
        placeholder="최대"
        onChange={(e) => setHi(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={inputCls}
      />
      <span className="text-xs text-slate-500 dark:text-slate-400">{suffix}</span>
    </div>
  )
}

const TradeFilters = ({
  value,
  onChange,
  facets,
  areaUnit,
  onAreaUnitChange,
  recent = [],
  onRestoreRecent,
  onNotice,
}: Props) => {
  const [regions, setRegions] = useState<SidoRegion[]>([])
  const [keyword, setKeyword] = useState(value.q || '')
  // 지역·가격·평형·준공연도 상세 조건은 첫 화면부터 항상 펼쳐서 보여준다.
  // 모바일 하단 시트는 화면이 좁아 계속 펼쳐두면 목록이 안 보이므로 그때만 토글로 연다.
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    tradeApi.regions().then(setRegions)
  }, [])

  // 검색어는 입력 중 매 글자 요청하지 않도록 400ms 디바운스
  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q || '') !== keyword) onChange({ ...value, q: keyword, page: 1 })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword])

  // 최근 검색 드롭다운은 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!recentOpen) return
    const onDocDown = (e: MouseEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) setRecentOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [recentOpen])

  // 모바일 시트는 화면 전체를 덮는 대화상자다. 열려 있는 동안 뒤 목록이 같이
  // 스크롤되면 시트를 닫았을 때 엉뚱한 위치에 가 있으므로 body 스크롤을 잠근다.
  useEffect(() => {
    if (!mobileSheetOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileSheetOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileSheetOpen])

  const set = (patch: Partial<TradeSearchParams>) => onChange({ ...value, ...patch, page: 1 })

  const caps = filterCapabilities(value.propertyType)
  const sggList = regions.find((r) => r.sido === value.sido)?.sggs || []
  const sggName = sggList.find((s) => s.code === value.sggCode)?.name
  // 활성 개수는 SearchPage의 활성 조건 칩과 같은 함수로 센다(양쪽 숫자가 어긋나지 않게).
  const activeCount = buildActiveConditions(value, {
    sggName,
    propertyLabel: (pt) => PROPERTY_LABELS[pt],
  }).length

  /** 종목 전환 — 새 종목에서 무효해진 조건을 걷어내고 무엇이 풀렸는지 알린다. */
  const selectPropertyType = (next: PropertyType | 'ALL') => {
    const { params, cleared } = sanitizeForPropertyType(value, next)
    onChange(params)
    if (cleared.length > 0) {
      const name = next === 'ALL' ? '전체 종목' : PROPERTY_LABELS[next]
      onNotice?.(`${name}에는 해당하지 않아 ${cleared.join(' · ')} 조건을 해제했습니다.`)
    } else {
      onNotice?.(null)
    }
  }

  const toggleUseType = (ut: string) => {
    const cur = value.useTypes || []
    const next = cur.includes(ut) ? cur.filter((v) => v !== ut) : [...cur, ut]
    set({ useTypes: next.length > 0 ? next : undefined })
  }

  // 서버가 준 상위 용도에, 지금 선택돼 있지만 상위 8개에 못 든 값을 덧붙인다.
  // 그러지 않으면 "적용 중인 조건이 화면에서 사라지는" 상태가 된다.
  const useTypeOptions = (() => {
    const top = (facets?.use_types || []).slice(0, 8)
    const known = new Set(top.map((u) => u.value))
    const extra = (value.useTypes || []).filter((v) => !known.has(v)).map((v) => ({ value: v, count: -1 }))
    return [...top, ...extra]
  })()

  const priceIsPreset = PRICE_RANGES.some((r) => value.minPrice === r.min && value.maxPrice === r.max)
  // 평형대 경계는 종목 전용률에 따라 달라지므로 매 렌더에서 현재 종목 기준으로 만든다.
  const areaRanges = areaRangesFor(value.propertyType)
  const areaIsPreset = areaRanges.some((r) => value.minArea === r.min && value.maxArea === r.max)
  const landIsPreset = LAND_AREA_RANGES.some(
    (r) => value.minLandArea === r.min && value.maxLandArea === r.max
  )

  /** 프리셋과 어긋나는 값이 걸려 있을 때 "직접입력" 상태를 눈에 보이게 한다. */
  const customBadge = (isCustom: boolean) =>
    isCustom ? (
      <span className="ml-2 text-[11px] font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-500/10 rounded-full px-2 py-0.5">
        직접입력
      </span>
    ) : null

  const sectionLabel = 'text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center'

  // 지역/가격/면적/용도/준공연도 상세 필터. 데스크톱 인라인 패널과 모바일 하단 시트가 그대로 재사용한다.
  const filterBody = (
    <>
      {/* 지역 */}
      <div role="group" aria-label="지역 조건">
        <p className={sectionLabel}>지역</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => set({ sido: '', sggCode: '' })}
            aria-pressed={!value.sido}
            className={chip(!value.sido)}
          >
            전국
          </button>
          {regions.map((r) => (
            <button
              key={r.sido}
              onClick={() => set({ sido: r.sido, sggCode: '' })}
              aria-pressed={value.sido === r.sido}
              className={chip(value.sido === r.sido)}
            >
              {r.sido}
            </button>
          ))}
        </div>
        {sggList.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 pl-1">
            <button
              onClick={() => set({ sggCode: '' })}
              aria-pressed={!value.sggCode}
              className={chip(!value.sggCode)}
            >
              전체
            </button>
            {sggList.map((s) => (
              <button
                key={s.code}
                onClick={() => set({ sggCode: s.code })}
                aria-pressed={value.sggCode === s.code}
                className={chip(value.sggCode === s.code)}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 가격 */}
      <div role="group" aria-label="가격 조건">
        <p className={sectionLabel}>
          가격
          {customBadge(!priceIsPreset && (value.minPrice !== undefined || value.maxPrice !== undefined))}
        </p>
        <div className="flex flex-wrap gap-2">
          {PRICE_RANGES.map((r) => {
            const active = value.minPrice === r.min && value.maxPrice === r.max
            return (
              <button
                key={r.label}
                onClick={() => set({ minPrice: r.min, maxPrice: r.max })}
                aria-pressed={active}
                className={chip(active)}
              >
                {r.label}
              </button>
            )
          })}
        </div>
        {/* 억 단위로 받는다 — 원 단위로 0을 여덟 개 세는 건 사람이 할 일이 아니다. */}
        <RangeInputs
          minValue={value.minPrice}
          maxValue={value.maxPrice}
          toInput={(v) => Math.round((v / 100_000_000) * 100) / 100}
          fromInput={(v) => Math.round(v * 100_000_000)}
          suffix="억원"
          step={0.1}
          minLabel="최소 가격(억원)"
          maxLabel="최대 가격(억원)"
          onCommit={(min, max) => set({ minPrice: min, maxPrice: max })}
        />
      </div>

      {/* 평형대 (아파트·오피스텔) */}
      {caps.exclusiveArea && (
        <div role="group" aria-label="평형대 조건">
          <p
            className={sectionLabel}
            title="흔히 부르는 공급면적 기준 평형대입니다(전용면적 기준 필터링, 통상 전용률로 환산). 단지·세대에 따라 실제와 다를 수 있습니다."
          >
            평형대 <span className="font-normal text-slate-400 ml-1">(공급면적 기준, 추정)</span>
            {customBadge(!areaIsPreset && (value.minArea !== undefined || value.maxArea !== undefined))}
          </p>
          <div className="flex flex-wrap gap-2">
            {areaRanges.map((r) => {
              const active = value.minArea === r.min && value.maxArea === r.max
              return (
                <button
                  key={r.label}
                  onClick={() => set({ minArea: r.min, maxArea: r.max })}
                  aria-pressed={active}
                  className={chip(active)}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
          {/* 직접입력은 전용면적 ㎡ 그대로 받는다(프리셋 경계값과 같은 축이라 값이 섞이지 않는다). */}
          <RangeInputs
            minValue={value.minArea}
            maxValue={value.maxArea}
            toInput={(v) => v}
            fromInput={(v) => v}
            suffix="㎡ (전용면적)"
            step={1}
            minLabel="최소 전용면적(㎡)"
            maxLabel="최대 전용면적(㎡)"
            onCommit={(min, max) => set({ minArea: min, maxArea: max })}
          />
        </div>
      )}

      {/* 연면적(상가) / 대지면적(토지) */}
      {caps.landArea && (
        <div role="group" aria-label={`${caps.landAreaLabel} 조건`}>
          <p className={sectionLabel}>
            {caps.landAreaLabel}
            {customBadge(
              !landIsPreset && (value.minLandArea !== undefined || value.maxLandArea !== undefined)
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {LAND_AREA_RANGES.map((r) => {
              const active = value.minLandArea === r.min && value.maxLandArea === r.max
              return (
                <button
                  key={r.label}
                  onClick={() => set({ minLandArea: r.min, maxLandArea: r.max })}
                  aria-pressed={active}
                  className={chip(active)}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
          <RangeInputs
            minValue={value.minLandArea}
            maxValue={value.maxLandArea}
            toInput={(v) => v}
            fromInput={(v) => v}
            suffix={`㎡ (${caps.landAreaLabel})`}
            step={1}
            minLabel={`최소 ${caps.landAreaLabel}(㎡)`}
            maxLabel={`최대 ${caps.landAreaLabel}(㎡)`}
            onCommit={(min, max) => set({ minLandArea: min, maxLandArea: max })}
          />
        </div>
      )}

      {/* 건물용도(상가) / 용도지역(토지) — 값 목록이 종목·지역마다 달라 서버 집계로만 만들 수 있다 */}
      {caps.useType && useTypeOptions.length > 0 && (
        <div role="group" aria-label={`${caps.useTypeLabel} 조건`}>
          <p className={sectionLabel}>
            {caps.useTypeLabel}
            <span className="font-normal text-slate-400 ml-1">(현재 조건 기준 건수)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {useTypeOptions.map((u) => {
              const active = (value.useTypes || []).includes(u.value)
              return (
                <button
                  key={u.value}
                  onClick={() => toggleUseType(u.value)}
                  aria-pressed={active}
                  className={chip(active)}
                >
                  {u.value}
                  {/* count가 -1인 항목은 상위 8개 밖이라 건수를 모르는, 선택 중인 값이다 */}
                  {u.count >= 0 && (
                    <span className={`ml-1 font-normal ${active ? 'text-white/70' : 'text-slate-400'}`}>
                      {u.count.toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 준공연도 — 토지는 build_year가 사실상 전부 0이라 누르면 무조건 0건이 되므로 아예 감춘다 */}
      {caps.buildYear && (
        <div role="group" aria-label="준공연도 조건">
          <p className={sectionLabel}>준공연도</p>
          <div className="flex flex-wrap gap-2">
            {BUILD_YEARS.map((o) => (
              <button
                key={o.label}
                onClick={() => set({ buildYearMin: o.v })}
                aria-pressed={value.buildYearMin === o.v}
                className={chip(value.buildYearMin === o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 지분거래 제외 — 지분거래는 필지·건물의 일부만 사고판 건이라 ㎡당 단가가 시세와 크게 다르다 */}
      {caps.shareDeal && (
        <div role="group" aria-label="지분거래 조건">
          <p className={sectionLabel}>지분거래</p>
          <button
            onClick={() => set({ excludeShare: value.excludeShare ? undefined : true })}
            aria-pressed={Boolean(value.excludeShare)}
            className={chip(Boolean(value.excludeShare))}
            title="지분 거래는 일부 지분만 거래한 건이라 면적당 단가가 실제 시세와 크게 다릅니다."
          >
            지분거래 제외
          </button>
        </div>
      )}

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
      {/* 검색어 + 최근 검색 조건 복원 */}
      <div className="relative" ref={searchBoxRef}>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onFocus={() => setRecentOpen(true)}
          placeholder="단지명·지역으로 검색 (예: 대치동 은마, 분당 파크뷰)"
          aria-label="단지명·지역 검색"
          className="w-full pl-11 pr-10 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {keyword && (
          <button
            onClick={() => setKeyword('')}
            aria-label="검색어 지우기"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {recentOpen && recent.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg overflow-hidden">
            <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              최근 검색 조건
            </p>
            {recent.map((r) => (
              <button
                key={r.query}
                // 바깥 클릭 감지는 mousedown에서 일어나 onClick보다 먼저다. 항목 선택도 mousedown에서 처리해야 눌린다.
                onMouseDown={() => {
                  onRestoreRecent?.(r)
                  setRecentOpen(false)
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{r.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 거래유형 · 매물종류 · 정렬 */}
      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'TRADE', 'RENT'] as const).map((t) => (
          <button
            key={t}
            onClick={() => set({ dealType: t })}
            aria-pressed={(value.dealType || 'ALL') === t}
            className={chip((value.dealType || 'ALL') === t)}
          >
            {t === 'ALL' ? '전체' : t === 'TRADE' ? '매매' : '전월세'}
          </button>
        ))}
        <span className="w-px h-5 bg-slate-200 dark:bg-slate-600 mx-1" />
        {(['ALL', 'APARTMENT', 'OFFICETEL', 'COMMERCIAL', 'LAND'] as const).map((t) => {
          // 종목 칩에 현재 조건 하 건수를 붙여, 눌러보기 전에 0건인 종목을 알 수 있게 한다.
          //
          // 단 범위가 잘린 조회(전국·시도 최신 N건)에서는 이 건수가 실제보다 훨씬 작다 —
          // 전국 최신 3,000건 안의 상가 51건은 실제 3,616건과 다르다. 확정치가 아닌 숫자를
          // 칩에 붙이면 "상가는 51건뿐"이라는 잘못된 인상을 주므로 그때는 아예 감춘다.
          const count = t === 'ALL' || facets?.approximate ? undefined : facets?.property?.[t]
          const active = (value.propertyType || 'ALL') === t
          return (
            <button key={t} onClick={() => selectPropertyType(t)} aria-pressed={active} className={chip(active)}>
              {t === 'ALL' ? '전체' : PROPERTY_LABELS[t]}
              {count !== undefined && (
                <span className={`ml-1 font-normal ${active ? 'text-white/70' : 'text-slate-400'}`}>
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          )
        })}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={value.sort || 'recent'}
            onChange={(e) => set({ sort: e.target.value as TradeSearchParams['sort'] })}
            aria-label="정렬 기준"
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
            aria-expanded={mobileSheetOpen}
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

      {/* 면적 표기 단위 — 목록·표의 면적을 한 단위로 통일한다(나머지 표기는 툴팁으로) */}
      <div role="group" aria-label="면적 표기 단위" className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">면적 표기</span>
        <div className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5">
          {(Object.keys(AREA_UNIT_LABELS) as AreaUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => onAreaUnitChange(u)}
              aria-pressed={areaUnit === u}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                areaUnit === u
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {AREA_UNIT_LABELS[u]}
            </button>
          ))}
        </div>
      </div>

      {/* 데스크톱/태블릿: 첫 화면부터 항상 펼쳐서 보여준다 (더 이상 토글 뒤에 숨기지 않음) */}
      <div className="hidden lg:block space-y-4 pt-2 border-t border-slate-100 dark:border-slate-700">{filterBody}</div>

      {/* 모바일: 화면이 좁아 상시 펼치면 목록이 안 보이므로 하단 시트로만 제공 */}
      {mobileSheetOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            aria-label="필터 닫기"
            tabIndex={-1}
            onClick={() => setMobileSheetOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="상세 필터"
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4"
          >
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
