// 수집 결과 저장/조회 계층
//
// 10만 건(49MB)을 한 파일에 두면 요청마다 전체를 파싱해 1.5초가 걸린다.
// 조회 패턴에 맞춰 잘게 쪼개고 통계는 미리 계산해 둔다.
//
//   index.json            메타데이터 + 시도/시군구별 사전 계산 통계 (수십 KB)
//   recent.json           전국 최신 거래 (지역 미선택 목록용)
//   sido/{시도}.json       시도별 최신 거래 (시도만 선택했을 때)
//   sgg/{코드}.json        시군구별 전체 거래 (가장 정확한 조회 단위, 최대 ~2MB)
//   type/{종목}.json       아파트를 뺀 종목별 전국 최신 거래 (상가·토지·오피스텔 조회용)
//   complex-index.json    단지명 → 시군구코드 (단지 상세 조회용)
//
// 조회는 Netlify Blobs를 먼저 보고, 없으면 로컬 수집 파일로 폴백한다.

import { isSafeShardKey } from './shardKey.mjs'

/** 시도 샤드에 담을 최신 거래 수 (약 2MB) */
export const SIDO_SHARD_LIMIT = 4000
/** 전국 최신 샤드 크기 */
export const RECENT_SHARD_LIMIT = 3000
/**
 * 종목별 전국 샤드 크기.
 *
 * recent.json은 날짜 내림차순 상위 N건이라 물량이 압도적인 아파트가 독식한다.
 * 실제로 3,000건 안에 상가는 50건뿐이라, 지역을 안 고르고 "상가"를 누르면
 * 거의 빈 화면이 나왔다. 더 나쁜 건 서울 전체(4,000건)에서 상가가 72건인데
 * 강남구 하나만 고르면 142건이 나오는 역전 — 범위를 좁혔더니 결과가 늘어나므로
 * 사용자에겐 고장으로 보인다.
 * 아파트를 뺀 종목은 전체 물량이 작아(상가 3.6천·토지 12.7천·오피스텔 3.1천)
 * 종목별 샤드를 따로 두면 파일을 크게 늘리지 않고 전국·시도 조회가 정상화된다.
 */
export const TYPE_SHARD_LIMIT = 15000
/** 종목별 샤드를 따로 두는 종목. 아파트는 물량이 커서 recent/sido 샤드로 충분하다. */
export const TYPE_SHARD_TYPES = ['OFFICETEL', 'COMMERCIAL', 'LAND']
/** "단지" 개념이 실재해 단지 상세로 묶어도 되는 종목. 상가·토지는 필지 단위라 제외된다. */
export const COMPLEX_TYPES = ['APARTMENT', 'OFFICETEL']
/** 평당가 통계에 넣을 토지 최소 면적(㎡). 이보다 작은 자투리 필지는 단가가 튄다. */
export const MIN_LAND_AREA_FOR_UNIT_PRICE = 10

/** 월별 중위 평당가 추이. 지분거래·면적 0을 이미 뺀 목록을 받는다. */
function monthlyTrend(unitPriceItems) {
  const byMonth = new Map()
  for (const it of unitPriceItems) {
    const ym = it.deal_date.slice(0, 7)
    if (!byMonth.has(ym)) byMonth.set(ym, [])
    byMonth.get(ym).push(it.price_per_pyeong)
  }
  return [...byMonth.entries()]
    .map(([month, vals]) => ({ month, count: vals.length, median_per_pyeong: median(vals) }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

const median = (nums) => {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/**
 * 거래 목록에서 통계 + 월별 중위 평당가 추이를 계산한다.
 * dealType을 주면 그 거래유형만 집계한다(기본은 매매 — 평당가·중위가가
 * 매매에서만 의미가 있어서다). 전월세를 고르면 count는 전월세 건수가,
 * median_price는 보증금 중위값이 된다 — 화면이 "전세/월세 보증금 중위"로
 * 라벨을 바꿔야 한다는 뜻이지 계산이 틀렸다는 뜻은 아니다.
 */
export function computeStats(items, dealType = 'TRADE') {
  const trades = items.filter((it) => it.deal_type === dealType)
  if (trades.length === 0) return { count: 0 }

  const prices = trades.map((it) => it.price)

  // 지분 거래는 일부 지분만 사고판 것이라 면적당 단가가 실제 시세와 크게 다르다.
  // 거래 목록에는 남기되 평당가 통계에서는 뺀다.
  //
  // 토지의 10㎡ 미만 자투리 필지(도로 편입분·경계 정리분 등)도 같은 이유로 뺀다.
  // 면적이 워낙 작아 평당가가 튄다 — 이 구간의 중위 평당가는 208만원으로 정상
  // 필지(25만원)의 8배이고, 4.2%밖에 안 되는데도 토지 중위 평당가를 7% 밀어올렸다.
  // 거래 목록에는 그대로 남으므로 사용자가 개별 거래를 못 보는 일은 없다.
  const forUnitPrice = trades.filter(
    (it) =>
      !it.share_deal &&
      it.price_per_pyeong > 0 &&
      !(it.property_type === 'LAND' && it.area < MIN_LAND_AREA_FOR_UNIT_PRICE)
  )
  const perPyeong = forUnitPrice.map((it) => it.price_per_pyeong)

  // 종목별 통계는 평당가만이 아니라 가격 지표 전체가 필요하므로 거래 자체를 모은다.
  const tradesByProperty = new Map()
  for (const it of trades) {
    const pt = it.property_type || 'UNKNOWN'
    if (!tradesByProperty.has(pt)) tradesByProperty.set(pt, [])
    tradesByProperty.get(pt).push(it)
  }

  return {
    count: trades.length,
    median_price: median(prices),
    avg_price: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    min_price: Math.min(...prices),
    max_price: Math.max(...prices),
    median_per_pyeong: median(perPyeong),
    /**
     * 평당가 통계의 모집단 크기. count(전체 매매 건수)와 다르다.
     * 지분 거래와 면적 0인 건이 빠지기 때문이며, 여러 지역 통계를 합칠 때
     * median_per_pyeong의 가중치로는 반드시 이 값을 써야 한다.
     */
    unit_price_count: perPyeong.length,
    /**
     * 종목별 통계 전체. 아파트·오피스텔·상가·토지는 가격대와 평당가 스케일이
     * 서로 달라 한 덩어리로 중위값을 내면 지역 시세가 왜곡된다.
     * 화면이 종목을 고르면 요약 카드가 이 값을 그대로 쓴다.
     *
     * count는 해당 종목의 매매 건수, median_per_pyeong의 모집단은 지분거래·
     * 면적 0을 뺀 unit_price_count다(둘이 다르므로 가중치로 섞지 말 것).
     */
    per_property: Object.fromEntries(
      [...tradesByProperty.entries()].map(([type, list]) => {
        const p = list.map((it) => it.price)
        const u = list.filter((it) => !it.share_deal && it.price_per_pyeong > 0)
        const up = u.map((it) => it.price_per_pyeong)
        return [
          type,
          {
            count: list.length,
            median_price: median(p),
            avg_price: Math.round(p.reduce((a, b) => a + b, 0) / p.length),
            min_price: Math.min(...p),
            max_price: Math.max(...p),
            median_per_pyeong: median(up),
            unit_price_count: up.length,
            trend: monthlyTrend(u),
          },
        ]
      })
    ),
    trend: monthlyTrend(forUnitPrice),
  }
}

const byDateDesc = (a, b) => b.deal_date.localeCompare(a.deal_date)

/**
 * 수집 payload를 조회용 샤드 묶음으로 변환한다.
 * @returns {{ key: string, value: object }[]} 저장할 키/값 목록
 */
export function buildShards(payload) {
  const items = [...payload.items].sort(byDateDesc)

  const bySgg = new Map()
  const bySido = new Map()
  for (const it of items) {
    if (!bySgg.has(it.sgg_code)) bySgg.set(it.sgg_code, [])
    bySgg.get(it.sgg_code).push(it)
    if (!bySido.has(it.sido)) bySido.set(it.sido, [])
    bySido.get(it.sido).push(it)
  }

  const out = []

  // 시군구 샤드 (전체 거래)
  const sggStats = {}
  for (const [code, list] of bySgg) {
    out.push({ key: `sgg/${code}.json`, value: { items: list } })
    const head = list[0]
    sggStats[code] = {
      code,
      sido: head.sido,
      sgg: head.sgg,
      name: head.region_name,
      total: list.length,
      ...computeStats(list),
    }
  }

  // 시도 샤드 (최신 N건)
  const sidoStats = {}
  for (const [sido, list] of bySido) {
    out.push({ key: `sido/${sido}.json`, value: { items: list.slice(0, SIDO_SHARD_LIMIT) } })
    sidoStats[sido] = { sido, total: list.length, ...computeStats(list) }
  }

  // 전국 최신
  out.push({ key: 'recent.json', value: { items: items.slice(0, RECENT_SHARD_LIMIT) } })

  // 종목별 전국 샤드 (아파트 제외). 상가·토지·오피스텔이 아파트 물량에 밀려
  // 전국·시도 조회에서 사라지던 문제를 막는다.
  const typeTotals = {}
  for (const it of items) typeTotals[it.property_type] = (typeTotals[it.property_type] || 0) + 1
  for (const type of TYPE_SHARD_TYPES) {
    const list = items.filter((it) => it.property_type === type)
    out.push({ key: `type/${type}.json`, value: { items: list.slice(0, TYPE_SHARD_LIMIT) } })
    // 시도별 종목 샤드. 상가·토지·오피스텔 조회는 대부분 시도를 먼저 고르고
    // 시작하는데, 그때마다 전국 샤드를 통째로 읽어 대부분을 버리는 건 낭비다
    // (토지 전국 샤드는 6.8MB인데 서울만 필요하면 그중 15%뿐이다). 종목별 전체
    // 물량 자체가 크지 않아(상가 3.6천·토지 12.7천·오피스텔 3.1천) 시도로 나눠도
    // 잘리는 시도가 거의 없다.
    const bySidoForType = new Map()
    for (const it of list) {
      if (!bySidoForType.has(it.sido)) bySidoForType.set(it.sido, [])
      bySidoForType.get(it.sido).push(it)
    }
    for (const [sidoName, sidoList] of bySidoForType) {
      out.push({
        key: `type/${type}-${sidoName}.json`,
        value: { items: sidoList.slice(0, TYPE_SHARD_LIMIT) },
      })
    }
  }

  // 단지명 → 시군구코드 (동명 단지는 거래가 많은 쪽을 대표로)
  //
  // 상가·토지는 단지 개념이 없어 name이 "청운동 9*"처럼 국토부가 끝자리를 가린
  // 지번이다. 이걸 키로 쓰면 서로 다른 필지가 한 "단지"로 병합된다 — 실제로
  // 마스킹된 키 5,091개 중 1,001개가 서로 다른 시군구로 동시에 매핑됐다
  // (예: "신당동 3**" → 서울 중구 + 충남 아산). 단지 상세에 무관한 거래 이력이
  // 섞여 보이므로 아파트·오피스텔만 인덱싱한다.
  const complexCount = new Map()
  for (const it of items) {
    if (!COMPLEX_TYPES.includes(it.property_type)) continue
    const key = it.name
    if (!complexCount.has(key)) complexCount.set(key, new Map())
    const m = complexCount.get(key)
    m.set(it.sgg_code, (m.get(it.sgg_code) || 0) + 1)
  }
  const complexIndex = {}
  for (const [name, m] of complexCount) {
    complexIndex[name] = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code)
  }
  out.push({ key: 'complex-index.json', value: complexIndex })

  out.push({
    key: 'index.json',
    value: {
      last_update: payload.last_update,
      source: payload.source,
      months: payload.months,
      stats: payload.stats,
      total_items: items.length,
      sido: sidoStats,
      sgg: sggStats,
      sido_shard_limit: SIDO_SHARD_LIMIT,
      recent_shard_limit: RECENT_SHARD_LIMIT,
      type_shard_limit: TYPE_SHARD_LIMIT,
      /** 종목별 전체 보유 건수. 화면이 "이 종목 N건 중 일부만 검색했다"를 말할 때 쓴다. */
      type_totals: typeTotals,
    },
  })

  return out
}

// ── 조회 ──────────────────────────────────────────

const STALE_MS = 7 * 24 * 60 * 60 * 1000

let blobStore = null
const getBlobStore = async () => {
  if (blobStore !== null) return blobStore
  try {
    const { getStore } = await import('@netlify/blobs')
    blobStore = getStore('trades')
  } catch {
    blobStore = false
  }
  return blobStore
}

/**
 * 샤드 하나를 읽는다. Blobs → 로컬 파일 순.
 *
 * Blobs 읽기가 일시적으로 실패하면 최대 2회 재시도한다. 여기서 실패를
 * 조용히 삼키고 null을 반환하면, 이 샤드가 정말로 없는 것인지 일시적
 * 네트워크 문제인지 호출자가 구분할 수 없다. readAllItems()처럼 "존재해야
 * 하는" 샤드를 순회하는 코드는 이 차이를 알아야 저장된 데이터를 실수로
 * 지우지 않는다. requireExists=true면 Blobs 읽기가 끝내 실패했을 때
 * null 대신 예외를 던진다 (로컬 파일 폴백은 여전히 시도한다 — 로컬 개발
 * 환경에는 Blobs 자체가 없는 게 정상이라 이 경로는 실패로 치지 않는다).
 */
export async function readShard(key, { requireExists = false } = {}) {
  const store = await getBlobStore()
  if (store) {
    let lastErr = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const v = await store.get(key, { type: 'json' })
        if (v) return v
        lastErr = null // 정상 응답인데 값이 없음(진짜로 없는 키) — 재시도 의미 없음
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (lastErr && requireExists) {
      throw new Error(`샤드 읽기 실패(${key}): ${lastErr.message}`)
    }
  }
  // 로컬 파일 폴백은 키가 사용자 입력에서 왔을 수 있으므로 반드시 검증한다.
  // (Blobs는 키를 경로로 해석하지 않아 탈출이 불가능하지만, 파일 읽기는 가능하다.)
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

/**
 * 저장된 전체 거래를 시군구 샤드에서 되짚어 복원한다.
 * 시군구 샤드는 잘라내지 않고 전부 담고 있으므로 여기서 원본 전체가 나온다.
 * 일부 지역만 추가 수집할 때 기존 데이터를 잃지 않고 병합하는 데 쓴다.
 *
 * index.json에 등록된 시군구 샤드는 전부 읽혀야 한다. 하나라도 읽기가
 * 끝내 실패하면(일시적 네트워크 문제 등) 예외를 던져 호출자가 이 결과를
 * "전체"로 오인해 나머지 지역을 지워버리지 않게 한다.
 * (readShard의 requireExists 옵션으로 이 실패/누락을 구분한다.)
 */
export async function readAllItems() {
  const idx = await readShard('index.json')
  if (!idx?.sgg) return []
  const all = []
  for (const code of Object.keys(idx.sgg)) {
    const shard = await readShard(`sgg/${code}.json`, { requireExists: true })
    if (!shard?.items) throw new Error(`시군구 샤드 누락: sgg/${code}.json`)
    all.push(...shard.items)
  }
  return all
}

/** id 기준으로 두 목록을 병합한다. 새 데이터가 기존 것을 덮어쓴다. */
export function mergeItems(existing, incoming) {
  const map = new Map()
  for (const it of existing) map.set(it.id, it)
  for (const it of incoming) map.set(it.id, it)
  return [...map.values()].sort(byDateDesc)
}

/**
 * 이번 수집분을 저장된 기존 거래와 합친다.
 *
 * 한 번의 수집은 호출 예산 때문에 전국을 다 돌지 못한다. 이번 것만으로 샤드를
 * 다시 만들면 예산 밖으로 밀린 시군구가 index.json에서 통째로 빠져 화면에서
 * 사라지므로, 저장 전에 반드시 이 함수를 거쳐야 한다.
 *
 * readAllItems()가 실패하면(샤드 읽기 오류) "이번 수집분만이라도 저장"하지
 * 않는다 — 그러면 방금 실패로 못 읽은 기존 지역들이 index에서 통째로
 * 사라지는, 데이터 유실이 오히려 더 큰 사고가 된다. 대신 null을 반환해
 * 호출자가 이번 저장을 통째로 건너뛰게 한다. 이전 인덱스는 그대로 남는다.
 * @returns {Promise<object|null>} 병합된 payload, 또는 저장을 건너뛰라는 null
 */
export async function mergeWithStored(payload, log = () => {}, allCodes = null) {
  let existing
  try {
    existing = await readAllItems()
  } catch (e) {
    log(`기존 데이터를 온전히 읽지 못해 이번 저장을 건너뜁니다(기존 데이터 보존): ${e.message}`)
    return null
  }

  // index.json에 등록되지 않은 채 남아 있는 샤드(고아)를 함께 되찾는다.
  // readAllItems는 index에 적힌 시군구만 읽으므로, index가 한 번 불완전하게
  // 덮여 쓰이면 그 지역은 이후 모든 병합에서 빠져 유실이 영구화된다.
  // 실제로 이 구조 때문에 부산·대구·인천·울산과 경기 대부분(91,394건)이
  // 파일은 남은 채로 서비스에서 사라진 적이 있다.
  if (allCodes) {
    const idx = await readShard('index.json')
    const registered = new Set(Object.keys(idx?.sgg || {}))
    const orphanCodes = allCodes.filter(({ code }) => !registered.has(code))
    if (orphanCodes.length > 0) {
      const { items: orphans, found } = await reconcileFromShards(orphanCodes)
      if (orphans.length > 0) {
        log(`index에 없던 시군구 ${found.length}개에서 ${orphans.length.toLocaleString()}건을 되찾았습니다`)
        existing = mergeItems(existing, orphans)
      }
    }
  }
  if (existing.length === 0) return payload
  const merged = mergeItems(existing, payload.items)
  log(`기존 ${existing.length}건과 병합 → ${merged.length}건 (신규 ${merged.length - existing.length}건)`)
  return { ...payload, items: merged }
}

/**
 * 샤드를 Blobs에 저장한다.
 * index.json은 나머지가 모두 올라간 뒤 마지막에 써서, 샤드가 다 올라가기 전의
 * index를 읽고 빈 결과를 내는 일이 없게 한다.
 * @returns {Promise<number>} 저장한 샤드 개수
 */
export async function writeShardsToStore(store, payload, { force = false } = {}) {
  // 이번 저장이 기존보다 데이터를 줄이면 막는다. 유실은 조용히 일어나고
  // (샤드 파일은 남고 index만 작아진다) 스스로 복구되지 않으므로,
  // 되돌리기 어려운 쪽을 기본으로 거부한다.
  const prev = await readShard('index.json')
  const prevTotal = prev?.total_items || 0
  if (prevTotal > payload.items.length && !force) {
    throw new Error(
      `저장 거부: 기존 ${prevTotal.toLocaleString()}건 → 이번 ${payload.items.length.toLocaleString()}건으로 줄어듭니다. ` +
        '병합이 동작했는지 확인하거나, 의도한 축소라면 force 옵션을 쓰세요.'
    )
  }
  const shards = buildShards(payload)
  const indexShard = shards.find((s) => s.key === 'index.json')
  for (const { key, value } of shards) {
    if (key === 'index.json') continue
    await store.setJSON(key, value)
  }
  await store.setJSON('index.json', indexShard.value)
  return shards.length
}

/**
 * index.json이 아니라 "있을 수 있는 모든 시군구 코드"를 직접 순회해 데이터를
 * 되짚는다. index.json이 불완전한 상태로 저장된 적이 있다면(과거 버그 등)
 * readAllItems()는 그 불완전한 목록만 복원하지만, 이 함수는 개별 시군구
 * 샤드 파일이 남아있는 한 index 목록과 무관하게 전부 찾아낸다.
 * @param {{code:string}[]} allCodes 점검할 전체 시군구 코드 목록
 */
export async function reconcileFromShards(allCodes) {
  const all = []
  const found = []
  const missing = []
  for (const { code } of allCodes) {
    const shard = await readShard(`sgg/${code}.json`)
    if (shard?.items?.length) {
      all.push(...shard.items)
      found.push(code)
    } else {
      missing.push(code)
    }
  }
  return { items: all, found, missing }
}

/** 메타데이터 + 사전 계산 통계. 오래됐거나 없으면 null. */
export async function readIndex() {
  const idx = await readShard('index.json')
  if (!idx || !idx.last_update) return null
  if (Date.now() - new Date(idx.last_update).getTime() > STALE_MS) return null
  return idx
}
