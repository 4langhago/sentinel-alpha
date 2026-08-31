// 종목(아파트/오피스텔/상가/토지)별 조회조건 규칙.
//
// 화면 두 곳(TradeFilters의 활성 개수 배지, SearchPage의 활성 조건 칩)이
// "지금 몇 개의 조건이 걸려 있는가"를 각자 계산하면 반드시 어긋난다.
// 그래서 조건 목록을 만드는 로직을 여기 하나로 모으고, 양쪽이 같은 배열을 쓴다.
import { PropertyType, TradeSearchParams } from '../types/trade'

/** 종목별로 어떤 조건 섹션이 의미가 있는지 */
export interface FilterCapabilities {
  /** 전용면적 기반 "평형대" 프리셋 (주거용에서만 의미가 있다) */
  exclusiveArea: boolean
  /** 상가 연면적 / 토지 대지면적 */
  landArea: boolean
  landAreaLabel: string
  buildYear: boolean
  /** 상가 건물용도 / 토지 용도지역 */
  useType: boolean
  useTypeLabel: string
  shareDeal: boolean
}

/**
 * 토지는 build_year가 사실상 전부 0이라 준공연도 조건을 걸면 무조건 0건이 된다.
 * "누르면 결과가 사라지는 버튼"은 고장으로 읽히므로 아예 노출하지 않는다.
 * 반대로 상가·토지는 전용면적보다 연면적·대지면적으로 찾고, 지분거래가 섞여
 * 단가가 왜곡되므로 제외 토글이 필요하다.
 */
export const filterCapabilities = (pt: PropertyType | 'ALL' | undefined): FilterCapabilities => {
  switch (pt) {
    case 'COMMERCIAL':
      return {
        exclusiveArea: false,
        landArea: true,
        landAreaLabel: '연면적',
        buildYear: true,
        useType: true,
        useTypeLabel: '건물용도',
        shareDeal: true,
      }
    case 'LAND':
      return {
        exclusiveArea: false,
        landArea: true,
        landAreaLabel: '대지면적',
        buildYear: false,
        useType: true,
        // 국토부 토지 실거래의 use_type은 지목이 아니라 용도지역이다
        // (실제 값: 제2종일반주거지역·준주거지역·일반상업지역…).
        useTypeLabel: '용도지역',
        shareDeal: true,
      }
    default:
      // ALL/APARTMENT/OFFICETEL — 기존 주거용 필터 세트를 그대로 유지한다.
      return {
        exclusiveArea: true,
        landArea: false,
        landAreaLabel: '면적',
        buildYear: true,
        useType: false,
        useTypeLabel: '용도',
        shareDeal: false,
      }
  }
}

/**
 * 종목을 바꿀 때, 새 종목에서 의미를 잃은 조건을 걷어낸다.
 * 예: 아파트에서 30평대를 고른 뒤 토지로 넘어가면 전용면적 조건이 그대로 남아
 * 이유를 알 수 없는 0건이 된다. 조용히 지우면 "왜 조건이 사라졌지"가 되므로
 * 지운 항목 이름(cleared)을 함께 돌려줘 화면이 한 줄로 알려줄 수 있게 한다.
 */
export const sanitizeForPropertyType = (
  value: TradeSearchParams,
  next: PropertyType | 'ALL'
): { params: TradeSearchParams; cleared: string[] } => {
  const caps = filterCapabilities(next)
  const params: TradeSearchParams = { ...value, propertyType: next, page: 1 }
  const cleared: string[] = []

  if (!caps.exclusiveArea && (value.minArea !== undefined || value.maxArea !== undefined)) {
    params.minArea = undefined
    params.maxArea = undefined
    cleared.push('평형대')
  }
  if (!caps.landArea && (value.minLandArea !== undefined || value.maxLandArea !== undefined)) {
    params.minLandArea = undefined
    params.maxLandArea = undefined
    cleared.push('연면적·대지면적')
  }
  if (!caps.buildYear && value.buildYearMin !== undefined) {
    params.buildYearMin = undefined
    cleared.push('준공연도')
  }
  if (!caps.useType && value.useTypes && value.useTypes.length > 0) {
    params.useTypes = undefined
    // 지워지는 값이 실제로 무엇이었는지 알려줘야 한다. value.propertyType이
    // ALL/undefined면 filterCapabilities가 기본값 '용도'로 떨어져 "건물용도"도
    // "용도지역"도 아닌 안내가 나가므로, 값이 있을 때만 그 종목 라벨을 쓴다.
    cleared.push(value.propertyType ? filterCapabilities(value.propertyType).useTypeLabel : '용도')
  }
  if (!caps.shareDeal && value.excludeShare) {
    params.excludeShare = undefined
    cleared.push('지분거래 제외')
  }
  // 용도 값 목록은 종목마다 완전히 다르다(상가 근린생활시설 ↔ 토지 전·답).
  // 상가→토지처럼 둘 다 useType을 쓰는 전환에서도 이전 선택은 무조건 무효다.
  if (caps.useType && value.useTypes && value.useTypes.length > 0 && value.propertyType !== next) {
    params.useTypes = undefined
    if (!cleared.includes(filterCapabilities(value.propertyType).useTypeLabel)) {
      cleared.push(filterCapabilities(value.propertyType).useTypeLabel)
    }
  }
  return { params, cleared }
}

/** 원 → "3억", "3.5억" (정수면 소수점을 붙이지 않는다) */
export const wonToEokLabel = (won: number): string => {
  const eok = won / 100_000_000
  return `${Number.isInteger(eok) ? eok : Math.round(eok * 10) / 10}억`
}

const rangeLabel = (min: number | undefined, max: number | undefined, fmt: (n: number) => string): string => {
  if (min !== undefined && max !== undefined) return `${fmt(min)}~${fmt(max)}`
  if (min !== undefined) return `${fmt(min)} 이상`
  return `${fmt(max as number)} 이하`
}

/** 활성 조건 1건 — 칩으로 그리고, clear를 적용하면 그 조건만 풀린다. */
export interface ActiveCondition {
  key: string
  /** 어떤 조건인지 ("가격", "용도지역" 등) */
  group: string
  label: string
  /** 이 조건만 해제하는 패치 */
  clear: Partial<TradeSearchParams>
}

/**
 * 현재 걸린 조건을 전부 나열한다. TradeFilters의 개수 배지와
 * SearchPage의 활성 조건 칩이 같은 배열을 공유해 숫자가 어긋나지 않는다.
 */
export const buildActiveConditions = (
  value: TradeSearchParams,
  opts: { sggName?: string; propertyLabel: (pt: PropertyType) => string } 
): ActiveCondition[] => {
  const caps = filterCapabilities(value.propertyType)
  const list: ActiveCondition[] = []

  if (value.sido) {
    list.push({
      key: 'sido',
      group: '지역',
      label: value.sido,
      // 시도를 풀면 그 아래 시군구도 함께 무효가 된다.
      clear: { sido: '', sggCode: '' },
    })
  }
  if (value.sggCode) {
    list.push({ key: 'sgg', group: '시군구', label: opts.sggName || '선택 시군구', clear: { sggCode: '' } })
  }
  if (value.dealType && value.dealType !== 'ALL') {
    list.push({
      key: 'deal',
      group: '거래유형',
      label: value.dealType === 'TRADE' ? '매매' : '전월세',
      clear: { dealType: 'ALL' },
    })
  }
  if (value.propertyType && value.propertyType !== 'ALL') {
    list.push({
      key: 'type',
      group: '종목',
      label: opts.propertyLabel(value.propertyType),
      // 종목을 전체로 되돌릴 때도 그 종목 전용 조건은 같이 걷어낸다.
      clear: sanitizeForPropertyType(value, 'ALL').params,
    })
  }
  if (value.minPrice !== undefined || value.maxPrice !== undefined) {
    list.push({
      key: 'price',
      group: '가격',
      label: rangeLabel(value.minPrice, value.maxPrice, wonToEokLabel),
      clear: { minPrice: undefined, maxPrice: undefined },
    })
  }
  if (caps.exclusiveArea && (value.minArea !== undefined || value.maxArea !== undefined)) {
    list.push({
      key: 'area',
      group: '평형대',
      label: rangeLabel(value.minArea, value.maxArea, (n) => `${n}㎡`),
      clear: { minArea: undefined, maxArea: undefined },
    })
  }
  if (caps.landArea && (value.minLandArea !== undefined || value.maxLandArea !== undefined)) {
    list.push({
      key: 'landArea',
      group: caps.landAreaLabel,
      label: rangeLabel(value.minLandArea, value.maxLandArea, (n) => `${n}㎡`),
      clear: { minLandArea: undefined, maxLandArea: undefined },
    })
  }
  if (caps.buildYear && value.buildYearMin !== undefined) {
    list.push({
      key: 'buildYear',
      group: '준공연도',
      label: `${value.buildYearMin}년 이후`,
      clear: { buildYearMin: undefined },
    })
  }
  if (caps.useType && value.useTypes) {
    // 용도는 다중 선택이라 값마다 칩을 하나씩 만들어 하나씩 뺄 수 있게 한다.
    value.useTypes.forEach((ut) => {
      list.push({
        key: `useType:${ut}`,
        group: caps.useTypeLabel,
        label: ut,
        clear: { useTypes: (value.useTypes || []).filter((v) => v !== ut) },
      })
    })
  }
  if (caps.shareDeal && value.excludeShare) {
    list.push({
      key: 'excludeShare',
      group: '지분거래',
      label: '지분거래 제외',
      clear: { excludeShare: undefined },
    })
  }
  return list
}
