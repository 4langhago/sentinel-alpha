import { useEffect, useState } from 'react'
import { Search, SlidersHorizontal, X, Check } from 'lucide-react'
import { tradeApi } from '../services/tradeApi'
import { SidoRegion } from '../types/trade'
import {
  AuctionFacets,
  AuctionSearchParams,
  AuctionSort,
  AUCTION_SORT_LABELS,
  auctionActiveConditions,
} from '../types/auction'

interface Props {
  value: AuctionSearchParams
  onChange: (next: AuctionSearchParams) => void
  /** 현재 범위의 용도·재산유형별 건수. 값 목록이 데이터마다 달라 서버 집계로만 만들 수 있다. */
  facets?: AuctionFacets | null
}

/**
 * 조건 구성은 대법원 법원경매정보의 "물건상세검색"을 기준으로 잡았다.
 * 그쪽이 받는 항목은 소재지 · 용도(대/중/소) · 감정평가액 · 최저매각가격 · 면적 ·
 * 유찰횟수 · 최저매각가율 · 매각기일 이며, 국내 유료 경매 서비스(지지옥션·옥션원 등)도
 * 사실상 이 집합을 확장한 형태를 쓴다. 우리 데이터로 채울 수 있는 항목을 그대로 옮기고,
 * 온비드 고유 축(재산유형·수의계약 가능 여부)만 덧붙였다.
 *
 * "최저매각가율"이 우리의 체감률(감정가 대비 최저입찰가 %)에 해당하며,
 * 경공매 이용자가 가장 먼저 거는 조건이라 접지 않고 항상 노출한다.
 */

/**
 * 최저입찰가 구간. 실거래(3억~20억)보다 훨씬 아래로 잡는다 —
 * 공매는 토지 지분·소형 물건이 많아 수천만원대가 물량의 중심이다.
 * 실거래 구간을 그대로 쓰면 첫 구간에 거의 전부가 몰려 필터가 무의미해진다.
 */
const PRICE_RANGES = [
  { label: '전체', min: undefined, max: undefined },
  { label: '5천만 이하', min: undefined, max: 50_000_000 },
  { label: '5천만~1억', min: 50_000_000, max: 100_000_000 },
  { label: '1~3억', min: 100_000_000, max: 300_000_000 },
  { label: '3~10억', min: 300_000_000, max: 1_000_000_000 },
  { label: '10억 이상', min: 1_000_000_000, max: undefined },
]

/** 감정평가액 구간. 최저입찰가와 별개 축이다(체감률이 클수록 둘의 차이가 벌어진다). */
const APPRAISAL_RANGES = [
  { label: '전체', min: undefined, max: undefined },
  { label: '1억 이하', min: undefined, max: 100_000_000 },
  { label: '1~3억', min: 100_000_000, max: 300_000_000 },
  { label: '3~10억', min: 300_000_000, max: 1_000_000_000 },
  { label: '10억 이상', min: 1_000_000_000, max: undefined },
]

/** 면적 구간 (㎡). 토지가 물량의 절반이라 평 단위가 아니라 ㎡ 기준 구간이 읽기 쉽다. */
const AREA_RANGES = [
  { label: '전체', min: undefined, max: undefined },
  { label: '33㎡(10평) 이하', min: undefined, max: 33 },
  { label: '33~100㎡', min: 33, max: 100 },
  { label: '100~330㎡', min: 100, max: 330 },
  { label: '330㎡(100평) 이상', min: 330, max: undefined },
]

/** 감정가 대비 체감률 상한 = 법원경매정보의 "최저매각가율". */
const DISCOUNT_STEPS = [
  { label: '전체', value: undefined },
  { label: '80% 이하', value: 80 },
  { label: '70% 이하', value: 70 },
  { label: '50% 이하', value: 50 },
  { label: '30% 이하', value: 30 },
]

/** 마감임박. 목록이 작고 사용자 체감 가치가 가장 커 상단에 별도로 노출한다. */
const DEADLINE_STEPS = [
  { label: '전체', value: undefined },
  { label: '3일 이내', value: 3 },
  { label: '7일 이내', value: 7 },
  { label: '30일 이내', value: 30 },
]

/**
 * 필터 칩.
 *
 * 모바일에서는 최소 44px 높이를 준다(터치 타겟 권장치). 데스크톱은 마우스라
 * 그만한 여백이 필요 없고, 칩이 많은 화면이라 공간 낭비가 크므로 원래 크기를 쓴다.
 * 이 서비스는 스마트폰 홈 화면 설치를 전제로 하므로 좁은 화면 쪽을 우선한다.
 */
const chip = (active: boolean) =>
  `inline-flex items-center min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-1.5 rounded-full text-xs font-semibold transition-colors border ${
    active
      ? 'bg-violet-600 border-violet-600 text-white'
      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-violet-300'
  }`

/** 억/만원 단위 직접 입력. 구간 칩만으로는 "8천만~1억2천" 같은 조건을 못 만든다. */
const AmountInput = ({
  value,
  onCommit,
  placeholder,
}: {
  value?: number
  onCommit: (v?: number) => void
  placeholder: string
}) => {
  const [text, setText] = useState(value ? String(Math.round(value / 10_000)) : '')
  useEffect(() => setText(value ? String(Math.round(value / 10_000)) : ''), [value])
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={() => onCommit(text ? Number(text) * 10_000 : undefined)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder={placeholder}
      inputMode="numeric"
      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
    />
  )
}

/** 정수 직접 입력(유찰 횟수 등). AmountInput과 달리 단위 환산이 없다. */
const NumberInput = ({
  value,
  onChange,
  placeholder,
}: {
  value?: number
  onChange: (v?: number) => void
  placeholder: string
}) => {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => setText(value === undefined ? '' : String(value)), [value])
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={() => onChange(text === '' ? undefined : Number(text))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder={placeholder}
      inputMode="numeric"
      className="w-16 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
    />
  )
}

const AuctionFilters = ({ value, onChange, facets }: Props) => {
  const bidMethods = facets?.bid_methods || []
  const [regions, setRegions] = useState<SidoRegion[]>([])
  const [expanded, setExpanded] = useState(false)
  const [keyword, setKeyword] = useState(value.q || '')

  // 지역 목록은 실거래와 같은 법정동 체계를 쓴다 — 공매 sgg_code도 PNU에서 뽑은
  // 같은 5자리라 그대로 맞물린다. 목록을 따로 만들 이유가 없다.
  useEffect(() => {
    tradeApi.regions().then(setRegions).catch(() => setRegions([]))
  }, [])

  useEffect(() => setKeyword(value.q || ''), [value.q])

  const set = (patch: Partial<AuctionSearchParams>) => onChange({ ...value, ...patch, page: 1 })

  const toggleInList = (
    key: 'useTypes' | 'useSubTypes' | 'divisions' | 'sggCodes',
    v: string,
    extra?: Partial<AuctionSearchParams>
  ) => {
    const cur = value[key] || []
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    set({ [key]: next.length ? next : undefined, ...extra } as Partial<AuctionSearchParams>)
  }

  const sggs = regions.find((r) => r.sido === value.sido)?.sggs || []
  const conditions = auctionActiveConditions(value)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-4">
      {/* 검색어 + 정렬 */}
      <div className="flex flex-col sm:flex-row gap-2">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            set({ q: keyword.trim() || undefined })
          }}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="소재지·물건명으로 검색 (예: 강남구 아파트)"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </form>
        <select
          value={value.sort || 'deadline'}
          onChange={(e) => set({ sort: e.target.value as AuctionSort })}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          {Object.entries(AUCTION_SORT_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* 지역: 시도 선택 → 시군구 다중 선택 */}
      <div>
        <select
          value={value.sido || ''}
          // 시도를 바꾸면 이전 시군구 코드는 그 시도에 속하지 않아 0건이 된다. 함께 지운다.
          onChange={(e) => set({ sido: e.target.value || undefined, sggCodes: undefined })}
          className="w-full sm:w-64 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">전국</option>
          {regions.map((r) => (
            <option key={r.sido} value={r.sido}>
              {r.sido}
            </option>
          ))}
        </select>
        {sggs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {sggs.map((s) => {
              const on = Boolean(value.sggCodes?.includes(s.code))
              return (
                <button key={s.code} onClick={() => toggleInList('sggCodes', s.code)} className={chip(on)}>
                  {on && <Check className="inline w-3 h-3 mr-0.5 -mt-0.5" />}
                  {s.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 용도 대·중분류 (서버 집계로 만든 칩 — 값 목록이 데이터마다 달라 하드코딩할 수 없다) */}
      {facets?.use_types && facets.use_types.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            용도{facets.approximate && <span className="font-normal"> (범위 일부 기준 근사치)</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {facets.use_types.map((f) => (
              <button
                key={f.value}
                // 중분류를 바꾸면 이전 소분류는 그 아래에 없어 0건이 된다. 함께 지운다.
                onClick={() => toggleInList('useTypes', f.value, { useSubTypes: undefined })}
                className={chip(Boolean(value.useTypes?.includes(f.value)))}
              >
                {f.value} {f.count.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 용도 소분류. 중분류를 골랐을 때만 편다 — 전체를 늘어놓으면 40개가 넘어 읽히지 않는다. */}
      {value.useTypes?.length && facets?.use_sub_types && facets.use_sub_types.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">세부 용도</p>
          <div className="flex flex-wrap gap-1.5">
            {facets.use_sub_types.map((f) => (
              <button
                key={f.value}
                onClick={() => toggleInList('useSubTypes', f.value)}
                className={chip(Boolean(value.useSubTypes?.includes(f.value)))}
              >
                {f.value} {f.count.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* 체감률 · 마감임박 — 경공매에서 가장 자주 쓰는 두 조건이라 항상 펼쳐 둔다 */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            감정가 대비 (최저매각가율)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DISCOUNT_STEPS.map((d) => (
              <button
                key={d.label}
                onClick={() => set({ maxDiscount: d.value })}
                className={chip(value.maxDiscount === d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">입찰 마감</p>
          <div className="flex flex-wrap gap-1.5">
            {DEADLINE_STEPS.map((d) => (
              <button
                key={d.label}
                onClick={() => set({ deadlineDays: d.value })}
                className={chip(value.deadlineDays === d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        상세 조건
        {conditions.length > 0 && (
          <span className="bg-violet-600 text-white rounded-full px-1.5 py-0.5 text-[10px]">
            {conditions.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-700">
          {/* 최저입찰가: 구간 칩 + 직접 입력 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">최저입찰가</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
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
            <div className="flex items-center gap-2 max-w-sm">
              <AmountInput value={value.minPrice} onCommit={(v) => set({ minPrice: v })} placeholder="최소" />
              <span className="text-xs text-gray-400">~</span>
              <AmountInput value={value.maxPrice} onCommit={(v) => set({ maxPrice: v })} placeholder="최대" />
              <span className="text-xs text-gray-400 shrink-0">만원</span>
            </div>
          </div>

          {/* 감정평가액 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">감정평가액</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {APPRAISAL_RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => set({ minAppraisal: r.min, maxAppraisal: r.max })}
                  className={chip(value.minAppraisal === r.min && value.maxAppraisal === r.max)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 max-w-sm">
              <AmountInput
                value={value.minAppraisal}
                onCommit={(v) => set({ minAppraisal: v })}
                placeholder="최소"
              />
              <span className="text-xs text-gray-400">~</span>
              <AmountInput
                value={value.maxAppraisal}
                onCommit={(v) => set({ maxAppraisal: v })}
                placeholder="최대"
              />
              <span className="text-xs text-gray-400 shrink-0">만원</span>
            </div>
          </div>

          {/* 면적 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              면적 <span className="font-normal">(건물면적, 토지 물건은 토지면적)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
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

          {facets?.divisions && facets.divisions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">재산유형</p>
              <div className="flex flex-wrap gap-1.5">
                {facets.divisions.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => toggleInList('divisions', f.value)}
                    className={chip(Boolean(value.divisions?.includes(f.value)))}
                  >
                    {f.value} {f.count.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 유찰 횟수 — 지지옥션·태인은 0~10회를 하한~상한 범위로 받는다.
              "N회 이상"만으로는 "적당히 유찰된 것"을 고를 수 없어 범위로 둔다. */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">유찰 횟수</p>
            <div className="flex items-center gap-2">
              <NumberInput
                placeholder="최소"
                value={value.minFailCount}
                onChange={(n) => set({ minFailCount: n })}
              />
              <span className="text-xs text-gray-400">~</span>
              <NumberInput
                placeholder="최대"
                value={value.maxFailCount}
                onChange={(n) => set({ maxFailCount: n })}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">회</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[
                { label: '전체', min: undefined, max: undefined },
                { label: '신건(0회)', min: undefined, max: 0 },
                { label: '1~2회', min: 1, max: 2 },
                { label: '3회 이상', min: 3, max: undefined },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => set({ minFailCount: p.min, maxFailCount: p.max })}
                  className={chip(value.minFailCount === p.min && value.maxFailCount === p.max)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 입찰방식 — 온비드 고유 축이다. 수의계약은 경쟁입찰 없이 협의로
              계약하는 방식이라 법원경매에는 아예 없는 개념이다. */}
          {bidMethods.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">입찰방식</p>
              <div className="flex flex-wrap gap-1.5">
                {bidMethods.map((m) => {
                  const on = value.bidMethods?.includes(m.name)
                  return (
                    <button
                      key={m.name}
                      onClick={() =>
                        set({
                          bidMethods: on
                            ? value.bidMethods?.filter((x) => x !== m.name)
                            : [...(value.bidMethods || []), m.name],
                        })
                      }
                      className={chip(Boolean(on))}
                    >
                      {m.name} {m.count.toLocaleString()}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(value.privateContract)}
                onChange={(e) => set({ privateContract: e.target.checked || undefined })}
                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              수의계약 가능한 물건만
            </label>
            {/* 지분 물건은 단독으로 처분·개발할 수 없어 공유자와 협의하거나
                소송을 거쳐야 한다. "싸 보이는 이유"가 여기인 경우가 많다. */}
            <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(value.excludeShare)}
                onChange={(e) => set({ excludeShare: e.target.checked || undefined })}
                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              지분 물건 제외
            </label>
            {/* 마감된 물건은 온비드 API에서 사라진 것을 우리가 스냅샷으로 붙잡아 둔 것이다.
                기본으로 보여주면 "입찰할 수 없는 물건"이 목록을 채우므로 명시해야 나온다. */}
            <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={value.status === 'ALL'}
                onChange={(e) => set({ status: e.target.checked ? 'ALL' : 'ACTIVE' })}
                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              마감된 물건도 포함 (우리 스냅샷 이력)
            </label>
          </div>
        </div>
      )}

      {/* 활성 조건 칩. 상세 조건을 접어도 무엇이 걸려 있는지 보이게 한다. */}
      {conditions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
          {conditions.map((c) => (
            <span
              key={c}
              className="text-[11px] bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 rounded-full px-2 py-0.5"
            >
              {c}
            </span>
          ))}
          <button
            onClick={() => onChange({ sort: value.sort, limit: value.limit, page: 1 })}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X className="w-3 h-3" />
            초기화
          </button>
        </div>
      )}
    </div>
  )
}

export default AuctionFilters
