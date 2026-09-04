// 공매 갱신 한 사이클. 스케줄 함수와 수동 트리거가 **같은 코드**를 쓴다.
//
// 예전에는 두 진입점이 각자 수집·병합·저장을 호출해서, 한쪽만 고치면 다른 쪽이
// 조용히 옛 동작으로 남았다(수동 트리거는 전량 수집을 하고 있었다).
//
// ── 왜 증분인가 ──────────────────────────────────────────────
// 전량 수집은 143회 호출·25분이 걸린다. Netlify 함수는 그렇게 오래 돌 수 없어
// 예전 구조(매 실행 전량)는 한 번도 완주하지 못했다 — 배포해두고도 데이터가
// 갱신되지 않아, 신선도 임계(7일)를 넘기면 화면이 조용히 샘플로 바뀌었다.
//
// API의 mdfcnYmdStart/End(최종수정일 범위)로 바뀐 물건만 받으면 회당 7회 호출·
// 20초면 끝난다. 실측(2026-09-04, 압류재산): 전체 54,849건 중 최근 1일 수정분 137건.
//
// ── 중간에 잘려도 안전한가 ────────────────────────────────────
//   1. 시간 예산. 넘으면 수집을 멈추고 지금까지 것만 저장한다.
//   2. 병합 저장. 이번에 못 받은 물건은 기존 값이 그대로 남는다.
//   3. 워터마크. 완주한 실행만 "여기까지 봤다"를 전진시킨다. 잘린 실행은
//      워터마크를 그대로 두어, 다음 실행이 같은 구간을 다시 훑는다.
import { getStore } from '@netlify/blobs'
import { collectAuctions } from './collectAuctions.mjs'
import { mergeAuctionsWithStored, writeAuctionShardsToStore, readAuctionIndex } from './auctionStorage.mjs'
import { PROPERTY_DIVISIONS } from './onbidCodes.mjs'
import { toYmd } from './onbid.mjs'

/**
 * 수집에 쓸 기본 시간 예산(초).
 *
 * 실측(2026-09-04): Netlify 동기 함수는 **약 26초**에 잘린다. 수집 20초로 잡았더니
 * 병합·저장까지 못 가서 아무것도 저장되지 않았다. 저장(샤드 수십 개)과 병합에
 * 필요한 몫을 남겨 10초로 둔다.
 */
export const DEFAULT_COLLECT_BUDGET_SEC = Number(process.env.AUCTION_COLLECT_BUDGET_SEC || 10)

/**
 * 증분 창의 여유 일수. 실행이 한 번 걸러지거나 온비드 쪽 수정일 반영이 늦어도
 * 놓치지 않기 위한 겹침이다. 중복 수신은 같은 id로 덮어쓰므로 해가 없다.
 */
const OVERLAP_DAYS = 2

/**
 * 증분으로 따라잡을 수 있는 최대 공백(일). 이보다 오래 멈췄다면 증분 창이 전량과
 * 다를 바 없고 그사이 사라진 물건도 많아, 전량 모드로 돌린다.
 */
const MAX_INCREMENTAL_GAP_DAYS = 14

/**
 * 재산유형 순환 목록.
 *
 * 한 번에 4종 전부를 훑으면 증분이어도 7회 호출·20초가 걸려 함수 한도에 걸린다.
 * mdfcnYmd가 **일 단위**라 실행을 자주 해도 창이 좁아지지 않으므로, 창을 줄이는
 * 대신 **한 번에 한 종류만** 처리한다. 실행마다 다음 종류로 넘어가고, 각 종류는
 * 자기 워터마크를 따로 갖는다 — 한 종류가 잘려도 다른 종류의 진행이 막히지 않는다.
 *
 * 실측 1일 수정분(2026-09-04): 압류 137건(1회) · 기타일반 1,815건(4회) ·
 * 국유 14건(1회) · 공유 42건(1회). 가장 큰 기타일반도 단독이면 한도 안에 들어간다.
 */
const ROTATION = PROPERTY_DIVISIONS.map((d) => d.code)

/**
 * @param {object} opts
 * @param {string} opts.serviceKey ONBID_API_KEY
 * @param {number} [opts.maxCalls]
 * @param {number} [opts.maxSeconds]
 * @param {boolean} [opts.forceFull] 증분 가능해도 전량으로 돌린다(수동 복구용)
 * @param {string|null} [opts.divisionOverride] 특정 재산유형만 처리(순환 무시)
 * @param {(msg: string) => void} [opts.log]
 */
export async function runAuctionRefresh({
  serviceKey,
  maxCalls,
  maxSeconds = DEFAULT_COLLECT_BUDGET_SEC,
  forceFull = false,
  divisionOverride = null,
  log = () => {},
} = {}) {
  // 저장된 인덱스가 있고 충분히 최근이면 증분으로 간다. 스토어가 비어 있으면
  // 증분 결과(수백 건)가 전체로 굳어버리므로 반드시 전량이어야 한다.
  const index = await readAuctionIndex().catch(() => null)
  const marks = { ...(index?.division_watermarks || {}) }

  // 이번에 처리할 재산유형: 워터마크가 가장 오래된(또는 없는) 것을 고른다.
  // 단순 순번 대신 이 방식을 쓰는 이유는, 한 종류가 계속 실패해도 나머지가
  // 순번에 막히지 않고 각자 자기 주기로 갱신되기 때문이다.
  const staleness = (code) => (marks[code] ? new Date(marks[code]).getTime() : 0)
  const division = divisionOverride || [...ROTATION].sort((a, b) => staleness(a) - staleness(b))[0]
  const divLabel = PROPERTY_DIVISIONS.find((d) => d.code === division)?.label || division

  const mark = marks[division] || index?.incremental_watermark || index?.last_update || null
  const gapDays = mark ? (Date.now() - new Date(mark).getTime()) / 86400000 : Infinity
  const incremental = !forceFull && Boolean(index?.total_items) && gapDays <= MAX_INCREMENTAL_GAP_DAYS

  const modifiedFrom = incremental
    ? toYmd(new Date(new Date(mark).getTime() - OVERLAP_DAYS * 86400000))
    : ''

  log(
    incremental
      ? `증분 수집 [${divLabel}] — ${modifiedFrom} 이후 수정분 (마지막 갱신 ${gapDays.toFixed(1)}일 전)`
      : `전량 수집 [${divLabel}] — ${forceFull ? '강제 전량' : index?.total_items ? `공백 ${gapDays.toFixed(1)}일로 증분 불가` : '저장된 데이터 없음'}`
  )

  const { payload, seenIds, seenAt, errors, fatal, timedOut } = await collectAuctions({
    serviceKey,
    divisions: [division],
    modifiedFrom,
    maxCalls,
    maxSeconds,
    onProgress: log,
  })

  // 키·활용신청·한도 문제. 재시도해도 소용없고, 이 결과로 덮어쓰면 화면이 비어버린다.
  if (fatal) return { ok: false, fatal, errors: errors.slice(0, 5) }

  if (payload.items.length === 0) {
    // 증분에서 0건은 "바뀐 게 없다"는 정상 상태다.
    const noChange = incremental && errors.length === 0
    return {
      ok: noChange,
      incremental,
      division: divLabel,
      collected: 0,
      detail: noChange ? '변경된 물건이 없습니다.' : '수집 0건 — 기존 데이터를 유지합니다.',
      errors: errors.slice(0, 5),
    }
  }

  // 이번에 안 보인 물건은 지우지 않고 CLOSED로 남긴다(mergeAuctionsWithStored 안에서 처리).
  const finalPayload = await mergeAuctionsWithStored(payload, seenIds, seenAt, log)
  if (!finalPayload) {
    return { ok: false, reason: 'merge_check_failed', detail: '기존 데이터를 온전히 읽지 못해 저장을 건너뛰었습니다.' }
  }

  // 워터마크는 **완주한 실행만** 전진시킨다. 시간 예산에 걸려 잘렸다면 그 구간을
  // 다 보지 못한 것이므로, 다음 실행이 같은 창을 다시 훑도록 이전 값을 유지한다.
  // 재산유형마다 따로 두어, 한 종류가 계속 잘려도 나머지는 정상 진행한다.
  if (!timedOut) marks[division] = seenAt

  const shards = await writeAuctionShardsToStore(
    getStore('auctions'),
    {
      ...finalPayload,
      division_watermarks: marks,
      // 전체 워터마크는 "가장 뒤처진 종류"를 따른다. 이 값이 신선도 판정의
      // 기준이므로, 한 종류만 최신이어도 전체가 최신인 척하면 안 된다.
      incremental_watermark: ROTATION.map((c) => marks[c]).every(Boolean)
        ? ROTATION.map((c) => marks[c]).sort()[0]
        : seenAt,
    },
    // 증분일 때만 바뀐 시군구 샤드를 골라 쓴다. 전량이면 전부 다시 쓴다.
    { touchedSggCodes: incremental ? finalPayload.touchedSggCodes : null }
  )

  log(
    `샤드 ${shards}개 저장 — ${payload.stats.collected}건 수집 ` +
      `(호출 ${payload.stats.calls}회, 실패 ${payload.stats.errors}건, ${payload.stats.elapsed_sec}초` +
      `${timedOut ? ', 시간 예산 초과로 중단' : ''})`
  )
  if (errors.length) log(`실패 예시: ${errors.slice(0, 3).join(' | ')}`)

  return {
    ok: true,
    incremental,
    division: divLabel,
    timedOut: Boolean(timedOut),
    shards,
    ...payload.stats,
    errors: errors.slice(0, 5),
  }
}
