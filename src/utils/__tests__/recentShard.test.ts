// 전국 목록 샤드의 재산유형 배분 회귀 테스트.
//
// 운영에서 실제로 벌어진 일: recent.json이 마감임박순 상위 3,000건이라
// 매각 일정이 뒤쪽에 몰린 압류재산이 한 건도 들어가지 못했다. 전체의 74%인
// 유형이 전국 화면에서 통째로 사라졌고, 지역을 고르면 시도 샤드라 정상이라
// 더 발견하기 어려웠다. 비중 배분이 깨지면 같은 일이 다시 일어난다.
import { describe, it, expect } from 'vitest'
import { pickRecent, RECENT_SHARD_LIMIT } from '../../../netlify/functions/lib/auctionStorage.mjs'

type Row = { id: string; prpt_div: string; bid_end_at: string; status: string }

/**
 * 실측 비중(2026-09-05, 전체 80,629건)을 그대로 흉내 낸 표본.
 * 마감임박순으로 정렬된 상태를 재현하기 위해, 실제와 같이 기타일반재산이
 * 앞쪽 일정에 몰리고 압류재산이 뒤로 밀리도록 종료일시를 준다.
 */
function pool(): Row[] {
  const mix: Array<[string, number, number]> = [
    // [재산유형, 건수, 종료일시 시작 오프셋(일)]
    ['기타일반재산', 17770, 0],
    ['국유재산', 2638, 0],
    ['공유재산', 429, 0],
    ['압류재산', 59792, 60],
  ]
  const rows: Row[] = []
  for (const [div, n, offset] of mix) {
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(2026, 8, 6) + (offset + i / 500) * 86400000)
      rows.push({ id: `${div}-${i}`, prpt_div: div, bid_end_at: d.toISOString(), status: 'OPEN' })
    }
  }
  return rows.sort((a, b) => a.bid_end_at.localeCompare(b.bid_end_at))
}

describe('pickRecent', () => {
  const picked: Row[] = pickRecent(pool())

  it('한도를 넘지 않는다', () => {
    expect(picked.length).toBeLessThanOrEqual(RECENT_SHARD_LIMIT)
    // 한도를 크게 밑돌면 전국 화면이 빈약해진다. 90% 이상은 채워야 한다.
    expect(picked.length).toBeGreaterThan(RECENT_SHARD_LIMIT * 0.9)
  })

  it('모든 재산유형이 한 건 이상 들어간다', () => {
    const divs = new Set(picked.map((r) => r.prpt_div))
    expect([...divs].sort()).toEqual(['공유재산', '국유재산', '기타일반재산', '압류재산'])
  })

  it('압류재산이 비중(74%)에 가깝게 들어간다', () => {
    // 이 한 줄이 원래 버그다. 고치기 전에는 0건이었다.
    const n = picked.filter((r) => r.prpt_div === '압류재산').length
    const share = n / picked.length
    expect(share).toBeGreaterThan(0.5)
    expect(share).toBeLessThan(0.9)
  })

  it('마감임박순 정렬을 유지한다', () => {
    const ends = picked.map((r) => r.bid_end_at)
    expect([...ends].sort()).toEqual(ends)
  })

  it('한도 이하 입력은 그대로 돌려준다', () => {
    const small = pool().slice(0, 10)
    expect(pickRecent(small)).toEqual(small)
  })
})
