// 추천 점수 테스트.
//
// 점수는 임의 가중치라 "정답"이 없다. 그래서 값을 박아 두는 대신,
// 깨지면 사용자가 잘못된 판단을 하게 되는 성질만 고정한다:
// 배점 합계, 단조성(싸질수록 점수가 오른다), 감점 방향, 그리고
// "잴 수 없는 물건"이 순위에 섞이지 않는다는 것.
import { describe, it, expect } from 'vitest'
import { scoreAuction, rankAuctions, WEIGHTS } from '../auctionScore'
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
  it('체감률이 낮을수록(싸질수록) 점수가 높다', () => {
    const cheap = scoreAuction(item({ discount_rate: 50 })).total
    const mid = scoreAuction(item({ discount_rate: 75 })).total
    const full = scoreAuction(item({ discount_rate: 100 })).total
    expect(cheap).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(full)
  })

  it('시세보다 쌀수록 시세 축 점수가 높다', () => {
    const axis = (price: number) =>
      scoreAuction(item({ min_bid_price: price }), market).axes.find((a) => a.key === 'market')!
        .points
    // 84㎡ ≈ 25.4평. 중위 평당 2,000만원이면 시세 수준은 약 5억.
    expect(axis(300_000_000)).toBeGreaterThan(axis(500_000_000))
  })

  it('유찰이 많을수록 점수가 높지만 5회에서 묶인다', () => {
    const at = (n: number) =>
      scoreAuction(item({ fail_count: n })).axes.find((a) => a.key === 'failCount')?.points ?? 0
    expect(at(3)).toBeGreaterThan(at(1))
    expect(at(10)).toBe(at(5))
    expect(at(5)).toBe(WEIGHTS.failCount)
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
