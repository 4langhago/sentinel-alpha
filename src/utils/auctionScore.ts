// 공매 물건의 추천 점수.
//
// ── 이 점수가 무엇이 아닌지 먼저 ─────────────────────────────
// 이건 "이 물건이 좋다"는 판정이 아니라 **네 가지 관측 가능한 조건을
// 합의된 가중치로 합산한 값**이다. 업계 표준 기준선이 존재하지 않으므로
// (auctionInsights.ts 첫머리 참조) 가중치는 우리가 정한 것이고, 그래서
// 총점만 내보내지 않고 축별 점수와 계산 근거를 항상 함께 돌려준다.
// 화면에서도 총점 옆에 근거를 펼쳐 사용자가 가중치에 동의하지 않으면
// 스스로 판단할 수 있게 해야 한다. 숨겨진 가중치는 임의의 판단을
// 객관적 사실처럼 보이게 만들고, 돈을 거는 결정에서 그 착시는 피해가 된다.
//
// ── 지금 이 점수가 말할 수 없는 것 ──────────────────────────
// 과거 낙찰가 이력이 없다. "이 지역 이 종목은 통상 감정가의 몇 %에
// 낙찰된다"를 계산할 수 없으므로, 체감률 점수는 "얼마나 싸졌나"까지만
// 말하고 "얼마면 싼가"는 말하지 못한다. 이 한계는 화면에 명시한다.
import { AuctionItem } from '../types/auction'
import { PROPERTY_LABELS, toPyeong } from '../types/trade'
import type { PropertyType, RegionStats } from '../types/trade'

/** 시세 비교에 최소한 필요한 실거래 표본 수. auctionInsights와 같은 기준을 쓴다. */
const MIN_SAMPLE = 5

/** 시세 비교가 의미 있는 종목. 토지·상가는 개별 요인이 가격을 좌우한다. */
const COMPARABLE = new Set<PropertyType>(['APARTMENT', 'OFFICETEL'])

/**
 * 축별 배점. 합이 100이다.
 *
 * 체감률에 가장 큰 배점을 준 이유: 유찰로 최저가가 실제로 내려간 것은
 * 원본 데이터로 확인되는 사실이고, 낙찰가 이력이 없는 지금 우리가 가진
 * 가장 단단한 근거다. 시세 대비는 층·향·연식·권리관계를 반영하지 못하는
 * 단순 비교라 그다음이고, 유찰 횟수는 체감률과 겹치므로 가장 작다.
 */
export const WEIGHTS = {
  discount: 40,
  market: 30,
  failCount: 10,
  /** 감점 항목의 최대 감점 폭. 총점에서 뺀다. */
  penalty: 20,
} as const

export interface ScoreAxis {
  key: 'discount' | 'market' | 'failCount' | 'penalty'
  label: string
  /** 이 축이 낸 점수. 감점 축은 음수다. */
  points: number
  /** 이 축의 만점(감점 축은 최대 감점 폭을 음수로). */
  max: number
  /** 어떻게 이 점수가 나왔는지. 사용자가 검증할 수 있어야 한다. */
  basis: string
}

export interface AuctionScore {
  /** 0~100. 축 점수의 합을 0 아래로 내려가지 않게 자른 값. */
  total: number
  axes: ScoreAxis[]
  /**
   * 점수를 매길 근거가 모자란 물건인지.
   * 최저가가 비공개거나 감정가가 없으면 체감률조차 못 구한다. 이런 물건에
   * 낮은 점수를 주면 "나쁜 물건"으로 오해되므로, 순위에서 빼야 한다.
   */
  scorable: boolean
  /** 점수에 반영되지 못한 것. 화면에 그대로 노출한다. */
  caveats: string[]
}

/** 0~1 구간으로 자른다. */
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * 물건 하나의 추천 점수를 낸다.
 *
 * @param item 공매 물건
 * @param marketStats 같은 시군구 실거래 통계. 없으면 시세 축을 건너뛴다.
 */
export function scoreAuction(
  item: AuctionItem,
  marketStats?: Pick<RegionStats, 'per_property'>
): AuctionScore {
  const axes: ScoreAxis[] = []
  const caveats: string[] = []
  const priced = item.min_bid_price > 0 && !item.min_bid_undisclosed

  // ── 축 1: 감정가 대비 체감률 ────────────────────────────
  // 감정가의 100%면 0점, 50% 이하면 만점. 압류재산은 유찰 1회당 10%씩
  // 저감되므로 50%는 다섯 번 유찰된 수준이고, 그 아래는 대개 물건 자체에
  // 사유가 있어 더 깎아 줄 근거가 없다.
  if (item.discount_rate !== null && priced) {
    const r = clamp01((100 - item.discount_rate) / 50)
    const points = Math.round(r * WEIGHTS.discount)
    axes.push({
      key: 'discount',
      label: '감정가 대비',
      points,
      max: WEIGHTS.discount,
      basis:
        `최저입찰가가 감정가의 ${item.discount_rate}%. ` +
        `100%를 0점, 50% 이하를 만점으로 환산해 ${points}점. ` +
        '감정 시점이 6개월 이상 앞설 수 있어 체감률이 곧 시세 대비 할인은 아니다.',
    })
  } else {
    caveats.push(
      priced
        ? '감정가가 없어 체감률을 계산하지 못했다.'
        : '최저입찰가가 비공개라 체감률을 계산하지 못했다.'
    )
  }

  // ── 축 2: 시세 대비 ─────────────────────────────────────
  // 같은 시군구 실거래 중위 평당가와 비교한다. 중위값과 같으면 0점,
  // 40% 이상 싸면 만점.
  const cmp = COMPARABLE.has(item.property_type as PropertyType)
    ? (item.property_type as PropertyType)
    : null
  const own = cmp ? marketStats?.per_property?.[cmp] : undefined
  const sqm = item.area > 0 ? item.area : item.land_area
  const pyeong = sqm > 0 ? toPyeong(sqm) : 0

  if (cmp && own && own.count >= MIN_SAMPLE && own.median_per_pyeong > 0 && pyeong > 0 && priced) {
    const perPyeong = Math.round(item.min_bid_price / pyeong)
    const diff = (perPyeong - own.median_per_pyeong) / own.median_per_pyeong
    const points = Math.round(clamp01(-diff / 0.4) * WEIGHTS.market)
    const pct = Math.round(diff * 100)
    axes.push({
      key: 'market',
      label: `${PROPERTY_LABELS[cmp]} 시세 대비`,
      points,
      max: WEIGHTS.market,
      basis:
        `평당 ${perPyeong.toLocaleString()}원 vs 같은 시군구 실거래 ${own.count}건의 ` +
        `중위 평당 ${own.median_per_pyeong.toLocaleString()}원 (${pct > 0 ? '+' : ''}${pct}%). ` +
        `같으면 0점, 40% 이상 싸면 만점으로 환산해 ${points}점. ` +
        '층·향·연식·권리관계는 반영되지 않은 단순 비교다.',
    })
  } else if (!cmp) {
    caveats.push(
      '토지·상가는 개별 요인(용도지역·맹지·상권·공실)이 가격을 좌우해 ' +
        '시군구 중위값과 비교하지 않았다.'
    )
  } else {
    caveats.push('같은 시군구 실거래 표본이 모자라 시세 비교를 하지 못했다.')
  }

  // ── 축 3: 유찰 횟수 ─────────────────────────────────────
  // 유찰이 쌓일수록 다음 회차에서 더 내려갈 여지가 있다는 뜻이지만,
  // 동시에 아무도 안 사는 이유가 있다는 뜻이기도 하다. 그래서 배점이 작고
  // 5회에서 만점으로 묶는다.
  if (item.fail_count > 0) {
    const points = Math.round(clamp01(item.fail_count / 5) * WEIGHTS.failCount)
    axes.push({
      key: 'failCount',
      label: '유찰 누적',
      points,
      max: WEIGHTS.failCount,
      basis:
        `${item.fail_count}회 유찰. 5회를 만점으로 환산해 ${points}점. ` +
        '유찰이 많다는 것은 더 싸질 여지인 동시에 시장이 사지 않는 이유가 ' +
        '있다는 신호이기도 해 배점을 작게 뒀다.',
    })
  }

  // ── 축 4: 감점 ──────────────────────────────────────────
  // 낙찰 뒤에 실제로 돈과 시간이 더 드는 것이 확인되는 조건만 뺀다.
  const penalties: string[] = []
  let penalty = 0
  if (item.share_deal) {
    penalty += 12
    penalties.push('지분 매각 -12 (단독 처분 불가, 공유물분할청구소송으로 장기화)')
  }
  if (/매수(자|인)|낙찰자/.test(item.eviction_responsibility || '')) {
    penalty += 6
    penalties.push('명도책임 낙찰인 -6 (인도명령 없음, 명도소송 시 5~6개월)')
  }
  if (item.min_bid_undisclosed) {
    penalty += 4
    penalties.push('최저입찰가 비공개 -4 (원문 확인 전에는 판단 불가)')
  }
  penalty = Math.min(penalty, WEIGHTS.penalty)
  if (penalty > 0) {
    axes.push({
      key: 'penalty',
      label: '감점',
      points: -penalty,
      max: -WEIGHTS.penalty,
      basis: penalties.join(' · '),
    })
  }

  const total = Math.max(0, axes.reduce((sum, a) => sum + a.points, 0))
  // 체감률조차 못 구한 물건은 순위에 올리지 않는다. 낮은 점수가 아니라
  // "잴 수 없는 물건"이며, 둘을 섞으면 순위가 거짓말이 된다.
  const scorable = axes.some((a) => a.key === 'discount')

  caveats.push(
    '과거 낙찰가 이력이 없어 "이 지역은 통상 감정가의 몇 %에 낙찰되는가"는 ' +
      '반영되지 않았다. 이 점수는 얼마나 싸졌는지까지만 말한다.'
  )

  return { total, axes, scorable, caveats }
}

/**
 * 점수가 매겨지는 물건만 골라 높은 순으로 세운다.
 *
 * 점수를 못 매기는 물건을 0점으로 섞지 않는 것이 핵심이다 —
 * "잴 수 없음"과 "나쁨"은 다르고, 섞으면 사용자가 후자로 읽는다.
 */
export function rankAuctions<T extends AuctionItem>(
  items: T[],
  marketStats?: Pick<RegionStats, 'per_property'>
): Array<{ item: T; score: AuctionScore }> {
  return items
    .map((item) => ({ item, score: scoreAuction(item, marketStats) }))
    .filter((r) => r.score.scorable)
    .sort((a, b) => b.score.total - a.score.total)
}
