// 실거래 수집 로직 (스케줄 함수 / 수동 트리거 / 로컬 스크립트가 공유)
import { fetchTrades, recentMonths, SERVICES, DEFAULT_SERVICE_IDS } from './molit.mjs'
import { ALL_SGG } from './regionCodes.mjs'

// 무료 개발계정은 보통 일 1,000회 제한이라 여유를 두고 상한을 건다.
//
// 전국 계획은 145개 시군구 × 3개월 × 5종목 = 2,175회로 이 예산을 넘는다.
// 즉 한 번의 실행은 전국을 다 돌지 못한다. buildPlan이 날짜에 따라 구간을 돌려
// 며칠에 걸쳐 전국을 훑고, 저장 시에는 반드시 기존 데이터와 병합해야
// (storage.mergeWithStored) 이번 구간 밖의 지역이 사라지지 않는다.
export const DEFAULT_MAX_CALLS = 900
export const DEFAULT_MONTHS = 3

// 호출 예산을 먼저 배분받는 지역 (수도권·광역시)
const PRIORITY_SIDO = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종']

/** 배열을 n칸 왼쪽으로 회전한다. */
const rotate = (arr, n) => [...arr.slice(n), ...arr.slice(0, n)]

/** UTC 기준 일련 일수. 하루에 한 창(window)씩 회전 시작점을 옮기는 데 쓴다. */
const dayNumber = (now = new Date()) => Math.floor(now.getTime() / 86_400_000)

/**
 * 호출 계획 생성: 우선 지역 → 나머지 지역, 각 지역마다 최근 N개월 × 전체 종목.
 *
 * 전국 계획(2,175회)이 하루 예산(900회)보다 커서 한 번에 다 돌 수 없다.
 * 순서가 고정이면 앞쪽(서울·경기)만 매일 갱신되고 나머지 시군구는 영영
 * 갱신되지 않는다. 그래서 하루에 처리하는 만큼씩 시작 지점을 밀어,
 * 며칠에 걸쳐 전국이 빠짐없이 한 바퀴 돌게 한다.
 * 우선 지역이 목록 앞쪽에 있어 한 바퀴 안에서 상대적으로 자주 나온다.
 *
 * @param {Date} [opts.now] 회전 위치 계산 기준 시각 (테스트용)
 */
export function buildPlan({
  months = DEFAULT_MONTHS,
  maxCalls = DEFAULT_MAX_CALLS,
  serviceIds = DEFAULT_SERVICE_IDS,
  sidoFilter,
  now,
} = {}) {
  const ymList = recentMonths(months)
  const svcList = serviceIds.map((id) => SERVICES[id]).filter(Boolean)
  if (svcList.length === 0) throw new Error(`알 수 없는 수집 종목: ${serviceIds.join(', ')}`)

  let targets = ALL_SGG
  if (sidoFilter?.length) targets = targets.filter((s) => sidoFilter.includes(s.sido))

  const priority = targets.filter((s) => PRIORITY_SIDO.includes(s.sido))
  const rest = targets.filter((s) => !PRIORITY_SIDO.includes(s.sido))
  const ordered = [...priority, ...rest]

  // 시군구 하나당 필요한 호출 수 → 하루 예산으로 몇 개를 돌 수 있는지.
  const callsPerSgg = ymList.length * svcList.length
  const perRun = Math.max(1, Math.floor(maxCalls / callsPerSgg))
  // 하루에 처리한 만큼 시작 지점을 밀어 다음 날은 그 다음 구간을 돈다.
  const start = ordered.length ? (dayNumber(now) * perRun) % ordered.length : 0
  const rotated = rotate(ordered, start)

  const plan = []
  for (const sgg of rotated) {
    for (const ym of ymList) {
      for (const svc of svcList) plan.push({ sgg, ym, svc })
    }
  }
  return plan.slice(0, maxCalls)
}

/**
 * 키/권한 관련 오류. data.go.kr은 "활용신청하지 않은 서비스"에도
 * 키 자체가 잘못됐을 때와 똑같이 code 30(등록되지 않은 서비스키)을 반환한다.
 * 따라서 이 오류만으로는 "키가 틀렸다"고 단정할 수 없다.
 */
const isKeyOrPermissionError = (msg) =>
  /서비스키|SERVICE_KEY|등록되지|활용신청|SERVICE_ACCESS_DENIED|허용되지/i.test(msg)

/** 호출 한도 초과 등 더 진행해도 의미 없는 오류 */
const isQuotaError = (msg) => /LIMITED_NUMBER|요청제한|초과/i.test(msg)

/**
 * 실거래를 수집해 정규화된 payload를 만든다.
 * @param {object} opts
 * @param {string} opts.serviceKey
 * @param {number} [opts.months]
 * @param {number} [opts.maxCalls]
 * @param {string[]} [opts.sidoFilter] 특정 시도만 수집 (테스트용)
 * @param {string[]} [opts.serviceIds] 수집할 종목 (기본: 전체)
 * @param {(msg: string) => void} [opts.onProgress]
 */
export async function collectTrades({
  serviceKey,
  months = DEFAULT_MONTHS,
  maxCalls = DEFAULT_MAX_CALLS,
  sidoFilter,
  serviceIds,
  onProgress = () => {},
} = {}) {
  if (!serviceKey) throw new Error('MOLIT_API_KEY가 설정되지 않았습니다.')

  const started = Date.now()
  const plan = buildPlan({ months, maxCalls, sidoFilter, serviceIds })
  const items = []
  const errors = []
  let calls = 0
  let cancelled = 0
  let fatal = null

  // 활용신청하지 않은 서비스는 계속 호출해봐야 실패하므로 한 번 겪으면 건너뛴다.
  // (전체 수집을 중단시키지는 않는다 — 신청한 서비스만이라도 수집해야 한다.)
  const disabled = new Map() // serviceId → 사유
  let succeeded = 0

  for (const { sgg, ym, svc } of plan) {
    if (disabled.has(svc.id)) continue
    try {
      const rows = await fetchTrades({ serviceKey, service: svc, lawdCd: sgg.code, dealYmd: ym })
      calls++
      succeeded++
      cancelled += rows.cancelledCount || 0
      for (const r of rows) items.push({ ...r, sido: sgg.sido, sgg: sgg.sgg, region_name: sgg.name })
      if (calls % 50 === 0) onProgress(`${calls}/${plan.length} 호출 · 누적 ${items.length}건`)
    } catch (e) {
      errors.push(`${sgg.name}/${ym}/${svc.id}: ${e.message}`)

      if (isQuotaError(e.message)) {
        fatal = `호출 한도 초과: ${e.message}`
        break
      }

      if (isKeyOrPermissionError(e.message)) {
        disabled.set(svc.id, e.message)
        onProgress(`${svc.label}은(는) 사용할 수 없어 건너뜁니다 — ${e.message}`)
        // 모든 서비스가 막혔다면 그때는 키 자체 문제로 보고 중단한다.
        if (disabled.size >= new Set(plan.map((p) => p.svc.id)).size) {
          fatal =
            succeeded > 0
              ? null
              : `모든 서비스가 거부됐습니다: ${[...disabled.values()].join(' / ')}`
          break
        }
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
        /** 계약 해제로 제외한 건수 */
        cancelled,
        errors: errors.length,
        /** 활용신청이 안 돼 건너뛴 서비스 */
        skipped_services: [...disabled.keys()],
        elapsed_sec: Math.round((Date.now() - started) / 1000),
      },
    },
    errors,
    fatal,
  }
}
