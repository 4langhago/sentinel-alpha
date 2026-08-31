// 온비드 공매 물건 수집 — Netlify Scheduled Function
//
// 실거래(refresh-trades)와 별도 함수·별도 스토어다. 공매는 입찰 시작·종료가
// 일 단위로 움직여 하루 1회로는 마감 정보가 늦고, 반대로 공고는 주 단위로
// 등록되므로 시간 단위까지는 과하다 — 하루 2회(KST 08:00 / 18:00)로 둔다.
import { getStore } from '@netlify/blobs'
import { collectAuctions } from './lib/collectAuctions.mjs'
import { mergeAuctionsWithStored, writeAuctionShardsToStore } from './lib/auctionStorage.mjs'

export default async () => {
  const serviceKey = process.env.ONBID_API_KEY || ''
  if (!serviceKey) {
    console.warn('[refresh-auctions] ONBID_API_KEY 미설정 — 수집을 건너뜁니다.')
    return new Response(JSON.stringify({ ok: false, reason: 'ONBID_API_KEY not set' }), { status: 200 })
  }

  console.log('[refresh-auctions] 수집 시작...')
  const { payload, seenIds, seenAt, errors, fatal } = await collectAuctions({
    serviceKey,
    onProgress: (m) => console.log('[refresh-auctions]', m),
  })

  if (fatal) {
    // 키·활용신청·한도 문제. 재시도해도 소용없고, 이 결과로 덮어쓰면 화면이 비어버린다.
    console.error('[refresh-auctions] 치명적 오류로 중단:', fatal)
    return new Response(JSON.stringify({ ok: false, fatal }), { status: 200 })
  }

  if (payload.items.length === 0) {
    console.error('[refresh-auctions] 수집 0건 — 기존 데이터를 유지합니다.', errors.slice(0, 3))
    return new Response(JSON.stringify({ ok: false, errors: errors.slice(0, 5) }), { status: 200 })
  }

  // 이번에 안 보인 물건은 지우지 않고 CLOSED로 남긴다(mergeAuctionsWithStored 안에서 처리).
  const finalPayload = await mergeAuctionsWithStored(payload, seenIds, seenAt, (m) =>
    console.log('[refresh-auctions]', m)
  )
  if (!finalPayload) {
    console.error('[refresh-auctions] 기존 데이터 확인 실패로 저장을 건너뜁니다. 다음 실행에서 재시도됩니다.')
    return new Response(JSON.stringify({ ok: false, reason: 'merge_check_failed' }), { status: 200 })
  }

  const count = await writeAuctionShardsToStore(getStore('auctions'), finalPayload)
  console.log(
    `[refresh-auctions] 샤드 ${count}개 저장 완료 — ${payload.stats.collected}건 수집 ` +
      `(호출 ${payload.stats.calls}회, 실패 ${payload.stats.errors}건, ${payload.stats.elapsed_sec}초)`
  )
  if (errors.length) console.warn('[refresh-auctions] 실패 예시:', errors.slice(0, 3))

  return new Response(JSON.stringify({ ok: true, ...payload.stats }), { status: 200 })
}

export const config = {
  // Netlify 스케줄은 UTC 기준. KST 08:00 = UTC 23:00, KST 18:00 = UTC 09:00
  schedule: '0 23,9 * * *',
}
