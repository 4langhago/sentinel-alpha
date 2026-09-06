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

describe('매각 / 임대 구분', () => {
  // 실측 69,753건 중 2,705건이 임대다. 감정가·최저입찰가의 뜻이 매각과 달라
  // (매매가가 아니라 임대료) 같은 잣대를 대면 "평당 41만원 아파트"가 나온다.
  // 실제로 강원 원주 임대 아파트에서 시세 대비 -96%가 나왔다.
  const rental = (o: Partial<AuctionItem> = {}) =>
    buildInsights(
      item({
        disposal: '임대',
        property_type: 'APARTMENT',
        area: 59.69,
        appraisal_price: 8_300_000,
        min_bid_price: 7_470_000,
        discount_rate: 90,
        use_mcls: '주거용건물',
        ...o,
      }),
      { per_property: { APARTMENT: { count: 200, median_per_pyeong: 10_000_000 } } } as never
    )

  it('임대 물건임을 먼저 경고한다', () => {
    const got = rental().find((i) => i.label === '매각이 아니라 임대 물건')
    expect(got?.kind).toBe('warning')
    expect(got?.emphasis).toBe(true)
  })

  it('임대에는 매매 시세 비교를 붙이지 않는다', () => {
    expect(rental().some((i) => i.label.endsWith('시세 대비'))).toBe(false)
  })

  it('임대에는 취득세를 계산하지 않는다', () => {
    expect(rental().some((i) => i.label === '취득세 개산')).toBe(false)
  })

  it('매각 물건에는 둘 다 붙는다', () => {
    const sale = buildInsights(
      item({
        disposal: '매각',
        property_type: 'APARTMENT',
        area: 84,
        appraisal_price: 500_000_000,
        min_bid_price: 350_000_000,
        discount_rate: 70,
        use_mcls: '주거용건물',
      }),
      { per_property: { APARTMENT: { count: 200, median_per_pyeong: 20_000_000 } } } as never
    )
    expect(sale.some((i) => i.label.endsWith('시세 대비'))).toBe(true)
    expect(sale.some((i) => i.label === '취득세 개산')).toBe(true)
  })
})

describe('권리분석 참고 항목', () => {
  it('배분요구종기일을 날짜와 함께 짚는다', () => {
    const got = buildInsights(item({ distribution_deadline: '2026/09/14' })).find((i) =>
      i.label.startsWith('배분요구종기일')
    )
    expect(got?.kind).toBe('unknown')
    expect(got?.label).toContain('2026/09/14')
    expect(got?.basis).toContain('대항력')
  })

  it('종기일이 지났는지에 따라 설명이 달라진다', () => {
    const past = buildInsights(item({ distribution_deadline: '2020/01/01' })).find((i) =>
      i.label.startsWith('배분요구종기일')
    )
    const future = buildInsights(item({ distribution_deadline: '2099/01/01' })).find((i) =>
      i.label.startsWith('배분요구종기일')
    )
    expect(past?.basis).toContain('이미 지났다')
    expect(past?.emphasis).toBeFalsy()
    expect(future?.basis).toContain('아직 지나지 않았다')
    expect(future?.emphasis).toBe(true)
  })

  it('종기일이 없으면 항목을 만들지 않는다', () => {
    expect(
      buildInsights(item({ distribution_deadline: '' })).some((i) =>
        i.label.startsWith('배분요구종기일')
      )
    ).toBe(false)
  })

  it('재산유형에 따라 근거 법령 안내가 다르다', () => {
    const seized = buildInsights(item({ prpt_div: '압류재산' }))
    const trust = buildInsights(item({ prpt_div: '기타일반재산' }))
    expect(seized.some((i) => i.label.includes('국세징수법'))).toBe(true)
    expect(trust.some((i) => i.label.includes('공고문이 계약조건'))).toBe(true)
    // 서로 섞이면 안 된다 — 확인해야 할 문서가 다르다.
    expect(seized.some((i) => i.label.includes('공고문이 계약조건'))).toBe(false)
  })

  it('드문 입찰 조건만 경고한다', () => {
    const normal = buildInsights(item({ bid_method: '일반경쟁', bid_div: '전자입찰' }))
    expect(normal.some((i) => i.label.includes('경쟁 물건'))).toBe(false)
    expect(normal.some((i) => i.label === '현장입찰')).toBe(false)

    const limited = buildInsights(item({ bid_method: '제한경쟁', bid_div: '현장입찰' }))
    expect(limited.find((i) => i.label === '제한경쟁 물건')?.emphasis).toBe(true)
    expect(limited.find((i) => i.label === '현장입찰')?.emphasis).toBe(true)
  })
})

describe('저가 경고는 관측된 사실만 말한다', () => {
  // 한때 "유찰 N회면 통상 감정가의 0.9^N% 수준"이라는 모델로 경고를 만들려
  // 했다가 버렸다. 압류재산 유찰 0회 50,834건 중 최저가가 감정가의 95% 이상인
  // 것은 10.5%뿐이라 전제가 성립하지 않았고, 그 모델이면 74%의 물건에 경고가
  // 붙었다. 경고가 그렇게 흔하면 아무도 읽지 않는다.
  const warn = (o: Partial<AuctionItem>) =>
    buildInsights(item({ min_bid_price: 50_000_000, ...o })).find(
      (i) => i.label === '지나치게 낮은 최저가'
    )

  it('유찰 0회면 유찰을 원인으로 말하지 않는다', () => {
    const got = warn({ discount_rate: 15, fail_count: 0 })
    expect(got?.basis).toContain('유찰 없이 1회차부터')
    expect(got?.basis).not.toContain('유찰이 반복')
  })

  it('유찰이 있으면 횟수를 함께 적는다', () => {
    expect(warn({ discount_rate: 15, fail_count: 6 })?.basis).toContain('6회 유찰을 거쳐')
  })

  it('30% 이상이면 경고하지 않는다 — 점수 꼭대기와 같은 경계', () => {
    expect(warn({ discount_rate: 30, fail_count: 3 })).toBeUndefined()
    expect(warn({ discount_rate: 29, fail_count: 3 })).toBeDefined()
  })

  it('저감 규칙을 단정하지 않는다', () => {
    // "유찰 1회당 10% 저감"은 우리 데이터와 맞지 않아 지웠다.
    const drop = buildInsights(item({ discount_rate: 70, fail_count: 3 })).find(
      (i) => i.label === '누적 하락'
    )
    expect(drop?.basis).not.toContain('10%씩')
    expect(drop?.basis).toContain('공고문에서 확인')
  })
})
