// 부동산 시세·실거래 API — Netlify Functions
// 데이터 소스: refresh-trades.mjs(스케줄 함수)가 Netlify Blobs에 저장한 국토부 실거래가.
// Blob이 없거나 7일 이상 오래되면 샘플 데이터로 폴백하며, 응답의 source로 항상 구분해 알린다.
import { getStore } from '@netlify/blobs'
import { generateTrades } from './lib/mockTrades.mjs'
import { ALL_SGG, REGIONS } from './lib/regionCodes.mjs'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })

const STALE_MS = 7 * 24 * 60 * 60 * 1000

const isUsable = (payload) =>
  payload &&
  Array.isArray(payload.items) &&
  payload.items.length > 0 &&
  Date.now() - new Date(payload.last_update).getTime() <= STALE_MS

// 배포 환경: 스케줄 함수가 저장한 Blobs 스냅샷
async function fromBlobs() {
  try {
    const payload = await getStore('trades').get('latest.json', { type: 'json' })
    return isUsable(payload) ? payload : null
  } catch {
    return null
  }
}

// 로컬 개발: scripts/collect-local.mjs 가 저장한 파일
// (Blobs 자격증명이 없는 환경에서도 실데이터로 화면을 확인할 수 있게 함)
async function fromLocalFile() {
  try {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const path = new URL('./data/latest.json', import.meta.url)
    const raw = await readFile(fileURLToPath(path), 'utf8')
    const payload = JSON.parse(raw)
    return isUsable(payload) ? payload : null
  } catch {
    return null
  }
}

// 수집된 스냅샷을 읽는다. 없거나 7일 이상 오래되면 null → 호출부에서 샘플로 폴백.
async function getSnapshot() {
  return (await fromBlobs()) || (await fromLocalFile())
}

// 스냅샷 또는 샘플 + 출처 메타데이터를 함께 반환
async function loadItems() {
  const snap = await getSnapshot()
  if (snap) {
    return { items: snap.items, source: snap.source || 'molit', last_update: snap.last_update, isLive: true }
  }
  return { items: generateTrades(), source: 'mock', last_update: null, isLive: false }
}

const median = (nums) => {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

// 검색어를 단지명 / 주소 / 지역명에 대해 AND 매칭
const matchesQuery = (item, keywords) =>
  keywords.every((k) => {
    const hay = `${item.name} ${item.address} ${item.region_name} ${item.umd}`
    return hay.includes(k)
  })

export default async (req) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, '') || '/'
  const q = url.searchParams

  if (path === '/health') {
    const snap = await getSnapshot()
    return json({
      status: 'ok',
      db: Boolean(snap),
      is_live: Boolean(snap),
      source: snap?.source || 'mock',
      last_update: snap?.last_update || null,
      total_items: snap?.items.length || 0,
      months: snap?.months || null,
      version: 'trades-1.0.0',
    })
  }

  // 실거래 목록 검색
  if (path === '/trades') {
    const { items: all, source, last_update, isLive } = await loadItems()

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

    let items = all
    if (search) items = items.filter((it) => matchesQuery(it, search.split(/\s+/)))
    if (sido) items = items.filter((it) => it.sido === sido)
    if (sggCode) items = items.filter((it) => it.sgg_code === sggCode)
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
      last_update,
    })
  }

  // 지역/단지 시세 통계
  if (path === '/stats') {
    const { items: all, source, last_update, isLive } = await loadItems()
    const sido = q.get('sido') || ''
    const sggCode = q.get('sgg_code') || ''
    const search = (q.get('q') || '').trim()

    let items = all.filter((it) => it.deal_type === 'TRADE')
    if (sido) items = items.filter((it) => it.sido === sido)
    if (sggCode) items = items.filter((it) => it.sgg_code === sggCode)
    if (search) items = items.filter((it) => matchesQuery(it, search.split(/\s+/)))

    if (items.length === 0) {
      return json({ count: 0, source, is_live: isLive, last_update, message: '조건에 맞는 거래가 없습니다.' })
    }

    const prices = items.map((it) => it.price)
    const perPyeong = items.map((it) => it.price_per_pyeong).filter((v) => v > 0)

    // 월별 중위 평당가 추이 (최신순 정렬된 데이터를 월로 묶음)
    const byMonth = new Map()
    for (const it of items) {
      const ym = it.deal_date.slice(0, 7)
      if (!byMonth.has(ym)) byMonth.set(ym, [])
      if (it.price_per_pyeong > 0) byMonth.get(ym).push(it.price_per_pyeong)
    }
    const trend = [...byMonth.entries()]
      .map(([month, vals]) => ({ month, count: vals.length, median_per_pyeong: median(vals) }))
      .sort((a, b) => a.month.localeCompare(b.month))

    return json({
      count: items.length,
      median_price: median(prices),
      avg_price: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      min_price: Math.min(...prices),
      max_price: Math.max(...prices),
      median_per_pyeong: median(perPyeong),
      trend,
      source,
      is_live: isLive,
      last_update,
    })
  }

  // 특정 단지 상세 (같은 이름 + 지역의 거래 이력)
  const complexMatch = path.match(/^\/complex\/(.+)$/)
  if (complexMatch) {
    const key = decodeURIComponent(complexMatch[1])
    const { items: all, source, last_update, isLive } = await loadItems()
    const history = all
      .filter((it) => it.name === key || it.id === key)
      .sort((a, b) => b.deal_date.localeCompare(a.deal_date))

    if (history.length === 0) return json({ detail: `'${key}' 거래 내역을 찾을 수 없습니다.` }, 404)

    const trades = history.filter((it) => it.deal_type === 'TRADE')
    const perPyeong = trades.map((it) => it.price_per_pyeong).filter((v) => v > 0)
    const head = history[0]

    return json({
      name: head.name,
      region_name: head.region_name,
      address: head.address,
      property_type: head.property_type,
      build_year: head.build_year,
      trade_count: trades.length,
      median_price: median(trades.map((it) => it.price)),
      median_per_pyeong: median(perPyeong),
      latest_deal_date: head.deal_date,
      history: history.slice(0, 50),
      source,
      is_live: isLive,
      last_update,
    })
  }

  if (path === '/regions') {
    return json({
      regions: REGIONS.map((r) => ({
        sido: r.sido,
        sggs: r.sggs.map(([code, name]) => ({ code, name })),
      })),
      total_sgg: ALL_SGG.length,
    })
  }

  return json({ detail: 'Not Found' }, 404)
}

export const config = {
  path: '/api/*',
}
