// 실거래가 일일 수집 — Netlify Scheduled Function
// 매일 KST 09:00에 실행되어 최근 3개월 실거래를 모아
// Netlify Blobs("trades" store, key "latest.json")에 저장한다.
import { getStore } from '@netlify/blobs'
import { collectTrades } from './lib/collect.mjs'
import { buildShards } from './lib/storage.mjs'

export default async () => {
  const serviceKey = process.env.MOLIT_API_KEY || ''
  if (!serviceKey) {
    console.warn('[refresh-trades] MOLIT_API_KEY 미설정 — 수집을 건너뜁니다.')
    return new Response(JSON.stringify({ ok: false, reason: 'MOLIT_API_KEY not set' }), { status: 200 })
  }

  console.log('[refresh-trades] 수집 시작...')
  const { payload, errors, fatal } = await collectTrades({
    serviceKey,
    onProgress: (m) => console.log('[refresh-trades]', m),
  })

  if (fatal) {
    // 키 문제 등 치명적 오류면 기존 데이터를 덮어쓰지 않는다.
    console.error('[refresh-trades] 치명적 오류로 중단:', fatal)
    return new Response(JSON.stringify({ ok: false, fatal }), { status: 200 })
  }

  if (payload.items.length === 0) {
    console.error('[refresh-trades] 수집 0건 — 기존 데이터를 유지합니다.', errors.slice(0, 3))
    return new Response(JSON.stringify({ ok: false, errors: errors.slice(0, 5) }), { status: 200 })
  }

  // 조회용 샤드로 쪼개 저장한다. index.json을 마지막에 써서,
  // 샤드가 다 올라가기 전의 index를 읽고 빈 결과를 내는 일이 없게 한다.
  const store = getStore('trades')
  const shards = buildShards(payload)
  const indexShard = shards.find((s) => s.key === 'index.json')
  for (const { key, value } of shards) {
    if (key === 'index.json') continue
    await store.setJSON(key, value)
  }
  await store.setJSON('index.json', indexShard.value)
  console.log(`[refresh-trades] 샤드 ${shards.length}개 저장 완료`)

  console.log(
    `[refresh-trades] 완료: ${payload.stats.deduped}건 저장 ` +
      `(호출 ${payload.stats.calls}회, 실패 ${payload.stats.errors}건, ${payload.stats.elapsed_sec}초)`
  )
  if (errors.length) console.warn('[refresh-trades] 실패 예시:', errors.slice(0, 3))

  return new Response(JSON.stringify({ ok: true, ...payload.stats }), { status: 200 })
}

export const config = {
  // Netlify 스케줄은 UTC 기준. KST 09:00 = UTC 00:00
  schedule: '0 0 * * *',
}
