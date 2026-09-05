// 부동산 시세·실거래 API — Netlify Functions
//
// 데이터는 lib/storage.mjs가 만든 샤드에서 읽는다. 조회 조건에 필요한 샤드만
// 읽으므로 전체(49MB)를 파싱하지 않는다. 샤드가 없으면 샘플로 폴백하며,
// 응답의 source/is_live로 항상 실데이터 여부를 알린다.
import { generateTrades } from './lib/mockTrades.mjs'
import { ALL_SGG, REGIONS } from './lib/regionCodes.mjs'
import { readIndex, readShard, computeStats, TYPE_SHARD_TYPES, COMPLEX_TYPES } from './lib/storage.mjs'
import { generateAuctions } from './lib/mockAuctions.mjs'
import {
  readAuctionIndex,
  readAuctionShard,
  computeAuctionStats,
  withEffectiveStatus,
  effectiveStatus,
} from './lib/auctionStorage.mjs'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })

const matchesQuery = (item, keywords) =>
  keywords.every((k) => `${item.name} ${item.address} ${item.region_name} ${item.umd}`.includes(k))

/**
 * 조회 조건에 맞는 최소한의 샤드를 고른다.
 * - 시군구 지정: 해당 시군구 전체 거래 (가장 정확)
 * - 시도만 지정: 그 시도의 최신 N건
 * - 미지정: 전국 최신 N건
 * scope로 어느 범위를 본 것인지 함께 알려 결과를 오해하지 않게 한다.
 *
 * 시군구를 안 고른 상태에서 아파트가 아닌 종목(상가·토지·오피스텔)을 고르면
 * 날짜순 상위 N건 샤드 대신 종목별 샤드를 읽는다. 그 샤드들은 아파트 물량에
 * 밀려 상가·토지가 거의 안 잡히던 문제 때문에 따로 만들어 둔 것이다.
 * (시도만 고른 경우에는 종목 샤드를 읽고 메모리에서 시도로 거른다 —
 *  종목별 전체가 1만 건 안쪽이라 시도별 샤드를 또 만드는 것보다 싸다.)
 */
async function loadScope({ sggCode, sido, propertyType }, index) {
  if (!index) {
    return { items: generateTrades(), scope: 'sample', isLive: false, source: 'mock', truncated: false }
  }
  if (sggCode) {
    const shard = await readShard(`sgg/${sggCode}.json`)
    return {
      items: shard?.items || [],
      scope: 'sgg',
      isLive: true,
      source: index.source,
      truncated: false,
    }
  }
  if (propertyType && TYPE_SHARD_TYPES.includes(propertyType)) {
    // 시도를 골랐으면 그 시도만 담은 작은 샤드를 먼저 시도한다 — 전국 샤드
    // (토지 기준 6.8MB)를 통째로 읽어 대부분을 버리는 것보다 훨씬 싸다.
    const shard = sido
      ? await readShard(`type/${propertyType}-${sido}.json`)
      : await readShard(`type/${propertyType}.json`)
    if (shard?.items) {
      const items = shard.items
      const total = sido
        ? index.sido?.[sido]?.per_property?.[propertyType]?.count ?? items.length
        : index.type_totals?.[propertyType] ?? items.length
      return {
        items,
        scope: sido ? 'sido' : 'recent',
        isLive: true,
        source: index.source,
        // 종목 샤드가 전체를 담고 있으면 잘린 게 아니다.
        truncated: total > items.length,
      }
    }
    // 시도별 종목 샤드가 없는(예전 인덱스) 배포라면 전국 샤드에서 걸러 쓴다.
    if (sido) {
      const nationalShard = await readShard(`type/${propertyType}.json`)
      if (nationalShard?.items) {
        const all = nationalShard.items
        const items = all.filter((it) => it.sido === sido)
        const total = index.sido?.[sido]?.per_property?.[propertyType]?.count ?? items.length
        return { items, scope: 'sido', isLive: true, source: index.source, truncated: total > items.length }
      }
    }
    // 종목 샤드가 아직 없는(예전 인덱스) 배포에서는 아래 기본 경로로 내려간다.
  }
  if (sido) {
    const shard = await readShard(`sido/${sido}.json`)
    const total = index.sido?.[sido]?.total || 0
    return {
      items: shard?.items || [],
      scope: 'sido',
      isLive: true,
      source: index.source,
      truncated: total > (shard?.items?.length || 0),
    }
  }
  const shard = await readShard('recent.json')
  return {
    items: shard?.items || [],
    scope: 'recent',
    isLive: true,
    source: index.source,
    truncated: index.total_items > (shard?.items?.length || 0),
  }
}

/** 현재 조건 하 종목별·용도별 건수. 화면이 "이 조건에 뭐가 몇 건 있는지"를 미리 보여준다. */
function buildFacets(items) {
  const property = {}
  const useTypes = new Map()
  for (const it of items) {
    property[it.property_type] = (property[it.property_type] || 0) + 1
    if (it.use_type) useTypes.set(it.use_type, (useTypes.get(it.use_type) || 0) + 1)
  }
  return {
    property,
    use_types: [...useTypes.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  }
}

// ── 공매(온비드) ────────────────────────────────────
//
// 실거래와 데이터·스토어·샤드가 완전히 분리돼 있다. 공매 데이터가 아직 없어도
// 실거래는 정상 동작해야 하므로, 여기서 index를 따로 읽고 없으면 샘플로 폴백한다.

const auctionMatchesQuery = (item, keywords) =>
  keywords.every((k) => `${item.name} ${item.address} ${item.region_name} ${item.use_scls}`.includes(k))

/**
 * 조회 조건에 맞는 최소한의 공매 샤드를 고른다.
 * 시군구 지정 → 그 시군구 전체 / 시도만 → 시도 최신 N건 / 미지정 → 전국 N건.
 * 마감임박 전용 샤드는 목록이 작고 사용자 가치가 가장 커 따로 둔다.
 */
async function loadAuctionScope({ sggCodes, sido, deadlineOnly }, index) {
  if (!index) {
    return { items: generateAuctions(), scope: 'sample', isLive: false, source: 'mock', truncated: false }
  }
  if (deadlineOnly && sggCodes.length === 0 && !sido) {
    const shard = await readAuctionShard('auction/deadline.json')
    // deadline.json도 recent.json과 같은 함정이 있다 — "마감이 가장 가까운 500건"이라
    // 수집이 밀리면 **정확히 그 500건이 먼저 만료된다**. 그러면 마감임박 필터가
    // 0건을 돌려주는데, 실제로는 오늘 마감인 물건이 얼마든지 있다. 실제로 그랬다.
    // 진행 중인 물건이 하나도 남지 않았으면 아래 전국 경로로 내려가 다시 만든다.
    if (shard?.items?.some((it) => effectiveStatus(it) !== 'CLOSED')) {
      return { items: shard.items, scope: 'deadline', isLive: true, source: index.source, truncated: false }
    }
  }
  // 시군구는 다중 선택이다(경공매 이용자는 "강남·서초·송파"처럼 인접 구를 묶어 본다).
  // 시군구 샤드는 잘리지 않으므로 고른 만큼 읽어 이으면 그대로 전체가 된다.
  if (sggCodes.length > 0) {
    const items = []
    for (const code of sggCodes) {
      const shard = await readAuctionShard(`auction/sgg/${code}.json`)
      if (shard?.items) items.push(...shard.items)
    }
    return { items, scope: 'sgg', isLive: true, source: index.source, truncated: false }
  }
  if (sido) {
    const shard = await readAuctionShard(`auction/sido/${sido}.json`)
    const items = shard?.items || []
    const total = index.sido?.[sido]?.total ?? items.length
    return { items, scope: 'sido', isLive: true, source: index.source, truncated: total > items.length }
  }
  const shard = await readAuctionShard('auction/recent.json')
  let items = shard?.items || []

  // recent.json은 "마감 임박 상위 3,000건"이라 시간이 지나면 **정확히 그 3,000건이
  // 먼저 만료된다**. 수집이 몇 시간만 밀려도 전국 첫 화면이 통째로 0건이 되는데,
  // 실제로 그렇게 됐다(수집 4일 지연 → 3,000건 전부 마감, 전국엔 6.9만 건이 진행 중인데도).
  //
  // 갱신 주기를 3시간으로 줄여 근본 원인은 완화했지만, 갱신이 멈추면 다시 같은 일이
  // 벌어진다. 첫 화면이 비는 것은 "물건이 없다"는 거짓말이라 안전망을 둔다 —
  // 이 풀에 진행 중인 물건이 하나도 없으면 시도 샤드를 이어 붙여 다시 만든다.
  if (items.length > 0 && !items.some((it) => effectiveStatus(it) !== 'CLOSED')) {
    const rebuilt = []
    for (const sido of Object.keys(index.sido || {})) {
      const s = await readAuctionShard(`auction/sido/${sido}.json`)
      for (const it of s?.items || []) if (effectiveStatus(it) !== 'CLOSED') rebuilt.push(it)
    }
    if (rebuilt.length > 0) {
      return { items: rebuilt, scope: 'recent-fallback', isLive: true, source: index.source, truncated: true }
    }
  }

  return {
    items,
    scope: 'recent',
    isLive: true,
    source: index.source,
    truncated: (index.total_items || 0) > items.length,
  }
}

export default async (req) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, '') || '/'
  const q = url.searchParams
  const index = await readIndex()

  if (path === '/health') {
    return json({
      status: 'ok',
      db: Boolean(index),
      is_live: Boolean(index),
      source: index?.source || 'mock',
      last_update: index?.last_update || null,
      total_items: index?.total_items || 0,
      months: index?.months || null,
      collect_stats: index?.stats || null,
      version: 'trades-2.0.0-sharded',
    })
  }

  if (path === '/trades') {
    const search = (q.get('q') || '').trim()
    const sido = q.get('sido') || ''
    const sggCode = q.get('sgg_code') || ''
    const propertyType = q.get('property_type') || 'ALL'
    const dealType = q.get('deal_type') || 'ALL'
    const minPrice = Number(q.get('min_price') || 0)
    const maxPrice = Number(q.get('max_price') || Number.MAX_SAFE_INTEGER)
    const minArea = Number(q.get('min_area') || 0)
    const maxArea = Number(q.get('max_area') || Number.MAX_SAFE_INTEGER)
    const buildYearMin = Number(q.get('build_year_min') || 0)
    // 상가 건물용도 / 토지 지목 다중 선택
    const useTypes = (q.get('use_type') || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    const excludeShare = q.get('exclude_share') === '1'
    const sort = q.get('sort') || 'recent'
    const page = Math.max(1, Number(q.get('page') || 1))
    const limit = Math.min(100, Math.max(1, Number(q.get('limit') || 20)))

    const { items: pool, scope, isLive, source, truncated } = await loadScope(
      { sggCode, sido, propertyType: propertyType === 'ALL' ? '' : propertyType },
      index
    )

    let items = pool
    if (search) items = items.filter((it) => matchesQuery(it, search.split(/\s+/)))
    // 종목 칩은 "이 종목을 고르면 몇 건이 나오는가"를 보여줘야 하므로, 종목
    // 필터를 걸기 전 풀에서 센다. 걸고 나서 세면 지금 고른 종목만 카운트가
    // 남고 나머지는 전부 0이 되어(자기참조) 칩이 무의미해진다.
    const propertyFacets = buildFacets(items).property
    if (propertyType !== 'ALL') items = items.filter((it) => it.property_type === propertyType)
    if (dealType !== 'ALL') items = items.filter((it) => it.deal_type === dealType)
    items = items.filter((it) => it.price >= minPrice && it.price <= maxPrice)
    items = items.filter((it) => it.area >= minArea && it.area <= maxArea)
    if (excludeShare) items = items.filter((it) => !it.share_deal)
    // 용도 칩은 반대로 "용도만 빼고 나머지 조건을 다 적용한" 뒤에 세야 한다.
    // 그래야 "지분거래 제외" 상태에서 "근린생활시설 412"를 눌렀을 때 실제로
    // 412건이 나온다 — 앞서(가격·지분거래 반영 전) 세면 칩 숫자와 결과가 어긋난다.
    const useTypeFacets = buildFacets(items).use_types
    // 범위가 잘린 조회(전국/시도 최신 N건)에서는 종목별 건수가 실제보다 작게
    // 나온다 — 전국 최신 3,000건 안의 상가 51건은 실제 3,616건과 다르다. 화면이
    // 이 숫자를 확정치로 보여주지 않도록 근사 여부를 함께 알린다.
    const facets = { property: propertyFacets, use_types: useTypeFacets, approximate: truncated }
    if (useTypes.length) items = items.filter((it) => useTypes.includes(it.use_type))
    // 토지는 건축년도가 없어 build_year가 항상 0이다. 그대로 비교하면 "2000년 이후"가
    // 토지를 100% 걸러 0건을 만든다. 토지에 한해 준공연도 조건의 대상이 아니라고
    // 보고 남긴다 — 조건을 아예 못 걸게 하는 것보다 오해가 적다.
    // 상가(7.0%)·오피스텔(4.1%)도 build_year=0인 건이 있지만 이건 "연식 미상"이
    // 드문 예외라 같이 완화하면 "2020년 이후"에 1976년 건물이 섞이는 결과가 된다.
    // 그래서 완화는 토지에만 적용한다.
    if (buildYearMin) {
      items = items.filter((it) =>
        it.property_type === 'LAND' ? true : it.build_year >= buildYearMin
      )
    }

    const sorters = {
      recent: (a, b) => b.deal_date.localeCompare(a.deal_date),
      price_desc: (a, b) => b.price - a.price,
      price_asc: (a, b) => a.price - b.price,
      area_desc: (a, b) => b.area - a.area,
      pyeong_desc: (a, b) => b.price_per_pyeong - a.price_per_pyeong,
      pyeong_asc: (a, b) => a.price_per_pyeong - b.price_per_pyeong,
    }
    items = [...items].sort(sorters[sort] || sorters.recent)

    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const start = (page - 1) * limit

    return json({
      items: items.slice(start, start + limit),
      total,
      page,
      total_pages: totalPages,
      has_more: page < totalPages,
      source,
      is_live: isLive,
      last_update: index?.last_update || null,
      // 어느 범위를 검색한 결과인지. truncated면 해당 범위 최신 일부만 본 것.
      scope,
      scope_truncated: truncated,
      scope_size: pool.length,
      facets,
    })
  }

  // ── 공매 물건 목록 ──
  if (path === '/auctions') {
    const auctionIndex = await readAuctionIndex()
    const search = (q.get('q') || '').trim()
    const sido = q.get('sido') || ''
    const sggCodes = (q.get('sgg_code') || '').split(',').map((v) => v.trim()).filter(Boolean)
    // 용도 중분류명 다중 선택 (토지 / 주거용건물 / 상가·업무용 …)
    const useTypes = (q.get('use_type') || '').split(',').map((v) => v.trim()).filter(Boolean)
    // 용도 소분류명 다중 선택 (아파트 / 빌라 / 임야 / 근린생활시설 …).
    // 법원경매정보가 용도를 대·중·소 3단계로 받는 것과 같은 구조다 — "주거용건물"까지만으로는
    // "아파트만 보고 싶다"는 가장 흔한 요구를 만족시킬 수 없다.
    const useSubTypes = (q.get('use_scls') || '').split(',').map((v) => v.trim()).filter(Boolean)
    // 재산유형명 다중 선택 (압류재산 / 국유재산 …)
    const divisions = (q.get('division') || '').split(',').map((v) => v.trim()).filter(Boolean)
    const minPrice = Number(q.get('min_price') || 0)
    const maxPrice = Number(q.get('max_price') || Number.MAX_SAFE_INTEGER)
    // 감정평가액 범위. 최저입찰가와 별개 조건이다 — 법원경매정보도 둘을 따로 받는다.
    const minAppraisal = Number(q.get('min_appraisal') || 0)
    const maxAppraisal = Number(q.get('max_appraisal') || Number.MAX_SAFE_INTEGER)
    // 면적 범위 (㎡). 토지 물건은 land_area만, 건물 물건은 area만 차 있어 대표면적으로 비교한다.
    const minArea = Number(q.get('min_area') || 0)
    const maxArea = Number(q.get('max_area') || Number.MAX_SAFE_INTEGER)
    // 감정가 대비 체감률 상한(%). "감정가의 70% 이하"처럼 싸진 물건을 찾는 조건이다.
    const maxDiscount = Number(q.get('max_discount') || 0)
    const minFailCount = Number(q.get('min_fail') || 0)
    const privateOnly = q.get('private_contract') === '1'
    // 기본은 아직 입찰할 수 있는 물건만. 끝난 물건은 이력 조회용이라 명시해야 나온다.
    const status = q.get('status') || 'ACTIVE'
    const deadlineDays = Number(q.get('deadline_days') || 0)
    const sort = q.get('sort') || 'deadline'
    const page = Math.max(1, Number(q.get('page') || 1))
    const limit = Math.min(100, Math.max(1, Number(q.get('limit') || 20)))

    const { items: pool, scope, isLive, source, truncated } = await loadAuctionScope(
      { sggCodes, sido, deadlineOnly: deadlineDays > 0 },
      auctionIndex
    )

    let items = pool
    if (search) items = items.filter((it) => auctionMatchesQuery(it, search.split(/\s+/)))

    // 용도·재산유형 칩 숫자는 그 조건을 빼고 센다. 걸고 나서 세면 고른 것만
    // 카운트가 남고 나머지가 0이 되어(자기참조) 칩이 무의미해진다.
    const countBy = (list, key) => {
      const m = new Map()
      for (const it of list) if (it[key]) m.set(it[key], (m.get(it[key]) || 0) + 1)
      return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
    }
    // 소분류 칩은 중분류를 고른 뒤에야 의미가 있다(전체를 늘어놓으면 40개가 넘는다).
    // 그래서 중분류가 걸린 목록에서 센다 — 이러면 "주거용건물"을 누른 뒤 나오는
    // 소분류 칩이 실제로 그 안의 아파트·빌라·단독주택 건수가 된다.
    const scopedForScls = useTypes.length
      ? items.filter((it) => useTypes.includes(it.use_mcls))
      : items
    const facets = {
      use_types: countBy(items, 'use_mcls'),
      use_sub_types: countBy(scopedForScls, 'use_scls').slice(0, 20),
      divisions: countBy(items, 'prpt_div'),
      approximate: truncated,
    }

    // 시군구 샤드의 status는 그 샤드를 마지막으로 쓴 시점의 값이라, 그 뒤 입찰이
    // 끝난 물건은 OPEN으로 남아 있을 수 있다. 마감은 bid_end_at으로 계산되는
    // 값이므로 여기서 최신화한 뒤 거른다(auctionStorage.effectiveStatus 참고).
    const nowIso = new Date().toISOString()
    items = withEffectiveStatus(items, nowIso)

    if (status === 'ACTIVE') items = items.filter((it) => it.status !== 'CLOSED')
    else if (status !== 'ALL') items = items.filter((it) => it.status === status)

    if (useTypes.length) items = items.filter((it) => useTypes.includes(it.use_mcls))
    if (useSubTypes.length) items = items.filter((it) => useSubTypes.includes(it.use_scls))
    if (divisions.length) items = items.filter((it) => divisions.includes(it.prpt_div))
    if (minAppraisal > 0 || maxAppraisal < Number.MAX_SAFE_INTEGER) {
      items = items.filter((it) => it.appraisal_price >= minAppraisal && it.appraisal_price <= maxAppraisal)
    }
    if (minArea > 0 || maxArea < Number.MAX_SAFE_INTEGER) {
      // 대표면적: 건물면적이 있으면 그것을, 없으면 토지면적을 쓴다(AuctionItem.primaryArea와 같은 규칙).
      items = items.filter((it) => {
        const a = it.area > 0 ? it.area : it.land_area
        return a >= minArea && a <= maxArea
      })
    }
    // 최저입찰가가 비공개인 물건(min_bid_price=0)은 가격 조건을 걸면 전부 걸러진다.
    // 0원 물건이 아니라 "값을 모르는" 물건이므로 조건을 건 사용자에게는 감추는 게 맞다.
    if (minPrice > 0 || maxPrice < Number.MAX_SAFE_INTEGER) {
      items = items.filter((it) => it.min_bid_price >= minPrice && it.min_bid_price <= maxPrice)
    }
    if (maxDiscount > 0) {
      items = items.filter((it) => typeof it.discount_rate === 'number' && it.discount_rate <= maxDiscount)
    }
    if (minFailCount > 0) items = items.filter((it) => it.fail_count >= minFailCount)
    if (privateOnly) items = items.filter((it) => it.private_contract)
    if (deadlineDays > 0) {
      const until = new Date(Date.now() + deadlineDays * 86_400_000).toISOString()
      const now = new Date().toISOString()
      items = items.filter((it) => it.bid_end_at && it.bid_end_at > now && it.bid_end_at <= until)
    }

    // 마감임박이 기본 정렬이다. 공매는 "언제까지 넣을 수 있는가"가 가장 급한 정보라
    // 실거래의 최신순과 달리 시간이 오름차순이어야 한다.
    const far = '9999'
    // 최저가 비공개 물건은 min_bid_price가 0으로 저장된다. 그대로 정렬하면
    // "가격을 모르는" 물건이 가장 싼 물건인 척 목록 맨 위를 차지한다.
    // 가격 정렬에서는 방향과 무관하게 항상 뒤로 민다.
    const byPrice = (dir) => (a, b) => {
      if (a.min_bid_undisclosed !== b.min_bid_undisclosed) return a.min_bid_undisclosed ? 1 : -1
      return dir * (a.min_bid_price - b.min_bid_price)
    }
    const sorters = {
      deadline: (a, b) => (a.bid_end_at || far).localeCompare(b.bid_end_at || far),
      price_asc: byPrice(1),
      price_desc: byPrice(-1),
      discount_asc: (a, b) => (a.discount_rate ?? 999) - (b.discount_rate ?? 999),
      fail_desc: (a, b) => b.fail_count - a.fail_count,
      appraisal_desc: (a, b) => b.appraisal_price - a.appraisal_price,
      area_desc: (a, b) => (b.area || b.land_area) - (a.area || a.land_area),
    }
    items = [...items].sort(sorters[sort] || sorters.deadline)

    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const start = (page - 1) * limit

    return json({
      items: items.slice(start, start + limit),
      total,
      page,
      total_pages: totalPages,
      has_more: page < totalPages,
      source,
      is_live: isLive,
      last_update: auctionIndex?.last_update || null,
      scope,
      scope_truncated: truncated,
      scope_size: pool.length,
      facets,
    })
  }

  // ── 공매 지역 집계 ──
  if (path === '/auctions/stats') {
    const auctionIndex = await readAuctionIndex()
    const sido = q.get('sido') || ''
    // 요약 카드는 한 지역 기준이라, 시군구를 여러 개 골랐으면 첫 번째만 쓴다.
    const sggCode = (q.get('sgg_code') || '').split(',')[0].trim()

    if (!auctionIndex) {
      const sample = generateAuctions()
      return json({
        ...computeAuctionStats(sample),
        source: 'mock',
        is_live: false,
        last_update: null,
        message: '샘플 데이터입니다. ONBID_API_KEY를 설정하고 수집하면 실제 공매 물건으로 바뀝니다.',
      })
    }

    // 시군구를 고르면 사전 계산값 대신 그 샤드에서 직접 다시 센다.
    //
    // 인덱스의 sgg 집계는 **수집 시점의 status**로 계산돼 있어, 시간이 지나면
    // 마감된 물건이 여전히 "진행 중"으로 잡힌다. 실측(수집 4일 경과): 강남구
    // open 489 vs 실제 480, 해운대구는 median_discount_rate가 60%로 나오지만
    // 실제로는 52%였다. 체감률은 이 서비스의 핵심 지표라 10%p 오차를 둘 수 없다.
    //
    // 시군구 샤드는 잘리지 않아 그 지역 전체가 들어 있으므로 재계산이 정확하다.
    // (시도는 샤드가 3,000건으로 잘려 있어 재계산이 오히려 틀리므로 사전 계산값을 쓴다.)
    let recomputed = null
    if (sggCode) {
      const shard = await readAuctionShard(`auction/sgg/${sggCode}.json`)
      if (shard?.items?.length) {
        const fresh = withEffectiveStatus(shard.items)
        recomputed = { ...(auctionIndex.sgg?.[sggCode] || {}), ...computeAuctionStats(fresh) }
      }
    }

    const pre = recomputed || (sggCode ? auctionIndex.sgg?.[sggCode] : sido ? auctionIndex.sido?.[sido] : null)

    // 지역을 골랐는데 그 지역 집계가 없으면(물건이 0건인 시도 등) 전국 수치로
    // 폴백하면 안 된다. "전남 69,313건"처럼 명백히 틀린 숫자가 요약 카드에 찍힌다.
    // 실제로 그랬다 — 0을 정직하게 돌려주는 편이 낫다.
    if (!pre && (sggCode || sido)) {
      return json({
        count: 0,
        open_count: 0,
        closed_count: 0,
        source: auctionIndex.source,
        is_live: true,
        last_update: auctionIndex.last_update || null,
      })
    }

    // 지역 미지정이면 전국 집계. 예전 인덱스에는 overall이 없어 건수만 되돌린다.
    const base = pre ||
      auctionIndex.overall || {
        count: auctionIndex.total_items || 0,
        open_count: auctionIndex.open_items || 0,
        closed_count: (auctionIndex.total_items || 0) - (auctionIndex.open_items || 0),
      }

    // 재산유형·용도 집계는 인덱스에 전국 값만 있다. 지역을 골랐는데 전국 값을
    // 그대로 붙이면 "서울 5,726건"이라고 해놓고 그 아래에 전국 70,138건 분포를
    // 보여주는 꼴이 된다. 지역을 고른 경우엔 아예 내보내지 않는다 —
    // 틀린 숫자보다 없는 편이 낫고, 화면도 이 값을 쓰지 않는다.
    const scoped = Boolean(sggCode || sido)
    return json({
      ...base,
      division_totals: scoped ? undefined : auctionIndex.division_totals || {},
      use_totals: scoped ? undefined : auctionIndex.use_totals || {},
      source: auctionIndex.source,
      is_live: true,
      last_update: auctionIndex.last_update || null,
    })
  }

  // ── 공매 물건 1건 ──
  // 라우트 순서가 중요하다: /auctions/stats 를 먼저 처리해야 id로 잡히지 않는다.
  if (path.startsWith('/auctions/')) {
    const id = decodeURIComponent(path.slice('/auctions/'.length))
    const auctionIndex = await readAuctionIndex()
    if (!auctionIndex) {
      const hit = generateAuctions().find((it) => it.id === id)
      return hit
        ? json({ item: hit, source: 'mock', is_live: false, last_update: null })
        : json({ detail: '물건을 찾을 수 없습니다.' }, 404)
    }
    // id는 "물건관리번호-공매조건번호"라 지역 정보가 없다. 시군구 샤드를 다 뒤지면
    // 비싸므로 전국/마감임박 샤드를 먼저 보고, 없으면 시군구 샤드를 순회한다.
    for (const key of ['auction/recent.json', 'auction/deadline.json']) {
      const shard = await readAuctionShard(key)
      const hit = shard?.items?.find((it) => it.id === id)
      if (hit)
        return json({
          item: { ...hit, status: effectiveStatus(hit) },
          source: auctionIndex.source,
          is_live: true,
          last_update: auctionIndex.last_update,
        })
    }
    for (const code of Object.keys(auctionIndex.sgg || {})) {
      const shard = await readAuctionShard(`auction/sgg/${code}.json`)
      const hit = shard?.items?.find((it) => it.id === id)
      if (hit)
        return json({
          item: { ...hit, status: effectiveStatus(hit) },
          source: auctionIndex.source,
          is_live: true,
          last_update: auctionIndex.last_update,
        })
    }
    return json({ detail: '물건을 찾을 수 없습니다.' }, 404)
  }

  if (path === '/stats') {
    const sido = q.get('sido') || ''
    const sggCode = q.get('sgg_code') || ''
    const search = (q.get('q') || '').trim()
    // 화면이 종목을 좁혔으면 요약도 그 종목만 봐야 한다. 아파트·상가·토지는
    // 평당가 스케일이 달라서, 섞인 중위값을 "토지 시세"라고 보여주면 틀린 숫자가 된다.
    const propertyType = q.get('property_type') || 'ALL'
    // 프론트는 이미 이 값을 보냈지만(services/tradeApi.ts) 예전엔 서버가 받지 않아
    // "전월세 18,572건"처럼 매매 숫자에 전월세 라벨만 붙는 채로 나갔다.
    const dealType = q.get('deal_type') || 'ALL'

    // 사전 계산치(per_property)는 매매 기준으로만 만들어 두었다. 전월세를
    // 고른 경우엔 여기서 답할 수 없어 아래 직접 계산 경로로 내려간다.
    // 종목을 좁힌 경우에도 사전 계산치에 그 종목 통계가 있으면 그대로 쓴다.
    // 샤드에서 다시 계산하면 시도 샤드가 최신 4,000건뿐이라 건수가 실제의 1~2%로
    // 쪼그라든 값이 요약 카드에 찍힌다.
    if (index && !search && propertyType !== 'ALL' && dealType === 'ALL') {
      const pre = sggCode ? index.sgg?.[sggCode] : sido ? index.sido?.[sido] : null
      const own = pre?.per_property?.[propertyType]
      if (own && own.count > 0 && own.median_price !== undefined) {
        return json({
          ...own,
          per_property: { [propertyType]: own },
          source: index.source,
          is_live: true,
          last_update: index.last_update,
        })
      }
      if (!sggCode && !sido) {
        // 전국은 시도별 종목 통계를 건수 가중으로 합친 근사치.
        const all = Object.values(index.sido || {})
          .map((s) => s.per_property?.[propertyType])
          .filter((v) => v && v.count > 0 && v.median_price !== undefined)
        if (all.length > 0) {
          const count = all.reduce((a, s) => a + s.count, 0)
          const unitCount = all.reduce((a, s) => a + (s.unit_price_count || 0), 0)
          const merged = {
            count,
            median_price: Math.round(all.reduce((a, s) => a + s.median_price * s.count, 0) / count),
            avg_price: Math.round(all.reduce((a, s) => a + s.avg_price * s.count, 0) / count),
            min_price: Math.min(...all.map((s) => s.min_price)),
            max_price: Math.max(...all.map((s) => s.max_price)),
            median_per_pyeong: unitCount
              ? Math.round(
                  all.reduce((a, s) => a + s.median_per_pyeong * (s.unit_price_count || 0), 0) / unitCount
                )
              : 0,
            unit_price_count: unitCount,
            trend: mergeTrends(all),
            approximate: true,
          }
          return json({
            ...merged,
            per_property: { [propertyType]: merged },
            source: index.source,
            is_live: true,
            last_update: index.last_update,
          })
        }
      }
    }
    if (index && !search && propertyType === 'ALL' && dealType === 'ALL') {
      const pre = sggCode ? index.sgg?.[sggCode] : sido ? index.sido?.[sido] : null
      if (pre) {
        return json({ ...pre, source: index.source, is_live: true, last_update: index.last_update })
      }
      if (!sggCode && !sido) {
        // 전국 통계는 시도별 사전 계산치를 합산해 근사한다.
        const all = Object.values(index.sido || {}).filter((s) => s.count > 0)
        if (all.length > 0) {
          const count = all.reduce((a, s) => a + s.count, 0)
          // 평당가는 지분 거래·면적 0인 건을 뺀 더 작은 모집단에서 나온 값이라
          // count(전체 매매 건수)로 가중하면 지역별 비중이 어긋난다.
          // 그 모집단 크기(unit_price_count)로 가중한다. 예전 인덱스에는 없을 수 있어
          // 없으면 count로 되돌아간다.
          const unitWeight = (s) => s.unit_price_count ?? s.count
          const unitCount = all.reduce((a, s) => a + (s.median_per_pyeong > 0 ? unitWeight(s) : 0), 0)
          return json({
            count,
            median_price: Math.round(all.reduce((a, s) => a + s.median_price * s.count, 0) / count),
            avg_price: Math.round(all.reduce((a, s) => a + s.avg_price * s.count, 0) / count),
            min_price: Math.min(...all.map((s) => s.min_price)),
            max_price: Math.max(...all.map((s) => s.max_price)),
            median_per_pyeong: unitCount
              ? Math.round(
                  all.reduce(
                    (a, s) => a + (s.median_per_pyeong > 0 ? s.median_per_pyeong * unitWeight(s) : 0),
                    0
                  ) / unitCount
                )
              : 0,
            per_property: mergePerProperty(all),
            trend: mergeTrends(all),
            approximate: true,
            source: index.source,
            is_live: true,
            last_update: index.last_update,
          })
        }
      }
    }

    // 검색어가 있거나 종목을 좁혔으면 해당 범위 샤드를 읽어 직접 계산
    const { items: pool, isLive, source, scope, truncated } = await loadScope(
      { sggCode, sido, propertyType: propertyType === 'ALL' ? '' : propertyType },
      index
    )
    let filtered = search ? pool.filter((it) => matchesQuery(it, search.split(/\s+/))) : pool
    if (propertyType !== 'ALL') filtered = filtered.filter((it) => it.property_type === propertyType)
    const stats = computeStats(filtered, dealType === 'ALL' ? 'TRADE' : dealType)
    if (stats.count === 0) {
      return json({
        count: 0,
        source,
        is_live: isLive,
        last_update: index?.last_update || null,
        scope,
        scope_truncated: truncated,
        scope_size: pool.length,
      })
    }
    return json({
      ...stats,
      source,
      is_live: isLive,
      last_update: index?.last_update || null,
      scope,
      // 이 통계가 전체가 아니라 "최신 N건" 표본에서 나온 것인지. 화면이 밝혀야 한다.
      scope_truncated: truncated,
      scope_size: pool.length,
    })
  }

  const complexMatch = path.match(/^\/complex\/(.+)$/)
  if (complexMatch) {
    const name = decodeURIComponent(complexMatch[1])
    let history = []
    let source = 'mock'
    let isLive = false

    if (index) {
      // 단지명 → 시군구코드 색인으로 해당 샤드만 읽는다.
      const complexIndex = (await readShard('complex-index.json')) || {}
      const codes = complexIndex[name] || []
      for (const code of codes.slice(0, 3)) {
        const shard = await readShard(`sgg/${code}.json`)
        if (shard?.items) history.push(...shard.items.filter((it) => it.name === name))
      }
      // 단지 인덱스는 아파트·오피스텔만 담지만, 이름이 겹쳐 상가·토지 거래가
      // 섞여 들어올 수 있다. 필지 단위 거래를 "단지 이력"으로 묶으면 서로 다른
      // 땅의 가격이 한 그래프에 겹치므로 여기서도 한 번 더 거른다.
      history = history.filter((it) => COMPLEX_TYPES.includes(it.property_type))
      source = index.source
      isLive = true
    } else {
      history = generateTrades().filter((it) => it.name === name)
    }

    if (history.length === 0) {
      return json(
        {
          detail: `'${name}' 단지 거래 내역을 찾을 수 없습니다.`,
          // 상가·토지는 단지가 아니라 필지 단위라 단지 상세 화면이 없다.
          hint: '상가·토지는 단지 개념이 없어 단지 상세를 제공하지 않습니다. 검색 목록에서 개별 거래를 확인하세요.',
        },
        404
      )
    }
    history.sort((a, b) => b.deal_date.localeCompare(a.deal_date))

    const stats = computeStats(history)
    const head = history[0]
    return json({
      name: head.name,
      region_name: head.region_name,
      address: head.address,
      property_type: head.property_type,
      build_year: head.build_year,
      trade_count: stats.count || 0,
      median_price: stats.median_price || 0,
      median_per_pyeong: stats.median_per_pyeong || 0,
      latest_deal_date: head.deal_date,
      history: history.slice(0, 50),
      source,
      is_live: isLive,
      last_update: index?.last_update || null,
    })
  }

  if (path === '/regions/stats') {
    // 지도 타일 히트맵용 배치 집계. index.sido/index.sgg에 이미 계산돼 있는
    // 값을 그대로 모아 반환하므로 샤드를 읽지 않는다(개별 /stats 호출 N회를 1회로 대체).
    const level = q.get('level') || 'sido'
    if (!index) return json({ regions: [] })

    if (level === 'sgg') {
      const sido = q.get('sido') || ''
      const def = REGIONS.find((r) => r.sido === sido)
      if (!def) return json({ regions: [] })
      const regions = def.sggs
        .map(([code, name]) => {
          const s = index.sgg?.[code]
          if (!s) return null // 수집된 데이터가 없는 시군구 — 화면에서 "집계 준비 중"으로 처리
          return {
            code,
            name,
            count: s.count || 0,
            median_price: s.median_price || 0,
            median_per_pyeong: s.median_per_pyeong || 0,
          }
        })
        .filter(Boolean)
      return json({ regions })
    }

    // level === 'sido' (기본값): 전국 시도 전체
    const regions = REGIONS.map((r) => {
      const s = index.sido?.[r.sido]
      if (!s) return null
      return {
        code: r.sido,
        name: r.sido,
        count: s.count || 0,
        median_price: s.median_price || 0,
        median_per_pyeong: s.median_per_pyeong || 0,
      }
    }).filter(Boolean)
    return json({ regions })
  }

  if (path === '/regions') {
    // 실제 데이터가 있는 지역만 노출해, 결과가 0건인 지역을 고르게 하지 않는다.
    const available = index ? new Set(Object.keys(index.sgg || {})) : null
    const regions = REGIONS.map((r) => ({
      sido: r.sido,
      sggs: r.sggs
        .filter(([code]) => !available || available.has(code))
        .map(([code, name]) => ({ code, name, count: index?.sgg?.[code]?.total ?? null })),
    })).filter((r) => r.sggs.length > 0)

    return json({ regions, total_sgg: available ? available.size : ALL_SGG.length })
  }

  return json({ detail: 'Not Found' }, 404)
}

/**
 * 여러 지역의 종목별 평당가를 건수 가중으로 합친다.
 * 지역별 중위값의 가중평균이라 전국 중위값의 근사치다(approximate 플래그로 표시).
 */
function mergePerProperty(statsList) {
  const acc = new Map()
  for (const s of statsList) {
    for (const [type, v] of Object.entries(s.per_property || {})) {
      if (!v.count || !v.median_per_pyeong) continue
      if (!acc.has(type)) acc.set(type, { sum: 0, count: 0 })
      const e = acc.get(type)
      e.sum += v.median_per_pyeong * v.count
      e.count += v.count
    }
  }
  return Object.fromEntries(
    [...acc.entries()].map(([type, e]) => [
      type,
      { count: e.count, median_per_pyeong: Math.round(e.sum / e.count) },
    ])
  )
}

/** 여러 지역의 월별 추이를 건수 가중으로 합친다. */
function mergeTrends(statsList) {
  const byMonth = new Map()
  for (const s of statsList) {
    for (const t of s.trend || []) {
      if (!byMonth.has(t.month)) byMonth.set(t.month, { sum: 0, count: 0 })
      const e = byMonth.get(t.month)
      e.sum += t.median_per_pyeong * t.count
      e.count += t.count
    }
  }
  return [...byMonth.entries()]
    .map(([month, e]) => ({
      month,
      count: e.count,
      median_per_pyeong: e.count ? Math.round(e.sum / e.count) : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export const config = {
  path: '/api/*',
}
