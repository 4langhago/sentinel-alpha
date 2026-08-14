// 수집 결과 저장/조회 계층
//
// 10만 건(49MB)을 한 파일에 두면 요청마다 전체를 파싱해 1.5초가 걸린다.
// 조회 패턴에 맞춰 잘게 쪼개고 통계는 미리 계산해 둔다.
//
//   index.json            메타데이터 + 시도/시군구별 사전 계산 통계 (수십 KB)
//   recent.json           전국 최신 거래 (지역 미선택 목록용)
//   sido/{시도}.json       시도별 최신 거래 (시도만 선택했을 때)
//   sgg/{코드}.json        시군구별 전체 거래 (가장 정확한 조회 단위, 최대 ~2MB)
//   complex-index.json    단지명 → 시군구코드 (단지 상세 조회용)
//
// 조회는 Netlify Blobs를 먼저 보고, 없으면 로컬 수집 파일로 폴백한다.

/** 시도 샤드에 담을 최신 거래 수 (약 2MB) */
export const SIDO_SHARD_LIMIT = 4000
/** 전국 최신 샤드 크기 */
export const RECENT_SHARD_LIMIT = 3000

const median = (nums) => {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/** 매매 거래 목록에서 통계 + 월별 중위 평당가 추이를 계산한다. */
export function computeStats(items) {
  const trades = items.filter((it) => it.deal_type === 'TRADE')
  if (trades.length === 0) return { count: 0 }

  const prices = trades.map((it) => it.price)

  // 지분 거래는 일부 지분만 사고판 것이라 면적당 단가가 실제 시세와 크게 다르다.
  // 거래 목록에는 남기되 평당가 통계에서는 뺀다.
  const forUnitPrice = trades.filter((it) => !it.share_deal && it.price_per_pyeong > 0)
  const perPyeong = forUnitPrice.map((it) => it.price_per_pyeong)

  const byMonth = new Map()
  const byProperty = new Map()
  for (const it of forUnitPrice) {
    const ym = it.deal_date.slice(0, 7)
    if (!byMonth.has(ym)) byMonth.set(ym, [])
    byMonth.get(ym).push(it.price_per_pyeong)

    const pt = it.property_type || 'UNKNOWN'
    if (!byProperty.has(pt)) byProperty.set(pt, [])
    byProperty.get(pt).push(it.price_per_pyeong)
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
     * 종목별 평당가. 아파트·오피스텔·상가·토지는 평당가 스케일이 서로 달라
     * 한 덩어리로 중위값을 내면 지역 시세가 왜곡된다.
     * 화면이 종목을 고른 경우 여기서 해당 종목 값을 꺼내 쓴다.
     */
    per_property: Object.fromEntries(
      [...byProperty.entries()].map(([type, vals]) => [
        type,
        { count: vals.length, median_per_pyeong: median(vals) },
      ])
    ),
    trend: [...byMonth.entries()]
      .map(([month, vals]) => ({ month, count: vals.length, median_per_pyeong: median(vals) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
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

  // 단지명 → 시군구코드 (동명 단지는 거래가 많은 쪽을 대표로)
  const complexCount = new Map()
  for (const it of items) {
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

/** 샤드 하나를 읽는다. Blobs → 로컬 파일 순. 없으면 null. */
export async function readShard(key) {
  const store = await getBlobStore()
  if (store) {
    try {
      const v = await store.get(key, { type: 'json' })
      if (v) return v
    } catch {
      /* 로컬 폴백으로 진행 */
    }
  }
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
 */
export async function readAllItems() {
  const idx = await readShard('index.json')
  if (!idx?.sgg) return []
  const all = []
  for (const code of Object.keys(idx.sgg)) {
    const shard = await readShard(`sgg/${code}.json`)
    if (shard?.items) all.push(...shard.items)
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
 */
export async function mergeWithStored(payload, log = () => {}) {
  try {
    const existing = await readAllItems()
    if (existing.length === 0) return payload
    const merged = mergeItems(existing, payload.items)
    log(`기존 ${existing.length}건과 병합 → ${merged.length}건 (신규 ${merged.length - existing.length}건)`)
    return { ...payload, items: merged }
  } catch (e) {
    // 병합에 실패해도 이번 수집분만이라도 저장한다(첫 실행 등).
    log(`기존 데이터 병합 실패, 이번 수집분만 저장합니다: ${e.message}`)
    return payload
  }
}

/**
 * 샤드를 Blobs에 저장한다.
 * index.json은 나머지가 모두 올라간 뒤 마지막에 써서, 샤드가 다 올라가기 전의
 * index를 읽고 빈 결과를 내는 일이 없게 한다.
 * @returns {Promise<number>} 저장한 샤드 개수
 */
export async function writeShardsToStore(store, payload) {
  const shards = buildShards(payload)
  const indexShard = shards.find((s) => s.key === 'index.json')
  for (const { key, value } of shards) {
    if (key === 'index.json') continue
    await store.setJSON(key, value)
  }
  await store.setJSON('index.json', indexShard.value)
  return shards.length
}

/** 메타데이터 + 사전 계산 통계. 오래됐거나 없으면 null. */
export async function readIndex() {
  const idx = await readShard('index.json')
  if (!idx || !idx.last_update) return null
  if (Date.now() - new Date(idx.last_update).getTime() > STALE_MS) return null
  return idx
}
