// 온비드 공매 물건 수집기
//
// collect.mjs(실거래)의 공매 버전이지만 호출 계획의 성격이 다르다:
//   실거래는 "시군구 × 종목 × 월"을 순회해야 하지만,
//   공매는 재산유형(4개)만 지정하면 전국이 한 번에 나오고 페이지네이션만 하면 된다.
//   그래서 계획은 훨씬 단순하고, 대신 페이지 수가 많아 예산 관리가 중요하다.
//
// 예산: data.go.kr 개발계정은 서비스당 1,000회/일이다. 하루 2회 실행하므로
// 회당 400회를 상한으로 둔다(여유 200회는 수동 트리거·재시도용).
import { fetchAuctionPage } from './onbid.mjs'
import { PROPERTY_DIVISIONS } from './onbidCodes.mjs'

/**
 * 한 번의 수집이 쓸 수 있는 최대 API 호출 수.
 *
 * 전량(4개 재산유형 약 7만 건)은 500건 페이지로 140여 회면 끝난다. 400을 상한으로 두면
 * 매 실행이 전국을 다 훑고도 여유가 있고, 하루 2회 실행해도 개발계정 한도(1,000회/일)의
 * 3할이면 충분하다. 나머지는 수동 트리거·재시도 몫이다.
 */
export const DEFAULT_MAX_CALLS = 400
/**
 * 한 페이지당 건수.
 *
 * 실측(2026-08-31) 처리량: 200건/9.2초(22건/s), 500건/5.0초(100건/s), 1000건/14.7초(68건/s).
 * 500이 가장 빠르다 — 더 키우면 응답 본문이 커져(1000건=2.6MB) 오히려 느려지고
 * 타임아웃 위험도 올라간다. 전량(약 7만 건)이 140여 회 호출로 끝난다.
 */
const ROWS_PER_PAGE = 500

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 치명적 오류인지 판정한다.
 * 키/활용신청/한도 문제는 재시도해도 소용없고, 이때 수집 결과로 기존 데이터를
 * 덮어쓰면 화면이 통째로 비어버린다 — 호출자가 저장 자체를 건너뛰게 만들어야 한다.
 */
const isFatal = (msg) =>
  /등록되지 않은|SERVICE_KEY|활용기간|DEADLINE|SERVICE_ACCESS_DENIED|PERMISSION_DENIED|LIMITED_NUMBER/i.test(
    msg
  )

/**
 * 전국 공매 물건을 수집한다.
 *
 * @param {object} opts
 * @param {string} opts.serviceKey ONBID_API_KEY
 * @param {string[]} [opts.divisions] 재산유형코드 목록. 기본은 물건이 존재하는 4종 전부.
 * @param {string[]} [opts.sidoFilter] 시도 약칭 목록. 주면 시도별로 나눠 조회한다.
 * @param {number} [opts.maxCalls]
 * @param {number} [opts.maxItems] 물건 수 상한(로컬 검증용)
 * @param {(msg: string) => void} [opts.onProgress]
 */
export async function collectAuctions({
  serviceKey,
  divisions = PROPERTY_DIVISIONS.map((d) => d.code),
  sidoFilter = null,
  maxCalls = DEFAULT_MAX_CALLS,
  maxItems = Infinity,
  onProgress = () => {},
} = {}) {
  const startedAt = Date.now()
  // 한 번의 수집 안에서는 스냅샷 시각을 하나로 고정한다. 물건마다 다른 시각이
  // 찍히면 "이번 수집에서 본 물건"을 시각으로 판별할 수 없어 소멸 감지가 깨진다.
  const seenAt = new Date().toISOString()

  const byId = new Map()
  const errors = []
  let calls = 0
  let fatal = null

  // 시도를 주면 (재산유형 × 시도)로 쪼갠다. 압류재산 하나가 5만 건이라 한 번에 훑으면
  // 260회 넘게 걸려 실행 시간이 길어지는데, 시도로 나누면 몇 번에 걸쳐 이어받을 수 있다.
  const sidos = sidoFilter && sidoFilter.length ? sidoFilter : [null]

  outer: for (const prptDivCd of divisions) {
    const divLabel = PROPERTY_DIVISIONS.find((d) => d.code === prptDivCd)?.label || prptDivCd

    for (const sido of sidos) {
      const label = sido ? `${divLabel}/${sido}` : divLabel
      let pageNo = 1
      let total = null

      while (calls < maxCalls && byId.size < maxItems) {
        // 한 페이지를 최대 2회까지 시도한다.
        // 전량 수집은 100회가 넘는 연속 호출이라 중간에 네트워크가 한 번 튀는 일이 흔한데,
        // 첫 실패에 바로 포기하면 그 뒤 페이지 전부(수만 건)를 조용히 잃는다.
        let page = null
        let lastErr = null
        for (let attempt = 0; attempt < 2 && calls < maxCalls; attempt++) {
          try {
            calls++
            page = await fetchAuctionPage({
              serviceKey,
              prptDivCd,
              sido: sido || '',
              pageNo,
              numOfRows: ROWS_PER_PAGE,
              seenAt,
            })
            lastErr = null
            break
          } catch (e) {
            lastErr = e
            // 키·활용신청·한도 문제는 재시도해도 같은 결과다. 즉시 중단한다.
            if (isFatal(e.message)) break
            await sleep(1000)
          }
        }
        if (lastErr) {
          errors.push(`${label} p${pageNo}: ${lastErr.message}`)
          if (isFatal(lastErr.message)) {
            fatal = lastErr.message
            break outer
          }
          // 두 번 다 실패했으면 이 구간만 포기하고 다음으로 넘어간다.
          break
        }
        if (!page) break

        if (total === null) {
          total = page.total
          if (total > 0) onProgress(`${label}: 전체 ${total.toLocaleString()}건`)
        }
        if (page.items.length === 0) break

        for (const it of page.items) byId.set(it.id, it)

        if (pageNo * ROWS_PER_PAGE >= total) break
        pageNo++
        // 초당 호출 한도(코드 23)에 걸리지 않도록 최소한의 간격을 둔다.
        await sleep(120)
      }

      onProgress(`${label} 완료 — 누적 ${byId.size.toLocaleString()}건 (호출 ${calls}회)`)
      if (calls >= maxCalls) {
        onProgress(`호출 예산(${maxCalls}회) 소진 — 남은 구간은 다음 실행에서 이어받습니다.`)
        break outer
      }
    }
  }

  const items = [...byId.values()]

  return {
    payload: {
      last_update: seenAt,
      source: 'onbid',
      items,
      stats: {
        calls,
        collected: items.length,
        errors: errors.length,
        elapsed_sec: Math.round((Date.now() - startedAt) / 1000),
      },
    },
    /** 이번 수집에서 실제로 본 물건 id 집합. 소멸 감지(CLOSED 처리)에 쓴다. */
    seenIds: new Set(byId.keys()),
    seenAt,
    errors,
    fatal,
  }
}
