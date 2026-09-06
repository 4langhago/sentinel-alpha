// 추천 점수 테스트.
//
// 점수는 임의 가중치라 "정답"이 없다. 그래서 값을 박아 두는 대신,
// 깨지면 사용자가 잘못된 판단을 하게 되는 성질만 고정한다:
// 배점 합계, 단조성(싸질수록 점수가 오른다), 감점 방향, 그리고
// "잴 수 없는 물건"이 순위에 섞이지 않는다는 것.
import { describe, it, expect } from 'vitest'
import { scoreAuction, scoreTotal, rankAuctions, WEIGHTS } from '../auctionScore'
import type { AuctionItem } from '../../types/auction'

function item(overrides: Partial<AuctionItem> = {}): AuctionItem {
  return {
    id: 'x', cltr_mng_no: '', pbct_cdtn_no: '', onbid_cltr_no: '', onbid_pbanc_no: '',
    pbct_no: '', bid_round: 1,
    name: '테스트', sgg_code: '', sido: '', sgg: '', umd: '', region_name: '', address: '',
    prpt_div_code: '', prpt_div: '압류재산', disposal: '매각',
    use_mcls_code: '', use_mcls: '', use_scls: '', property_type: 'APARTMENT',
    area: 84, land_area: 0,
    appraisal_price: 100_000_000, min_bid_price: 70_000_000, min_bid_undisclosed: false,
    discount_rate: 70, fail_count: 0, private_contract: false,
    bid_start_at: '', bid_end_at: '',
    bid_status_code: '', bid_status: '', status: 'OPEN',
    org_name: '', request_org: '',
    first_seen_at: '', last_seen_at: '', detail_url: '',
    ...overrides,
  }
}

const market = {
  per_property: {
    APARTMENT: { count: 50, median_per_pyeong: 20_000_000, median_price: 0, avg_price: 0 },
  },
} as never

describe('배점', () => {
  it('가중치 합이 100이다', () => {
    expect(WEIGHTS.discount + WEIGHTS.market + WEIGHTS.failCount).toBe(80)
    expect(WEIGHTS.penalty).toBe(20)
  })

  it('총점은 0 아래로 내려가지 않는다', () => {
    // 감점만 있고 얻을 점수가 없는 물건.
    const s = scoreAuction(
      item({ discount_rate: 100, fail_count: 0, share_deal: true, property_type: 'LAND' })
    )
    expect(s.total).toBeGreaterThanOrEqual(0)
  })

  it('총점이 100을 넘지 않는다', () => {
    const s = scoreAuction(
      item({ discount_rate: 30, fail_count: 10, min_bid_price: 1_000_000 }),
      market
    )
    expect(s.total).toBeLessThanOrEqual(100)
  })
})

describe('단조성', () => {
  it('체감률이 낮을수록(싸질수록) 점수가 높다 — 30%까지만', () => {
    const cheap = scoreAuction(item({ discount_rate: 40 })).total
    const mid = scoreAuction(item({ discount_rate: 75 })).total
    const full = scoreAuction(item({ discount_rate: 100 })).total
    expect(cheap).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(full)
  })

  it('체감률 점수는 30~45%가 꼭대기이고 양쪽으로 내려간다', () => {
    // 인사이트가 30% 아래를 "과도한 저감"으로 경고하는데 점수는 만점을 주고 있었다.
    // 실측 65,380건 중 18,795건(28.7%)이 같은 카드에서 "40/40 만점"과 경고를
    // 동시에 보여줬다. 곡선을 꺾어 둘이 같은 방향을 가리키게 했다.
    const axis = (rate: number) =>
      scoreAuction(item({ discount_rate: rate })).axes.find((a) => a.key === 'discount')!.points

    // 꼭대기 구간은 만점
    expect(axis(30)).toBe(WEIGHTS.discount)
    expect(axis(40)).toBe(WEIGHTS.discount)
    expect(axis(45)).toBe(WEIGHTS.discount)

    // 위쪽: 비쌀수록 낮다
    expect(axis(60)).toBeLessThan(axis(45))
    expect(axis(100)).toBe(0)

    // 아래쪽: 더 싸질수록 다시 낮아진다 — 이게 이번에 바뀐 부분이다
    expect(axis(20)).toBeLessThan(axis(30))
    expect(axis(3)).toBeLessThan(axis(20))

    // 다만 0으로 떨어뜨리지는 않는다. "확인할 가치도 없다"는 우리가 아는 것보다 센 주장이다.
    expect(axis(1)).toBeGreaterThan(0)
  })

  it('경고 구간과 만점 구간이 겹치지 않는다', () => {
    // 이 계약이 깨지면 카드가 스스로 모순된 말을 하게 된다.
    const axis = (rate: number) =>
      scoreAuction(item({ discount_rate: rate })).axes.find((a) => a.key === 'discount')!.points
    for (const rate of [1, 5, 10, 15, 20, 25, 28]) {
      expect(axis(rate)).toBeLessThan(WEIGHTS.discount)
    }
  })

  it('설명되지 않는 헐값은 오히려 감점된다', () => {
    // 감정가의 3%짜리가 30%짜리보다 총점이 높으면 안 된다 —
    // 실제로 경기 점수순 상위 5건이 전부 그런 물건이었다.
    const sane = scoreAuction(item({ discount_rate: 30, fail_count: 5 })).total
    const absurd = scoreAuction(item({ discount_rate: 3, fail_count: 15 })).total
    expect(absurd).toBeLessThan(sane)
    const pen = scoreAuction(item({ discount_rate: 3 })).axes.find((a) => a.key === 'penalty')
    expect(pen?.basis).toContain('감정가의 3%까지 떨어짐')
  })

  it('시세보다 쌀수록 시세 축 점수가 높다', () => {
    const axis = (price: number) =>
      scoreAuction(item({ min_bid_price: price }), market).axes.find((a) => a.key === 'market')!
        .points
    // 84㎡ ≈ 25.4평. 중위 평당 2,000만원이면 시세 수준은 약 5억.
    expect(axis(300_000_000)).toBeGreaterThan(axis(500_000_000))
  })

  it('유찰 점수는 2~5회가 꼭대기이고 그 뒤로 내려간다', () => {
    // 체감률과 같은 이유로 꺾었다. 점수가 유찰 많은 물건에 만점을 주면서
    // 카드의 경고가 유찰을 위험 신호라고 말하면 서로 어긋난다.
    const at = (n: number) =>
      scoreAuction(item({ fail_count: n })).axes.find((a) => a.key === 'failCount')?.points ?? 0
    expect(at(0)).toBe(0)
    expect(at(1)).toBeLessThan(at(2))
    expect(at(2)).toBe(WEIGHTS.failCount)
    expect(at(5)).toBe(WEIGHTS.failCount)
    // 꼭대기를 넘으면 내려간다 — 15회 유찰은 기회보다 신호에 가깝다.
    expect(at(10)).toBeLessThan(at(5))
    expect(at(20)).toBeLessThan(at(10))
    // 다만 0으로 떨어뜨리지는 않는다.
    expect(at(20)).toBeGreaterThan(0)
  })

  it('헐값 구간에서는 시세축을 주지 않는다 — 이중 계산 방지', () => {
    // 감정가의 1%인 서울 금천구 아파트가 "평당 9만원 · 시세 대비 -99% ·
    // 시세축 30/30"을 받고 있었다(실측 385건). 평당가가 낮은 것은 저평가가
    // 아니라 값이 그만큼 내려간 결과라, 같은 사실을 두 번 쳐줄 수 없다.
    const deep = scoreAuction(
      item({ discount_rate: 5, min_bid_price: 5_000_000, property_type: 'APARTMENT' }),
      market
    )
    expect(deep.axes.some((a) => a.key === 'market')).toBe(false)
    expect(deep.caveats.some((c) => c.includes('시세 비교를 하지 않았다'))).toBe(true)

    // 정상 구간에서는 그대로 준다.
    const normal = scoreAuction(item({ discount_rate: 60, property_type: 'APARTMENT' }), market)
    expect(normal.axes.some((a) => a.key === 'market')).toBe(true)
  })
})

describe('감점', () => {
  it('지분 매각은 총점을 낮춘다', () => {
    const base = scoreAuction(item()).total
    const share = scoreAuction(item({ share_deal: true })).total
    expect(share).toBeLessThan(base)
  })

  it('명도책임이 낙찰인이면 표기가 무엇이든 감점된다', () => {
    const base = scoreAuction(item()).total
    for (const v of ['매수자', '매수인', '낙찰자', '낙찰자(매수자)']) {
      expect(scoreAuction(item({ eviction_responsibility: v })).total).toBeLessThan(base)
    }
  })

  it('책임 주체가 낙찰인이 아니면 감점하지 않는다', () => {
    const base = scoreAuction(item()).total
    for (const v of ['매도자', '공고기관', '임차인', '해당사항 없음']) {
      expect(scoreAuction(item({ eviction_responsibility: v })).total).toBe(base)
    }
  })

  it('감점 폭은 상한을 넘지 않는다', () => {
    const s = scoreAuction(
      item({ share_deal: true, eviction_responsibility: '낙찰자', min_bid_undisclosed: true })
    )
    const p = s.axes.find((a) => a.key === 'penalty')!
    expect(p.points).toBeGreaterThanOrEqual(-WEIGHTS.penalty)
  })
})

describe('잴 수 없는 물건', () => {
  it('최저가 비공개면 점수를 매기지 않는다', () => {
    const s = scoreAuction(item({ min_bid_undisclosed: true, min_bid_price: 0 }))
    expect(s.scorable).toBe(false)
  })

  it('감정가가 없으면 점수를 매기지 않는다', () => {
    const s = scoreAuction(item({ appraisal_price: 0, discount_rate: null }))
    expect(s.scorable).toBe(false)
  })

  it('순위에서 제외된다 — 0점으로 섞이지 않는다', () => {
    const ranked = rankAuctions([
      item({ id: 'a', discount_rate: 60 }),
      item({ id: 'b', min_bid_undisclosed: true, min_bid_price: 0, discount_rate: null }),
      item({ id: 'c', discount_rate: 90 }),
    ])
    expect(ranked.map((r) => r.item.id)).toEqual(['a', 'c'])
  })
})

describe('근거 노출', () => {
  it('모든 축이 계산 근거를 갖는다', () => {
    const s = scoreAuction(item({ fail_count: 2, share_deal: true }), market)
    expect(s.axes.length).toBeGreaterThan(0)
    for (const a of s.axes) expect(a.basis.length).toBeGreaterThan(10)
  })

  it('낙찰가 이력이 없다는 한계를 항상 밝힌다', () => {
    const s = scoreAuction(item())
    expect(s.caveats.some((c) => c.includes('낙찰가 이력'))).toBe(true)
  })
})

describe('빠른 경로와 근거 경로의 일치', () => {
  // 서버는 정렬할 때 근거 문장을 만들지 않는 scoreTotal을, 카드는 근거가 붙은
  // scoreAuction을 쓴다. 둘이 어긋나면 목록 순서와 카드에 찍힌 점수가 달라져
  // 사용자가 둘 중 무엇도 믿을 수 없게 된다. 이 테스트가 그 계약이다.
  const cases: Array<[string, Partial<AuctionItem>]> = [
    ['기본', {}],
    ['많이 싸고 많이 유찰', { discount_rate: 45, fail_count: 7 }],
    ['감점 겹침', { share_deal: true, eviction_responsibility: '낙찰자' }],
    ['시세보다 쌈', { min_bid_price: 300_000_000 }],
    ['시세보다 비쌈', { min_bid_price: 900_000_000 }],
    ['비교 불가 종목', { property_type: 'LAND' }],
    ['면적 없음', { area: 0, land_area: 0 }],
  ]

  it.each(cases)('%s — 두 경로가 같은 값을 낸다', (_label, patch) => {
    const it_ = item(patch)
    const full = scoreAuction(it_, market)
    expect(scoreTotal(it_, market)).toBe(full.total)
  })

  it('잴 수 없는 물건은 빠른 경로가 null을 낸다', () => {
    const it_ = item({ min_bid_undisclosed: true, min_bid_price: 0, discount_rate: null })
    expect(scoreAuction(it_, market).scorable).toBe(false)
    expect(scoreTotal(it_, market)).toBeNull()
  })

  it('시세 통계가 없어도 두 경로가 같다', () => {
    const it_ = item({ discount_rate: 55, fail_count: 3 })
    expect(scoreTotal(it_)).toBe(scoreAuction(it_).total)
  })
})

describe('확인 가능한 배점은 분모로 드러낼 뿐 환산하지 않는다', () => {
  // 한 번 환산했다가 되돌린 자리다. 시세축이 없는 물건은 분모가 50이라
  // 두 축만 만점이면 100점이 됐고, 실측 65,380건 중 126건이
  // "감정가의 20~30% · 유찰 5~8회 · 토지"로 만점을 받았다. 상위 500 중
  // 아파트는 8건뿐이었다 — 확인할 수 없는 물건일수록 높은 점수라는
  // 정반대 편향이다. 이 테스트가 그 회귀를 막는다.
  const strong = { discount_rate: 25, fail_count: 8, min_bid_price: 300_000_000 }

  it('시세 비교를 못 하는 물건이 만점을 받지 못한다', () => {
    const land = scoreAuction(
      item({ ...strong, property_type: 'LAND', area: 0, land_area: 500 }),
      market
    )
    expect(land.attainable).toBe(WEIGHTS.discount + WEIGHTS.failCount)
    expect(land.total).toBeLessThanOrEqual(land.attainable)
    expect(land.total).toBeLessThan(100)
  })

  it('총점은 축 점수의 단순 합이다 — 분모로 나누지 않는다', () => {
    for (const p of [
      { property_type: 'LAND' as const, area: 0, land_area: 300 },
      { property_type: 'APARTMENT' as const },
      { ...strong, share_deal: true },
    ]) {
      const s = scoreAuction(item(p), market)
      const sum = Math.max(0, s.axes.reduce((n, a) => n + a.points, 0))
      expect(s.total).toBe(sum)
    }
  })

  it('분모는 확인한 축만 더한 값이다', () => {
    const apt = scoreAuction(item({ property_type: 'APARTMENT' }), market)
    expect(apt.attainable).toBe(WEIGHTS.discount + WEIGHTS.market + WEIGHTS.failCount)
  })

  it('총점이 0 이상이고 유한하다', () => {
    for (const rate of [1, 20, 30, 60, 100, 150]) {
      for (const fc of [0, 3, 20]) {
        const t = scoreAuction(item({ discount_rate: rate, fail_count: fc }), market).total
        expect(t).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(t)).toBe(true)
      }
    }
  })

  it('되돌린 뒤에도 두 경로가 일치한다', () => {
    for (const p of [
      { property_type: 'LAND' as const, area: 0, land_area: 300 },
      { property_type: 'APARTMENT' as const },
      { discount_rate: 15 },
      { fail_count: 9, share_deal: true },
    ]) {
      const it_ = item(p)
      expect(scoreTotal(it_, market)).toBe(scoreAuction(it_, market).total)
    }
  })
})

describe('임대 물건', () => {
  const rent = item({ disposal: '임대', property_type: 'APARTMENT', area: 59.69,
    appraisal_price: 8_300_000, min_bid_price: 7_470_000, discount_rate: 90 })

  it('점수를 매기지 않는다 — 매매 기준 체계가 통하지 않는다', () => {
    const s = scoreAuction(rent, market)
    expect(s.scorable).toBe(false)
    expect(s.axes).toHaveLength(0)
    expect(s.caveats[0]).toContain('임대')
  })

  it('정렬에서도 빠진다', () => {
    expect(scoreTotal(rent, market)).toBeNull()
    expect(rankAuctions([rent, item({ id: 'sale', disposal: '매각' })], market)
      .map((r) => r.item.id)).toEqual(['sale'])
  })
})
