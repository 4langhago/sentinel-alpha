// 수동 수집 트리거
// 배포 직후나 스케줄 사이에 즉시 데이터를 채우고 싶을 때 호출한다.
// 누구나 호출하면 API 일일 호출 한도를 소진시킬 수 있으므로 토큰으로 보호한다.
//
//   curl -X POST "https://<사이트>/trigger/refresh" -H "X-Refresh-Token: <REFRESH_TOKEN>"
//
// 옵션: ?months=1&max_calls=100&sido=서울  (테스트용으로 범위를 줄일 때)
//   ?reconcile=1  API를 호출하지 않고, 남아있는 시군구 샤드 파일을 전부 직접
//                 읽어 index.json을 다시 만든다. index가 과거 버그로 일부
//                 지역을 잃어버렸을 때 재수집 없이 복구하는 용도.
import { createHash, timingSafeEqual } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { collectTrades } from './lib/collect.mjs'
import { mergeWithStored, writeShardsToStore, reconcileFromShards, readShard } from './lib/storage.mjs'
import { ALL_SGG } from './lib/regionCodes.mjs'

/**
 * 길이 노출 없이 두 문자열을 상수 시간으로 비교한다.
 * 길이가 다르면 timingSafeEqual이 예외를 던지므로, 해시를 떠서 항상 같은 길이로 맞춘다.
 */
const timingSafeEqualStr = (a, b) => {
  const ha = createHash('sha256').update(String(a)).digest()
  const hb = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ha, hb)
}

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
  // 문자열 `!==` 는 첫 다른 바이트에서 즉시 끝나 비교 시간이 토큰과의 일치 길이에
  // 비례한다. 실무상 원격 공격은 어렵지만, 상수 시간 비교가 더 싸므로 그쪽을 쓴다.
  if (!timingSafeEqualStr(provided, expected)) return json({ detail: '인증 실패' }, 401)

  const url = new URL(req.url)

  // ?target=auctions 로 공매 수집도 같은 토큰 보호 아래 즉시 돌릴 수 있다.
  // 실거래와 스토어·예산이 완전히 분리돼 있어 서로 영향을 주지 않는다.
  if (url.searchParams.get('target') === 'auctions') {
    const onbidKey = process.env.ONBID_API_KEY || ''
    if (!onbidKey) return json({ detail: 'ONBID_API_KEY가 설정되지 않았습니다.' }, 503)

    const { collectAuctions } = await import('./lib/collectAuctions.mjs')
    const { mergeAuctionsWithStored, writeAuctionShardsToStore } = await import('./lib/auctionStorage.mjs')

    const maxCalls = Math.min(1000, Math.max(1, Number(url.searchParams.get('max_calls') || 400)))
    const { payload, seenIds, seenAt, errors, fatal } = await collectAuctions({
      serviceKey: onbidKey,
      maxCalls,
      onProgress: (m) => console.log('[refresh-now:auctions]', m),
    })

    if (fatal) return json({ ok: false, fatal, errors: errors.slice(0, 5) }, 502)
    if (payload.items.length === 0) {
      return json({ ok: false, detail: '수집 0건 — 기존 데이터를 유지합니다.', errors: errors.slice(0, 5) }, 502)
    }

    const finalPayload = await mergeAuctionsWithStored(payload, seenIds, seenAt, (m) =>
      console.log('[refresh-now:auctions]', m)
    )
    if (!finalPayload) {
      return json(
        { ok: false, reason: 'merge_check_failed', detail: '기존 공매 데이터를 온전히 읽지 못해 저장을 건너뛰었습니다.' },
        503
      )
    }
    const shards = await writeAuctionShardsToStore(getStore('auctions'), finalPayload)
    return json({ ok: true, target: 'auctions', shards, ...payload.stats, errors: errors.slice(0, 5) })
  }

  if (url.searchParams.get('reconcile') === '1') {
    const { items, found, missing } = await reconcileFromShards(ALL_SGG)
    if (items.length === 0) return json({ ok: false, detail: '복구할 샤드가 없습니다.' }, 404)
    // 복구는 "샤드 파일이 진실"이라는 전제로 index를 다시 쓰는 작업이라
    // 축소 가드(기존보다 줄면 거부)를 의도적으로 통과시킨다.
    const prevIdx = await readShard('index.json')
    const count = await writeShardsToStore(
      getStore('trades'),
      {
        items,
        last_update: new Date().toISOString(),
        source: prevIdx?.source || 'molit',
        months: prevIdx?.months || [],
        stats: { ...(prevIdx?.stats || {}), reconciled_at: new Date().toISOString() },
      },
      { force: true }
    )
    return json({ ok: true, reconciled: true, items: items.length, sgg_found: found.length, sgg_missing: missing, shards: count })
  }

  const serviceKey = process.env.MOLIT_API_KEY || ''
  if (!serviceKey) return json({ detail: 'MOLIT_API_KEY가 설정되지 않았습니다.' }, 503)

  const months = Math.min(12, Math.max(1, Number(url.searchParams.get('months') || 3)))
  const maxCalls = Math.min(1000, Math.max(1, Number(url.searchParams.get('max_calls') || 900)))
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

  // 범위를 좁혀 호출했을 때(?sido=서울 등) 나머지 지역이 index에서 사라지지 않도록
  // 기존 저장분과 병합한 뒤 저장한다.
  const finalPayload = await mergeWithStored(payload, (m) => console.log('[refresh-now]', m), ALL_SGG)
  if (!finalPayload) {
    // 기존 데이터를 온전히 읽지 못했다 — 이번 수집분을 버려서라도 기존 데이터를 지키지 않는다.
    // 여기서 그냥 저장했다면 방금 못 읽은 지역들이 index에서 통째로 사라졌을 것이다.
    return json(
      { ok: false, reason: 'merge_check_failed', detail: '기존 데이터를 온전히 읽지 못해 저장을 건너뛰었습니다. 다시 시도해주세요.' },
      503
    )
  }
  await writeShardsToStore(getStore('trades'), finalPayload)

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
