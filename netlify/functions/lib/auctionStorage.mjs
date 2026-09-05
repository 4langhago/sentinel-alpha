// 공매 물건 저장/조회 계층
//
// storage.mjs(실거래)와 같은 샤드 구조를 쓰되, **완전히 분리**한다:
//   - Blobs store를 'auctions'로 따로 둔다. 'trades'를 공유하면 한쪽 수집 실패가
//     다른 쪽 index.json을 오염시킨다.
//   - 로컬 파일도 data/auction/ 아래로 네임스페이스를 나눈다.
//
// 실거래와 결정적으로 다른 점이 하나 있다: **물건은 사라진다.**
// 온비드 API는 입찰이 끝난 물건을 더 이상 주지 않으므로, 이번 수집에서 안 보인
// 물건을 지우면 우리도 그 이력을 영구히 잃는다. 그래서 지우는 대신 CLOSED로
// 표시해 남긴다 — 이 스냅샷이 쌓여야 "감정가 대비 낙찰률" 같은, API가 주지 않는
// 지표를 나중에 우리가 갖게 된다.
//
//   auction/index.json          메타 + 시도/시군구별 집계
//   auction/recent.json         전국 진행/예정 물건 (지역 미선택 목록용)
//   auction/deadline.json       마감임박 (입찰 종료 임박순)
//   auction/sido/{시도}.json    시도별
//   auction/sgg/{코드}.json     시군구별 전체

import { isSafeShardKey } from './shardKey.mjs'

const PREFIX = 'auction'

/**
 * 물건의 실제 상태를 계산한다.
 *
 * 시군구 샤드에 저장된 status는 그 샤드를 마지막으로 쓴 시점의 값이라,
 * 그 뒤에 입찰이 끝난 물건은 여전히 OPEN으로 남아 있을 수 있다.
 * 마감은 bid_end_at 하나로 판정되는 값이므로 저장 대신 읽을 때 계산한다 —
 * 그래야 하루 수천 건씩 나는 마감 때문에 전국 샤드를 다시 쓰지 않아도 된다.
 *
 * @param {object} it
 * @param {string} [nowIso] 기준 시각(ISO). 테스트에서 고정하기 위해 받는다.
 */
export function effectiveStatus(it, nowIso = new Date().toISOString()) {
  if (!it) return 'CLOSED'
  if (it.status === 'CLOSED') return 'CLOSED'
  if (it.bid_end_at && it.bid_end_at <= nowIso) return 'CLOSED'
  return it.status || 'OPEN'
}

/** 목록 응답으로 나가기 직전 상태를 최신화한다. 페이지 단위라 비용이 작다. */
export function withEffectiveStatus(items, nowIso = new Date().toISOString()) {
  return items.map((it) => {
    const status = effectiveStatus(it, nowIso)
    return status === it.status ? it : { ...it, status }
  })
}
/**
 * 입찰 종료일시가 없는 물건을 마감으로 판정하기까지의 유예기간.
 * 하루 2회 수집이므로 7일이면 열 번 넘게 재확인할 기회가 있다.
 */
const CLOSED_GRACE_MS = 7 * 24 * 60 * 60 * 1000
/** 전국 목록 샤드 크기 */
export const RECENT_SHARD_LIMIT = 3000
/** 시도 샤드 크기 */
export const SIDO_SHARD_LIMIT = 3000
/** 마감임박 샤드 크기 */
export const DEADLINE_SHARD_LIMIT = 500

/** 마감이 임박한 순. 종료일시가 없는 물건은 뒤로 민다. */
const byDeadline = (a, b) => (a.bid_end_at || '9999').localeCompare(b.bid_end_at || '9999')
/** 기본 목록 정렬: 아직 안 끝난 물건 우선, 그 안에서 마감임박순. */
const byDefault = (a, b) => {
  const rank = (it) => (it.status === 'CLOSED' ? 1 : 0)
  return rank(a) - rank(b) || byDeadline(a, b)
}

const median = (nums) => {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/**
 * 공매 물건 묶음의 집계.
 *
 * 실거래의 computeStats와 의도적으로 다르다 — 공매 최저입찰가의 중위값은
 * "시세"가 아니다. 경공매에서 의미 있는 지표는 감정가 대비 체감률이므로
 * 그쪽을 중심에 둔다. 진행 중인 물건만 세는 것도 같은 이유다(끝난 물건이
 * 섞이면 "지금 살 수 있는 물건 수"가 아니게 된다).
 */
export function computeAuctionStats(items) {
  const open = items.filter((it) => it.status !== 'CLOSED')
  if (open.length === 0) return { count: 0, open_count: 0, closed_count: items.length - open.length }

  const bids = open.map((it) => it.min_bid_price).filter((v) => v > 0)
  const rates = open.map((it) => it.discount_rate).filter((v) => typeof v === 'number' && v > 0)

  return {
    count: items.length,
    open_count: open.length,
    closed_count: items.length - open.length,
    median_min_bid: median(bids),
    median_appraisal: median(open.map((it) => it.appraisal_price).filter((v) => v > 0)),
    /** 감정가 대비 최저입찰가 비율의 중위값(%). 이 지역이 얼마나 떨어졌는지. */
    median_discount_rate: rates.length ? Math.round(median(rates) * 10) / 10 : 0,
    /** 최저입찰가가 공개된 물건 수. 위 중위값들의 모집단이다(count와 다르다). */
    priced_count: bids.length,
  }
}

/**
 * 수집 payload를 조회용 샤드 묶음으로 변환한다.
 * @returns {{ key: string, value: object }[]}
 */
export function buildAuctionShards(payload) {
  // 샤드를 만들기 전에 상태를 최신화한다.
  //
  // 정렬(byDefault)이 "진행 중인 것 먼저, 마감임박순"이라 상태가 낡아 있으면
  // 이미 끝난 물건이 앞자리를 차지한다. 그러면 recent.json(전국 목록의 원천)이
  // 만료 물건 3,000건으로 채워져, 읽는 쪽에서 걸러낸 뒤 **전국 화면이 0건**이 된다.
  // 실제로 그렇게 됐다. 여기서 한 번 맞춰두면 정렬·집계·샤드가 모두 일관된다.
  const items = withEffectiveStatus(payload.items, payload.last_update).sort(byDefault)

  const bySgg = new Map()
  const bySido = new Map()
  for (const it of items) {
    // 시군구 코드가 없는 물건(PNU가 빈 건물 물건)은 시군구 샤드에 못 넣는다.
    // 시도 샤드와 전국 샤드에는 정상적으로 들어가므로 화면에서 사라지지는 않는다.
    if (it.sgg_code) {
      if (!bySgg.has(it.sgg_code)) bySgg.set(it.sgg_code, [])
      bySgg.get(it.sgg_code).push(it)
    }
    if (it.sido) {
      if (!bySido.has(it.sido)) bySido.set(it.sido, [])
      bySido.get(it.sido).push(it)
    }
  }

  const out = []

  const sggStats = {}
  for (const [code, list] of bySgg) {
    out.push({ key: `${PREFIX}/sgg/${code}.json`, value: { items: list } })
    const head = list[0]
    sggStats[code] = {
      code,
      sido: head.sido,
      sgg: head.sgg,
      name: head.region_name,
      total: list.length,
      ...computeAuctionStats(list),
    }
  }

  const sidoStats = {}
  for (const [sido, list] of bySido) {
    out.push({ key: `${PREFIX}/sido/${sido}.json`, value: { items: list.slice(0, SIDO_SHARD_LIMIT) } })
    sidoStats[sido] = { sido, total: list.length, ...computeAuctionStats(list) }
  }

  out.push({ key: `${PREFIX}/recent.json`, value: { items: items.slice(0, RECENT_SHARD_LIMIT) } })

  /**
   * 시군구 코드가 없는 물건(PNU가 빈 건물 물건)을 **잘라내지 않고** 모아 둔다.
   *
   * 이 샤드가 없으면 readAllAuctions()가 시군구 샤드만으로 전체를 복원하다가
   * 이 물건들을 통째로 잃는다. 실제로 운영에서 70,138건 중 9,186건(13%)이
   * 병합 때마다 사라질 뻔했고, 축소 가드가 저장을 거부해 드러났다.
   * recent.json으로 되찾으려던 기존 방식은 그쪽이 3,000건으로 잘려 있어
   * 일부만 복구됐다 — 잘리지 않는 전용 샤드가 필요하다.
   */
  const orphans = items.filter((it) => !it.sgg_code)
  out.push({ key: `${PREFIX}/orphan.json`, value: { items: orphans } })

  // 마감임박: 아직 안 끝났고 종료일시가 미래인 물건만. 사용자 체감 가치가 가장 큰 목록이다.
  const now = new Date().toISOString()
  const deadline = items
    .filter((it) => it.status !== 'CLOSED' && it.bid_end_at && it.bid_end_at > now)
    .sort(byDeadline)
    .slice(0, DEADLINE_SHARD_LIMIT)
  out.push({ key: `${PREFIX}/deadline.json`, value: { items: deadline } })

  const byDivision = {}
  const byUse = {}
  for (const it of items) {
    if (it.prpt_div) byDivision[it.prpt_div] = (byDivision[it.prpt_div] || 0) + 1
    if (it.use_mcls) byUse[it.use_mcls] = (byUse[it.use_mcls] || 0) + 1
  }

  out.push({
    key: `${PREFIX}/index.json`,
    value: {
      last_update: payload.last_update,
      source: payload.source,
      stats: payload.stats,
      /**
       * 증분 수집이 "여기까지는 확실히 봤다"고 보증하는 시각.
       * 다음 실행이 이 값에서 겹침을 두고 이어받는다. 시간 예산에 걸려 잘린
       * 실행은 이 값을 전진시키지 않아, 못 본 구간이 조용히 건너뛰어지지 않는다.
       */
      incremental_watermark: payload.incremental_watermark || payload.last_update,
      /**
       * 재산유형별 워터마크. 한 실행이 한 종류만 처리하므로(함수 시간 제한),
       * 종류마다 "어디까지 봤는지"를 따로 남겨야 다음 실행이 이어받을 수 있다.
       */
      division_watermarks: payload.division_watermarks || {},
      /**
       * 재산유형별 이어받기 페이지. 한 창을 한 번에 못 끝냈을 때 어디서 끊겼는지.
       * 이게 없으면 그 재산유형은 1페이지만 무한 반복해 뒤쪽이 갱신되지 않는다.
       */
      division_cursors: payload.division_cursors || {},
      total_items: items.length,
      open_items: items.filter((it) => it.status !== 'CLOSED').length,
      // 전국 집계. 지역을 안 고른 첫 화면의 요약 카드가 이 값을 쓴다 —
      // 없으면 시도/시군구를 고르기 전까지 요약이 전부 "-"로 비어 보인다.
      overall: computeAuctionStats(items),
      sido: sidoStats,
      sgg: sggStats,
      division_totals: byDivision,
      use_totals: byUse,
      sido_shard_limit: SIDO_SHARD_LIMIT,
      recent_shard_limit: RECENT_SHARD_LIMIT,
    },
  })

  return out
}

// ── 조회 ──────────────────────────────────────────

let blobStore = null
const getBlobStore = async () => {
  if (blobStore !== null) return blobStore
  try {
    const { getStore } = await import('@netlify/blobs')
    // 실거래('trades')와 다른 스토어. 한쪽 사고가 다른 쪽으로 번지지 않게 한다.
    blobStore = getStore('auctions')
  } catch {
    blobStore = false
  }
  return blobStore
}

/**
 * 샤드 하나를 읽는다. Blobs → 로컬 파일 순.
 * requireExists=true면 Blobs 읽기가 끝내 실패했을 때 null 대신 예외를 던진다 —
 * "정말 없는 것"과 "일시적 실패"를 호출자가 구분해야 기존 데이터를 실수로 지우지 않는다.
 * (storage.mjs의 readShard와 같은 규약이다.)
 */
export async function readAuctionShard(key, { requireExists = false } = {}) {
  const store = await getBlobStore()
  if (store) {
    let lastErr = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const v = await store.get(key, { type: 'json' })
        if (v) return v
        lastErr = null
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (lastErr && requireExists) throw new Error(`공매 샤드 읽기 실패(${key}): ${lastErr.message}`)
  }
  // 로컬 파일 폴백은 키가 사용자 입력에서 왔을 수 있으므로 반드시 검증한다.
  if (!isSafeShardKey(key)) return null
  try {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const path = fileURLToPath(new URL(`../data/${key}`, import.meta.url))
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

export const readAuctionIndex = () => readAuctionShard(`${PREFIX}/index.json`)

/** 저장된 전체 물건을 시군구 샤드에서 복원한다. 시군구 샤드는 잘리지 않는다. */
export async function readAllAuctions({ allowIncomplete = false } = {}) {
  const idx = await readAuctionShard(`${PREFIX}/index.json`)
  if (!idx?.sgg) return []
  const all = []
  for (const code of Object.keys(idx.sgg)) {
    const shard = await readAuctionShard(`${PREFIX}/sgg/${code}.json`, { requireExists: true })
    if (!shard?.items) throw new Error(`공매 시군구 샤드 누락: ${PREFIX}/sgg/${code}.json`)
    all.push(...shard.items)
  }
  // 시군구 코드가 없는 물건은 시군구 샤드에 없다. 전용 샤드에서 통째로 되찾는다.
  // 이 샤드가 아직 없는(옛 데이터) 경우에만 recent.json으로 부분 복구한다 —
  // recent는 3,000건으로 잘려 있어 완전하지 않으므로 폴백일 뿐이다.
  const orphan = await readAuctionShard(`${PREFIX}/orphan.json`)
  if (orphan?.items) {
    all.push(...orphan.items)
  } else {
    const recent = await readAuctionShard(`${PREFIX}/recent.json`)
    for (const it of recent?.items || []) if (!it.sgg_code) all.push(it)
  }

  // 복원 결과가 인덱스가 말하는 총량보다 크게 모자라면, 어딘가를 잃은 것이다.
  // 이대로 병합하면 그 차이만큼 저장에서 사라지므로 호출자가 중단하게 한다.
  // (축소 가드가 최후 방어선이지만, 여기서 원인을 이름 붙여 알려주는 편이 낫다.)
  const expected = idx.total_items || 0
  if (!allowIncomplete && expected > 0 && all.length < expected * 0.98) {
    throw new Error(
      `공매 데이터 복원 부족: 인덱스 ${expected.toLocaleString()}건 중 ${all.length.toLocaleString()}건만 읽었습니다` +
        `${orphan?.items ? '' : ' (orphan 샤드 없음 — 전량 수집으로 한 번 재생성해야 합니다)'}`
    )
  }
  return all
}

/**
 * 이번 수집분을 저장된 기존 물건과 합친다.
 *
 * 실거래의 mergeItems와 갈라지는 지점이 여기다: 이번 수집에서 **안 보인** 물건은
 * 지우지 않고 status를 CLOSED로 바꿔 남긴다. 온비드가 끝난 물건을 더 이상 주지
 * 않으므로, 지우면 그 이력이 영구히 사라진다.
 *
 * @param {Set<string>} seenIds 이번 수집에서 실제로 본 id
 * @returns {{items: object[], reopened: number, closed: number}}
 */
export function mergeAuctions(existing, incoming, seenIds, seenAt) {
  const map = new Map()
  for (const it of existing) map.set(it.id, it)

  let closed = 0
  // 이번 병합으로 내용이 바뀐 시군구/시도. 증분 저장에서 이 샤드들만 다시 쓴다.
  // 시도 샤드는 하나가 3MB라 16개를 매번 쓰면 48MB가 되어, 수집보다 저장이
  // 훨씬 오래 걸린다(실측: 회당 65MB를 쓰다 함수 30초 한도에 걸렸다).
  const touchedSggCodes = new Set()
  const touchedSidos = new Set()
  // 시군구 코드가 없는 물건이 바뀌었는지. orphan 샤드는 1만 건·11MB라
  // 바뀌지 않았으면 다시 쓰지 않는다.
  let touchedOrphan = false
  for (const [id, old] of map) {
    if (seenIds.has(id)) continue
    if (old.status === 'CLOSED') continue
    // "이번에 안 보였다"만으로 마감 처리하면 안 된다. 호출 예산이 떨어져 그 물건까지
    // 못 간 경우와 구분되지 않기 때문이다 — 실제로 예산을 줄여 돌리면 멀쩡히 입찰
    // 중인 물건 수천 건이 한꺼번에 마감으로 바뀐다.
    // 입찰 종료일시가 이미 지난 물건만 마감으로 본다. 아직 미래인데 안 보인 것은
    // 이번 수집이 거기까지 못 간 것으로 보고 그대로 둔다(다음 실행에서 다시 확인된다).
    //
    // bid_end_at이 비어 있으면 마감 여부를 판단할 근거가 없다. 이때 마감으로 처리하면
    // 위에서 막으려던 오마감이 이 물건들에서만 그대로 재현된다. 대신 유예기간을 둔다 —
    // CLOSED_GRACE_MS 동안 한 번도 다시 안 보이면 그때 닫는다. 그 사이 한 번이라도
    // 보이면 last_seen_at이 갱신되어 유예가 초기화된다.
    if (old.bid_end_at) {
      if (old.bid_end_at > seenAt) continue
    } else {
      const lastSeen = Date.parse(old.last_seen_at || old.first_seen_at || '')
      const elapsed = Number.isNaN(lastSeen) ? 0 : Date.parse(seenAt) - lastSeen
      if (elapsed < CLOSED_GRACE_MS) continue
    }
    // 마지막으로 본 시각(last_seen_at)은 그대로 두어 "우리가 언제까지 확인했는지"가
    // 화면에 정직하게 남게 한다.
    map.set(id, { ...old, status: 'CLOSED', closed_detected_at: seenAt })
    // 마감은 시군구 샤드를 다시 쓸 이유가 되지 않는다. bid_end_at만 있으면
    // 읽는 쪽에서 effectiveStatus()로 계산할 수 있는 값이기 때문이다.
    // 여기서 touched에 넣으면 하루 수천 건씩 나는 마감이 전국 샤드를 매번
    // 다시 쓰게 만들어, 증분 수집의 이점이 저장 단계에서 통째로 사라진다.
    // (전역 샤드 index/recent/deadline은 어차피 매번 다시 쓰므로 즉시 정확해진다.)
    closed++
  }

  for (const it of incoming) {
    const old = map.get(it.id)
    // first_seen_at은 처음 본 시각을 지켜야 하므로 기존 값을 유지한다.
    map.set(it.id, old ? { ...it, first_seen_at: old.first_seen_at || it.first_seen_at } : it)
    if (it.sgg_code) touchedSggCodes.add(it.sgg_code)
    else touchedOrphan = true
    if (it.sido) touchedSidos.add(it.sido)
    // 시군구·시도가 바뀐 경우(드물지만 원본 정정) 옛 샤드에서도 빼야 하므로 함께 표시한다.
    if (old?.sgg_code && old.sgg_code !== it.sgg_code) touchedSggCodes.add(old.sgg_code)
    if (old?.sido && old.sido !== it.sido) touchedSidos.add(old.sido)
    if (old && !old.sgg_code && it.sgg_code) touchedOrphan = true
  }

  return { items: [...map.values()].sort(byDefault), closed, touchedSggCodes, touchedSidos, touchedOrphan }
}

/**
 * 저장 직전 병합. 기존 데이터를 온전히 읽지 못하면 null을 반환해
 * 호출자가 이번 저장을 통째로 건너뛰게 한다(부분 저장이 유실보다 위험하다).
 */
export async function mergeAuctionsWithStored(
  payload,
  seenIds,
  seenAt,
  log = () => {},
  { allowIncomplete = false } = {}
) {
  let existing
  try {
    // allowIncomplete는 **전량 수집으로 부트스트랩할 때만** 쓴다.
    // orphan 샤드가 없던 시절의 데이터에서는 복원이 항상 부족하게 나와,
    // 그 샤드를 만들려면 저장이 필요한데 저장은 복원 검사에 막히는 순환이 생긴다.
    // 이번 payload가 전량이라면 기존을 완전히 못 읽어도 손실이 없다.
    existing = await readAllAuctions({ allowIncomplete })
  } catch (e) {
    log(`기존 공매 데이터를 온전히 읽지 못해 이번 저장을 건너뜁니다(기존 보존): ${e.message}`)
    return null
  }
  if (existing.length === 0) return payload

  const { items, closed, touchedSggCodes, touchedSidos, touchedOrphan } = mergeAuctions(existing, payload.items, seenIds, seenAt)
  log(
    `기존 ${existing.length.toLocaleString()}건과 병합 → ${items.length.toLocaleString()}건 ` +
      `(신규 ${(items.length - existing.length).toLocaleString()}건, 마감 처리 ${closed}건)`
  )
  return { ...payload, items, touchedSggCodes, touchedSidos, touchedOrphan }
}

/**
 * 샤드를 Blobs에 저장한다. index.json은 마지막에 써서, 샤드가 다 올라가기 전의
 * index를 읽고 빈 결과를 내는 일이 없게 한다.
 */
export async function writeAuctionShardsToStore(
  store,
  payload,
  // 실측(2026-09-04, 220KB 샤드): 동시성 8은 샤드당 286ms, 24는 177ms, 48은 147ms.
  // 48부터는 개선폭이 줄고 한도에 걸릴 위험이 커져 24를 기본으로 둔다.
  { force = false, touchedSggCodes = null, touchedSidos = null, touchedOrphan = null, concurrency = 24 } = {}
) {
  const prev = await readAuctionShard(`${PREFIX}/index.json`)
  const prevTotal = prev?.total_items || 0
  if (prevTotal > payload.items.length && !force) {
    throw new Error(
      `저장 거부: 기존 ${prevTotal.toLocaleString()}건 → 이번 ${payload.items.length.toLocaleString()}건으로 줄어듭니다. ` +
        '병합이 동작했는지 확인하거나, 의도한 축소라면 force 옵션을 쓰세요.'
    )
  }
  const shards = buildAuctionShards(payload)
  const indexShard = shards.find((s) => s.key === `${PREFIX}/index.json`)

  /**
   * 증분 갱신에서는 바뀐 시군구 샤드만 쓴다.
   *
   * 전량을 매번 쓰면 샤드 300여 개를 순차 저장하느라 수집보다 오래 걸려,
   * 함수 실행 시간 제한을 넘기는 주범이 된다. 전역 샤드(index/recent/deadline/sido)는
   * 어차피 전체 집계라 항상 다시 쓴다 — 개수가 적어 비용이 작다.
   *
   * touchedSggCodes가 null이면(전량 수집) 종전대로 전부 쓴다.
   */
  const nameIn = (key, dir) => key.slice(`${PREFIX}/${dir}/`.length, -'.json'.length)
  const targets = shards.filter((s) => {
    if (s === indexShard) return false
    if (!touchedSggCodes) return true // 전량 수집 — 전부 다시 쓴다
    if (s.key.startsWith(`${PREFIX}/sgg/`)) return touchedSggCodes.has(nameIn(s.key, 'sgg'))
    // 시도 샤드는 3MB씩이라 16개를 매번 쓰면 48MB가 된다. 바뀐 시도만 쓴다.
    if (s.key.startsWith(`${PREFIX}/sido/`)) return !touchedSidos || touchedSidos.has(nameIn(s.key, 'sido'))
    // orphan은 1만 건·11MB라 시군구 없는 물건이 바뀐 경우에만 쓴다.
    if (s.key === `${PREFIX}/orphan.json`) return touchedOrphan !== false
    // recent/deadline은 전국 집계라 항상 다시 쓴다(작고, 마감 상태가 매번 바뀐다).
    return true
  })

  // 순차 저장은 샤드 수에 비례해 느려진다. 소량 병렬로 묶어 쓴다.
  for (let i = 0; i < targets.length; i += concurrency) {
    await Promise.all(targets.slice(i, i + concurrency).map((s) => store.setJSON(s.key, s.value)))
  }
  // index는 마지막에. 샤드가 다 올라가기 전의 index를 읽고 빈 결과를 내는 일이 없게 한다.
  if (indexShard) await store.setJSON(indexShard.key, indexShard.value)
  return targets.length + (indexShard ? 1 : 0)
}
