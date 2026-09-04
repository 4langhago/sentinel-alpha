// 온비드 공매 물건 수집 — Netlify Scheduled Function
//
// 실거래(refresh-trades)와 별도 함수·별도 스토어다. 공매는 입찰 시작·종료가
// 일 단위로 움직여 하루 1회로는 마감 정보가 늦고, 반대로 공고는 주 단위로
// 등록되므로 시간 단위까지는 과하다 — 하루 2회(KST 08:00 / 18:00)로 둔다.
//
// 실제 수집 로직은 lib/refreshAuctions.mjs에 있다. 수동 트리거(refresh-now)와
// 같은 코드를 써야 한 쪽만 고쳐지는 일이 없다.
import { runAuctionRefresh } from './lib/refreshAuctions.mjs'

export default async () => {
  const serviceKey = process.env.ONBID_API_KEY || ''
  if (!serviceKey) {
    console.warn('[refresh-auctions] ONBID_API_KEY 미설정 — 수집을 건너뜁니다.')
    return new Response(JSON.stringify({ ok: false, reason: 'ONBID_API_KEY not set' }), { status: 200 })
  }

  const result = await runAuctionRefresh({
    serviceKey,
    log: (m) => console.log('[refresh-auctions]', m),
  })

  if (!result.ok) console.error('[refresh-auctions]', result.fatal || result.detail || result.reason)

  // 스케줄 함수는 실패해도 200을 돌려준다. 재시도는 다음 스케줄이 맡고,
  // 5xx를 내면 Netlify가 경보만 늘릴 뿐 복구에 도움이 되지 않는다.
  return new Response(JSON.stringify(result), { status: 200 })
}

export const config = {
  /**
   * 3시간마다 실행한다.
   *
   * 한 실행이 재산유형 하나만 처리하므로(함수 시간 제한 ~26초), 4종을 다 돌려면
   * 4번이 필요하다. 3시간 주기면 하루 8회 = 종류당 하루 2회로, 원래 의도했던
   * "하루 2회 갱신"이 그대로 유지된다.
   *
   * 호출 비용은 회당 1~4회, 하루 32회 남짓이라 개발계정 한도(1,000회/일)에
   * 크게 못 미친다.
   */
  schedule: '0 */3 * * *',
}
