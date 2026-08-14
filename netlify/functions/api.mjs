// 부동산 시세·실거래 API — Netlify Functions
//
// 데이터는 lib/storage.mjs가 만든 샤드에서 읽는다. 조회 조건에 필요한 샤드만
// 읽으므로 전체(49MB)를 파싱하지 않는다. 샤드가 없으면 샘플로 폴백하며,
// 응답의 source/is_live로 항상 실데이터 여부를 알린다.
import { generateTrades } from './lib/mockTrades.mjs'
import { ALL_SGG, REGIONS } from './lib/regionCodes.mjs'
import { readIndex, readShard, computeStats } from './lib/storage.mjs'

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
 */
async function loadScope({ sggCode, sido }, index) {
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
    const sort = q.get('sort') || 'recent'
    const page = Math.max(1, Number(q.get('page') || 1))
    const limit = Math.min(100, Math.max(1, Number(q.get('limit') || 20)))

    const { items: pool, scope, isLive, source, truncated } = await loadScope({ sggCode, sido }, index)

    let items = pool
    if (search) items = items.filter((it) => matchesQuery(it, search.split(/\s+/)))
    if (propertyType !== 'ALL') items = items.filter((it) => it.property_type === propertyType)
    if (dealType !== 'ALL') items = items.filter((it) => it.deal_type === dealType)
    items = items.filter((it) => it.price >= minPrice && it.price <= maxPrice)
    items = items.filter((it) => it.area >= minArea && it.area <= maxArea)
    if (buildYearMin) items = items.filter((it) => it.build_year >= buildYearMin)

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
    })
  }

  if (path === '/stats') {
    const sido = q.get('sido') || ''
    const sggCode = q.get('sgg_code') || ''
    const search = (q.get('q') || '').trim()

    // 검색어가 없으면 미리 계산해 둔 통계를 그대로 준다 (샤드를 읽지 않음)
    if (index && !search) {
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

    // 검색어가 있으면 해당 범위 샤드를 읽어 직접 계산
    const { items: pool, isLive, source, scope } = await loadScope({ sggCode, sido }, index)
    const filtered = search ? pool.filter((it) => matchesQuery(it, search.split(/\s+/))) : pool
    const stats = computeStats(filtered)
    if (stats.count === 0) {
      return json({ count: 0, source, is_live: isLive, last_update: index?.last_update || null, scope })
    }
    return json({ ...stats, source, is_live: isLive, last_update: index?.last_update || null, scope })
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
      source = index.source
      isLive = true
    } else {
      history = generateTrades().filter((it) => it.name === name)
    }

    if (history.length === 0) return json({ detail: `'${name}' 거래 내역을 찾을 수 없습니다.` }, 404)
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
