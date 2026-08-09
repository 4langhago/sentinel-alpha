// 실거래 수집 로직 (스케줄 함수 / 수동 트리거 / 로컬 스크립트가 공유)
import { fetchTrades, recentMonths, SERVICES } from './molit.mjs'
import { ALL_SGG } from './regionCodes.mjs'

// 무료 개발계정은 보통 일 1,000회 제한이라 여유를 두고 상한을 건다.
export const DEFAULT_MAX_CALLS = 700
export const DEFAULT_MONTHS = 3

// 호출 예산을 먼저 배분받는 지역 (수도권·광역시)
const PRIORITY_SIDO = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종']

/** 호출 계획 생성: 우선 지역 → 나머지 지역, 각 지역마다 최근 N개월 × 3개 서비스 */
export function buildPlan({ months = DEFAULT_MONTHS, maxCalls = DEFAULT_MAX_CALLS, services, sidoFilter } = {}) {
  const ymList = recentMonths(months)
  const svcList = services || [SERVICES.APT_TRADE, SERVICES.APT_RENT, SERVICES.OFFI_TRADE]

  let targets = ALL_SGG
  if (sidoFilter?.length) targets = targets.filter((s) => sidoFilter.includes(s.sido))

  const priority = targets.filter((s) => PRIORITY_SIDO.includes(s.sido))
  const rest = targets.filter((s) => !PRIORITY_SIDO.includes(s.sido))

  const plan = []
  for (const sgg of [...priority, ...rest]) {
    for (const ym of ymList) {
      for (const svc of svcList) plan.push({ sgg, ym, svc })
    }
  }
  return plan.slice(0, maxCalls)
}

/** 서비스키 자체가 잘못된 경우엔 계속 호출해도 무의미하므로 즉시 중단해야 한다. */
const isFatalKeyError = (msg) =>
  /서비스키|SERVICE_KEY|등록되지|IP|허용되지|활용신청|LIMITED_NUMBER|요청제한/i.test(msg)

/**
 * 실거래를 수집해 정규화된 payload를 만든다.
 * @param {object} opts
 * @param {string} opts.serviceKey
 * @param {number} [opts.months]
 * @param {number} [opts.maxCalls]
 * @param {string[]} [opts.sidoFilter] 특정 시도만 수집 (테스트용)
 * @param {(msg: string) => void} [opts.onProgress]
 */
export async function collectTrades({
  serviceKey,
  months = DEFAULT_MONTHS,
  maxCalls = DEFAULT_MAX_CALLS,
  sidoFilter,
  onProgress = () => {},
} = {}) {
  if (!serviceKey) throw new Error('MOLIT_API_KEY가 설정되지 않았습니다.')

  const started = Date.now()
  const plan = buildPlan({ months, maxCalls, sidoFilter })
  const items = []
  const errors = []
  let calls = 0
  let fatal = null

  for (const { sgg, ym, svc } of plan) {
    try {
      const rows = await fetchTrades({ serviceKey, service: svc, lawdCd: sgg.code, dealYmd: ym })
      calls++
      for (const r of rows) items.push({ ...r, sido: sgg.sido, sgg: sgg.sgg, region_name: sgg.name })
      if (calls % 50 === 0) onProgress(`${calls}/${plan.length} 호출 · 누적 ${items.length}건`)
    } catch (e) {
      errors.push(`${sgg.name}/${ym}/${svc.id}: ${e.message}`)
      if (isFatalKeyError(e.message)) {
        fatal = e.message
        break
      }
    }
  }

  // 같은 거래가 서비스·월 경계에서 중복 수집될 수 있으므로 id로 제거
  const seen = new Set()
  const deduped = []
  for (const it of items) {
    if (seen.has(it.id)) continue
    seen.add(it.id)
    deduped.push(it)
  }
  deduped.sort((a, b) => b.deal_date.localeCompare(a.deal_date))

  return {
    payload: {
      items: deduped,
      last_update: new Date().toISOString(),
      source: 'molit',
      months: recentMonths(months),
      stats: {
        calls,
        planned: plan.length,
        collected: items.length,
        deduped: deduped.length,
        errors: errors.length,
        elapsed_sec: Math.round((Date.now() - started) / 1000),
      },
    },
    errors,
    fatal,
  }
}
