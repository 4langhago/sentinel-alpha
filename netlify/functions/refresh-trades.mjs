// 실거래가 일일 수집 — Netlify Scheduled Function
// 매일 WIB(인도네시아) 07:30 = KST 09:30에 실행되어 최근 3개월 실거래를 모아
// Netlify Blobs("trades" store)에 조회용 샤드로 저장한다.
import { getStore } from '@netlify/blobs'
import { collectTrades } from './lib/collect.mjs'
import { mergeWithStored, writeShardsToStore } from './lib/storage.mjs'

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

  // 하루 호출 예산은 전국 계획보다 작아 한 번에 전국을 다 돌지 못한다.
  // 이번 수집분만으로 샤드를 다시 만들면 밀려난 시군구가 사라지므로 반드시 병합한다.
  const finalPayload = await mergeWithStored(payload, (m) => console.log('[refresh-trades]', m))
  if (!finalPayload) {
    // 기존 데이터를 온전히 읽지 못했다 — 저장을 건너뛴다. 이번 수집분은 버려지지만
    // 그보다 훨씬 큰 기존 데이터를 지우는 사고를 피한다. 다음 스케줄 실행에서 재시도된다.
    console.error('[refresh-trades] 기존 데이터 확인 실패로 저장을 건너뜁니다. 다음 실행에서 재시도됩니다.')
    return new Response(JSON.stringify({ ok: false, reason: 'merge_check_failed' }), { status: 200 })
  }

  const count = await writeShardsToStore(getStore('trades'), finalPayload)
  console.log(`[refresh-trades] 샤드 ${count}개 저장 완료`)

  console.log(
    `[refresh-trades] 완료: ${payload.stats.deduped}건 저장 ` +
      `(호출 ${payload.stats.calls}회, 실패 ${payload.stats.errors}건, ${payload.stats.elapsed_sec}초)`
  )
  if (errors.length) console.warn('[refresh-trades] 실패 예시:', errors.slice(0, 3))

  return new Response(JSON.stringify({ ok: true, ...payload.stats }), { status: 200 })
}

export const config = {
  // Netlify 스케줄은 UTC 기준.
  // WIB(인도네시아 서부, UTC+7) 07:30 = UTC 00:30 = KST 09:30
  schedule: '30 0 * * *',
}
