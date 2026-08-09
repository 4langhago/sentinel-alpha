// 실거래가 일일 수집 — Netlify Scheduled Function
// 매일 UTC 22:00(KST 07:00)에 실행되어 최근 3개월 실거래를 모아
// Netlify Blobs("trades" store, key "latest.json")에 저장한다.
//
// 무료 한도 관리: data.go.kr 개발계정은 일 1,000회 호출 제한이 흔하므로
// 시군구 × 월 조합 수를 MAX_CALLS로 제한한다.
import { getStore } from '@netlify/blobs'
import { fetchTrades, recentMonths, SERVICES } from './lib/molit.mjs'
import { ALL_SGG } from './lib/regionCodes.mjs'

const SERVICE_KEY = process.env.MOLIT_API_KEY || ''
const MONTHS = 3
const MAX_CALLS = 700

// 호출 한도 안에서 우선 수집할 지역(수도권·광역시 중심). 나머지는 남는 예산으로 순회.
const PRIORITY_SIDO = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종']

const buildPlan = () => {
  const months = recentMonths(MONTHS)
  const priority = ALL_SGG.filter((s) => PRIORITY_SIDO.includes(s.sido))
  const rest = ALL_SGG.filter((s) => !PRIORITY_SIDO.includes(s.sido))
  const plan = []
  for (const sgg of [...priority, ...rest]) {
    for (const ym of months) {
      for (const svc of [SERVICES.APT_TRADE, SERVICES.APT_RENT, SERVICES.OFFI_TRADE]) {
        plan.push({ sgg, ym, svc })
      }
    }
  }
  return plan.slice(0, MAX_CALLS)
}

export default async () => {
  if (!SERVICE_KEY) {
    console.warn('[refresh-trades] MOLIT_API_KEY 미설정 — 수집을 건너뜁니다.')
    return new Response('MOLIT_API_KEY not set', { status: 200 })
  }

  const started = Date.now()
  const plan = buildPlan()
  const items = []
  const errors = []
  let calls = 0

  for (const { sgg, ym, svc } of plan) {
    try {
      const rows = await fetchTrades({
        serviceKey: SERVICE_KEY,
        service: svc,
        lawdCd: sgg.code,
        dealYmd: ym,
      })
      calls++
      for (const r of rows) {
        items.push({ ...r, sido: sgg.sido, sgg: sgg.sgg, region_name: sgg.name })
      }
    } catch (e) {
      errors.push(`${sgg.name}/${ym}/${svc.id}: ${e.message}`)
      // 서비스키 자체가 잘못됐다면 계속 호출해봐야 의미가 없다.
      if (/서비스키|SERVICE_KEY|등록되지/i.test(e.message)) {
        console.error('[refresh-trades] 서비스키 문제로 중단:', e.message)
        break
      }
    }
  }

  // id 기준 중복 제거 (같은 거래가 월 경계에서 중복 수집될 수 있음)
  const seen = new Set()
  const deduped = []
  for (const it of items) {
    if (seen.has(it.id)) continue
    seen.add(it.id)
    deduped.push(it)
  }
  deduped.sort((a, b) => b.deal_date.localeCompare(a.deal_date))

  const payload = {
    items: deduped,
    last_update: new Date().toISOString(),
    source: 'molit',
    months: recentMonths(MONTHS),
    stats: { calls, collected: items.length, deduped: deduped.length, errors: errors.length },
  }

  if (deduped.length === 0) {
    console.error('[refresh-trades] 수집 0건 — 기존 데이터를 유지합니다.', errors.slice(0, 3))
    return new Response(JSON.stringify({ ok: false, errors: errors.slice(0, 5) }), { status: 200 })
  }

  await getStore('trades').setJSON('latest.json', payload)

  const secs = Math.round((Date.now() - started) / 1000)
  console.log(
    `[refresh-trades] 완료: ${deduped.length}건 저장 (호출 ${calls}회, 실패 ${errors.length}건, ${secs}초)`
  )
  if (errors.length) console.warn('[refresh-trades] 실패 예시:', errors.slice(0, 3))

  return new Response(JSON.stringify({ ok: true, ...payload.stats }), { status: 200 })
}

export const config = {
  schedule: '0 22 * * *', // UTC 22:00 = KST 07:00
}
