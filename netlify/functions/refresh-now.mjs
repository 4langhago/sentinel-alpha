// 수동 수집 트리거
// 배포 직후나 스케줄 사이에 즉시 데이터를 채우고 싶을 때 호출한다.
// 누구나 호출하면 API 일일 호출 한도를 소진시킬 수 있으므로 토큰으로 보호한다.
//
//   curl -X POST "https://<사이트>/trigger/refresh" -H "X-Refresh-Token: <REFRESH_TOKEN>"
//
// 옵션: ?months=1&max_calls=100&sido=서울  (테스트용으로 범위를 줄일 때)
import { getStore } from '@netlify/blobs'
import { collectTrades } from './lib/collect.mjs'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

export default async (req) => {
  if (req.method !== 'POST') return json({ detail: 'POST로 호출하세요.' }, 405)

  const expected = process.env.REFRESH_TOKEN || ''
  if (!expected) {
    return json({ detail: 'REFRESH_TOKEN 환경변수가 설정되지 않아 수동 트리거가 비활성 상태입니다.' }, 503)
  }
  const provided = req.headers.get('x-refresh-token') || ''
  if (provided !== expected) return json({ detail: '인증 실패' }, 401)

  const serviceKey = process.env.MOLIT_API_KEY || ''
  if (!serviceKey) return json({ detail: 'MOLIT_API_KEY가 설정되지 않았습니다.' }, 503)

  const url = new URL(req.url)
  const months = Math.min(12, Math.max(1, Number(url.searchParams.get('months') || 3)))
  const maxCalls = Math.min(1000, Math.max(1, Number(url.searchParams.get('max_calls') || 700)))
  const sidoParam = url.searchParams.get('sido')
  const sidoFilter = sidoParam ? sidoParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined

  const { payload, errors, fatal } = await collectTrades({
    serviceKey,
    months,
    maxCalls,
    sidoFilter,
    onProgress: (m) => console.log('[refresh-now]', m),
  })

  if (fatal) return json({ ok: false, fatal, errors: errors.slice(0, 5) }, 502)
  if (payload.items.length === 0) {
    return json({ ok: false, detail: '수집 0건 — 기존 데이터를 유지합니다.', errors: errors.slice(0, 5) }, 502)
  }

  await getStore('trades').setJSON('latest.json', payload)

  return json({
    ok: true,
    ...payload.stats,
    last_update: payload.last_update,
    months: payload.months,
    sample: payload.items.slice(0, 3),
    errors: errors.slice(0, 5),
  })
}

export const config = {
  // api.mjs가 '/api/*' 와일드카드를 쓰므로 경로 충돌을 피해 별도 접두어를 사용한다.
  path: '/trigger/refresh',
}
