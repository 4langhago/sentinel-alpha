// 명도책임 표기 회귀 테스트.
//
// 이 블록은 두 번 연속으로 같은 방식으로 틀렸다. 온비드가 같은 사실을
// 여러 낱말로 적는데 그중 일부만 매칭했기 때문이다(먼저 "매수인"이,
// 다음엔 "낙찰자" 9,193건이 통째로 빠졌다). 표기 목록은 앞으로도 늘 수 있어
// 실제 수집 데이터에서 관측된 값을 케이스로 고정해 둔다.
//
// 아래 값과 건수는 2026-09-05 netlify/functions/data/auction/**/*.json 전수 집계.
import { describe, it, expect } from 'vitest'
import { buildInsights } from '../auctionInsights'
import type { AuctionItem } from '../../types/auction'

/** 명도책임만 보기 위한 최소 물건. 다른 인사이트가 끼어들지 않는 값으로 채운다. */
function item(overrides: Partial<AuctionItem> = {}): AuctionItem {
  return {
    id: 'x', cltr_mng_no: '', pbct_cdtn_no: '', onbid_cltr_no: '', onbid_pbanc_no: '',
    pbct_no: '', bid_round: 1,
    name: '테스트', sgg_code: '', sido: '', sgg: '', umd: '', region_name: '', address: '',
    prpt_div_code: '', prpt_div: '압류재산', disposal: '매각',
    use_mcls_code: '', use_mcls: '', use_scls: '', property_type: 'ETC',
    area: 0, land_area: 0,
    appraisal_price: 0, min_bid_price: 0, min_bid_undisclosed: false,
    discount_rate: null, fail_count: 0, private_contract: false,
    bid_start_at: '', bid_end_at: '',
    bid_status_code: '', bid_status: '', status: 'OPEN',
    org_name: '', request_org: '',
    first_seen_at: '', last_seen_at: '', detail_url: '',
    ...overrides,
  }
}

const evictionInsight = (value?: string) =>
  buildInsights(item({ eviction_responsibility: value })).find((i) =>
    i.label.startsWith('명도책임')
  )

describe('명도책임 인사이트', () => {
  // 낙찰인이 책임 주체인 표기 — 전부 경고여야 한다.
  it.each([
    ['매수자', 33851],
    ['매수인', 33147],
    ['낙찰자', 9193],
    ['낙찰자(매수자)', 36],
    ['매수자확인', 2],
  ])('%s (실측 %i건) 은 경고를 만든다', (value) => {
    const got = evictionInsight(value)
    expect(got?.kind).toBe('warning')
    // 원문을 그대로 노출해야 사용자가 공고문과 대조할 수 있다.
    expect(got?.label).toBe(`명도책임: ${value}`)
    expect(got?.emphasis).toBe(true)
  })

  // 책임 주체가 낙찰인이 아닌 표기 — 경고를 만들면 오탐이다.
  it.each([
    ['매도자', 17],
    ['공고기관', 9],
    ['임차인', 5],
    ['수허가자', 4],
    ['계약당사자', 4],
    ['명도없이 바로 사용 가능', 10],
    ['해당사항 없음', 17],
    ['해당없음', 2],
    ['사회복지법인향림원', 2],
    ['주차장 부지 임대', 1],
    ['-', 24],
  ])('%s (실측 %i건) 은 경고를 만들지 않는다', (value) => {
    expect(evictionInsight(value)).toBeUndefined()
  })

  it('물건별상이(기타사항참조) 는 경고가 아니라 확인 필요다', () => {
    // 책임 주체를 데이터로 판정할 수 없는 4,126건. 단정도 침묵도 틀린다.
    const got = evictionInsight('물건별상이(기타사항참조)')
    expect(got?.kind).toBe('unknown')
    expect(got?.label).toBe('명도책임 확인 필요')
    expect(got?.basis).toContain('물건별상이(기타사항참조)')
  })

  it('값이 없으면 아무 인사이트도 만들지 않는다', () => {
    expect(evictionInsight(undefined)).toBeUndefined()
    expect(evictionInsight('')).toBeUndefined()
  })
})
