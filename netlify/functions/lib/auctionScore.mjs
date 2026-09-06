// 공매 물건의 추천 점수 — 서버와 화면이 함께 쓰는 단일 구현.
//
// 왜 .mjs로 여기에 두는가: 점수를 서버(정렬용)와 화면(근거 표시용)에서
// 각각 구현하면 반드시 어긋난다. 목록 순서와 카드에 찍힌 점수가 다르면
// 사용자는 둘 중 무엇도 믿을 수 없다. src/utils/auctionScore.ts는 이 파일을
// 타입만 입혀 다시 내보내는 껍데기다.
//
// ── 이 점수가 무엇이 아닌지 ──────────────────────────────────
// "이 물건이 좋다"는 판정이 아니라 네 가지 관측 가능한 조건을 우리가 정한
// 가중치로 합산한 값이다. 업계 표준 기준선은 존재하지 않으므로
// (auctionInsights.ts 첫머리 참조) 총점만 내보내지 않고 축별 점수와 계산
// 근거를 함께 돌려주며, 화면에서 그것을 펼쳐 보이는 것을 전제로 한다.
//
// ── 지금 말할 수 없는 것 ────────────────────────────────────
// 과거 낙찰가 이력이 없다. 체감률 점수는 "얼마나 싸졌나"까지만 말하고
// "얼마면 싼가"는 말하지 못한다.

/** 시세 비교에 최소한 필요한 실거래 표본 수. auctionInsights와 같은 기준. */
const MIN_SAMPLE = 5

/** 시세 비교가 의미 있는 종목. 토지·상가는 개별 요인이 가격을 좌우한다. */
const COMPARABLE = new Set(['APARTMENT', 'OFFICETEL'])

const PROPERTY_LABELS = {
  APARTMENT: '아파트',
  OFFICETEL: '오피스텔',
  COMMERCIAL: '상가·사무실',
  LAND: '토지',
}

const toPyeong = (area) => Math.round((area / 3.305785) * 10) / 10

/**
 * 축별 배점. 합이 100이다.
 *
 * 체감률에 가장 큰 배점을 준 이유: 유찰로 최저가가 실제로 내려간 것은 원본
 * 데이터로 확인되는 사실이고, 낙찰가 이력이 없는 지금 가장 단단한 근거다.
 * 시세 대비는 층·향·연식·권리관계를 반영 못 하는 단순 비교라 그다음이고,
 * 유찰 횟수는 체감률과 겹치므로 가장 작다.
 */
export const WEIGHTS = {
  discount: 40,
  market: 30,
  failCount: 10,
  penalty: 20,
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/**
 * 체감률 축의 0~1 비율. 감정가 100%면 0, 30% 이하면 1이고 그 아래로는 더
 * 오르지 않는다.
 *
 * 만점 구간을 50%가 아니라 30%에 두고 포화시키는 이유: 실측(2026-09-06,
 * 시군구 샤드 69,753건)에서 감정가의 5% 이하인 물건이 2,542건(3.6%)이다.
 * 감정가의 1~3%는 정상적인 할인이 아니라 지분·맹지·분묘·법정지상권처럼
 * 시장이 사지 않는 사유가 있거나 감정가 자체가 잘못 들어온 경우다.
 * 싸질수록 점수가 계속 오르게 두면 순위 최상위가 그런 물건으로 채워진다
 * — 실제로 경기 점수순 상위 5건이 전부 "감정가의 1~3% · 유찰 15회"였다.
 * 초보자를 정확히 함정으로 안내하는 셈이라, 일정 지점 이상은 더 싸다고
 * 더 좋게 보지 않는다.
 */
const DISCOUNT_FULL_AT = 30
const discountRatio = (rate) => clamp01((100 - rate) / (100 - DISCOUNT_FULL_AT))

/**
 * 설명되지 않는 헐값의 경계.
 * 이보다 낮으면 왜 안 팔리는지를 데이터로 알 수 없다는 뜻으로 보고 감점한다.
 */
const UNEXPLAINED_BELOW = 20

/** 시세 축의 0~1 비율. 중위값과 같으면 0, 40% 이상 싸면 1. */
const marketRatio = (perPyeong, median) => clamp01(-((perPyeong - median) / median) / 0.4)

/** 유찰 축의 0~1 비율. 5회에서 묶는다. */
const failRatio = (n) => clamp01(n / 5)

/** 감점 항목. 낙찰 뒤 실제로 돈과 시간이 더 드는 것이 확인되는 조건만. */
function penaltyOf(item) {
  const reasons = []
  let sum = 0
  const rate = item.discount_rate
  if (rate !== null && rate !== undefined && rate < UNEXPLAINED_BELOW) {
    sum += 10
    reasons.push(
      `감정가의 ${rate}%까지 떨어짐 -10 (이 가격대는 지분·맹지·분묘·` +
        '법정지상권처럼 시장이 사지 않는 사유가 있거나 감정가가 잘못 들어온 경우다. ' +
        '사유가 데이터에 드러나지 않으므로 공고문과 등기부등본을 직접 봐야 한다)'
    )
  }
  if (item.share_deal) {
    sum += 12
    reasons.push('지분 매각 -12 (단독 처분 불가, 공유물분할청구소송으로 장기화)')
  }
  if (/매수(자|인)|낙찰자/.test(item.eviction_responsibility || '')) {
    sum += 6
    reasons.push('명도책임 낙찰인 -6 (인도명령 없음, 명도소송 시 5~6개월)')
  }
  if (item.min_bid_undisclosed) {
    sum += 4
    reasons.push('최저입찰가 비공개 -4 (원문 확인 전에는 판단 불가)')
  }
  return { points: Math.min(sum, WEIGHTS.penalty), reasons }
}

/**
 * 매각이 아니라 임대로 나온 물건인지.
 *
 * 실측(2026-09-06) 69,753건 중 2,705건이 임대다. 이 물건의 감정가·최저입찰가는
 * 매매가가 아니라 임대료(연액)라, 매각 물건과 같은 잣대를 대면 숫자가 통째로
 * 거짓이 된다. 실제로 강원 원주의 임대 아파트 한 건이 "평당 41만원 ·
 * 시세 대비 -96% · 시세축 만점"으로 나왔다 — 평당 41만원짜리 아파트로
 * 오인하게 만드는 값이다. 임대는 점수를 매기지 않고 순위에서 뺀다.
 */
const isRental = (item) => item.disposal === '임대'

/** 시세 비교에 쓸 실거래 통계를 종목에 맞춰 고른다. 없으면 null. */
function comparable(item, marketStats) {
  // 임대료를 매매 실거래 중위값과 비교하는 것은 단위가 다른 두 값을 나누는 것이다.
  if (isRental(item)) return null
  const type = COMPARABLE.has(item.property_type) ? item.property_type : null
  if (!type) return null
  const own = marketStats?.per_property?.[type]
  if (!own || own.count < MIN_SAMPLE || !(own.median_per_pyeong > 0)) return null
  const sqm = item.area > 0 ? item.area : item.land_area
  const pyeong = sqm > 0 ? toPyeong(sqm) : 0
  if (pyeong <= 0) return null
  return { type, own, pyeong }
}

/**
 * 잴 수 있었던 것만으로 100점 만점을 만든다.
 *
 * 왜 단순 합산이 아닌가: 시세축 30점을 받을 수 있는 물건은 전체의 10.1%뿐이다
 * (실측 2026-09-06, 69,753건 중 7,036건 — 매각이면서 아파트·오피스텔이고
 * 면적이 있는 물건). 나머지 89.9%는 토지·상가라서, 혹은 같은 시군구 실거래
 * 표본이 모자라서 그 30점을 애초에 받을 수 없다. 단순 합산이면 이들이
 * 구조적으로 50점에 묶여, 물건이 나빠서가 아니라 우리가 못 재서 순위가
 * 밀린다. 아파트만 상위에 올라오는 순위는 "추천"이 아니라 측정 편향이다.
 *
 * 그래서 받을 수 있었던 배점(attainable)으로 나눠 환산한다. 무엇을 못 쟀는지는
 * caveats로 그대로 노출하므로, 점수가 높다고 정보가 많다는 뜻은 아니라는 것을
 * 사용자가 확인할 수 있다. 감점은 환산 뒤에 뺀다 — 실제로 더 드는 돈과
 * 시간이라 측정 가능 여부와 무관하게 같은 무게여야 한다.
 */
function normalize(earned, attainable, penalty) {
  if (attainable <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((earned / attainable) * 100) - penalty))
}

/**
 * 총점만 빠르게 낸다. 정렬처럼 수만 건을 훑을 때 쓴다.
 *
 * scoreAuction과 달리 근거 문장을 만들지 않는다. 경기 같은 큰 시도는 한
 * 요청에 19,000건을 훑는데, 읽지도 않을 한국어 문장 7만 개를 만드는 것은
 * 30초 예산에서 그냥 낭비다. 두 함수가 같은 비율 함수를 쓰므로 값은 같다.
 *
 * @returns {number|null} 점수. 잴 수 없는 물건이면 null.
 */
export function scoreTotal(item, marketStats) {
  if (isRental(item)) return null
  const priced = item.min_bid_price > 0 && !item.min_bid_undisclosed
  if (item.discount_rate === null || item.discount_rate === undefined || !priced) return null

  let earned = Math.round(discountRatio(item.discount_rate) * WEIGHTS.discount)
  let attainable = WEIGHTS.discount + WEIGHTS.failCount

  const cmp = comparable(item, marketStats)
  if (cmp) {
    const perPyeong = Math.round(item.min_bid_price / cmp.pyeong)
    earned += Math.round(marketRatio(perPyeong, cmp.own.median_per_pyeong) * WEIGHTS.market)
    attainable += WEIGHTS.market
  }
  if (item.fail_count > 0) earned += Math.round(failRatio(item.fail_count) * WEIGHTS.failCount)
  return normalize(earned, attainable, penaltyOf(item).points)
}

/**
 * 물건 하나의 추천 점수를 축별 근거와 함께 낸다.
 *
 * @param item 공매 물건
 * @param marketStats 같은 시군구 실거래 통계. 없으면 시세 축을 건너뛴다.
 */
export function scoreAuction(item, marketStats) {
  const axes = []
  const caveats = []

  if (isRental(item)) {
    // 점수를 0으로 주지 않는다. 나쁜 물건이 아니라 다른 종류의 물건이다.
    return {
      total: 0,
      axes: [],
      attainable: 0,
      scorable: false,
      caveats: [
        '매각이 아니라 임대로 나온 물건이다. 표시된 감정가·최저입찰가는 매매가가 ' +
          '아니라 임대료라, 매매를 전제로 한 이 점수 체계를 적용하지 않는다.',
      ],
    }
  }
  const priced = item.min_bid_price > 0 && !item.min_bid_undisclosed
  const hasRate = item.discount_rate !== null && item.discount_rate !== undefined

  // ── 축 1: 감정가 대비 체감률 ────────────────────────────
  if (hasRate && priced) {
    const points = Math.round(discountRatio(item.discount_rate) * WEIGHTS.discount)
    axes.push({
      key: 'discount',
      label: '감정가 대비',
      points,
      max: WEIGHTS.discount,
      basis:
        `최저입찰가가 감정가의 ${item.discount_rate}%. ` +
        `100%를 0점, ${DISCOUNT_FULL_AT}% 이하를 만점으로 환산해 ${points}점. ` +
        `${DISCOUNT_FULL_AT}%보다 더 내려가도 점수는 오르지 않는다 — 그 아래는 ` +
        '싸다기보다 시장이 사지 않는 사유가 있는 구간이다. ' +
        '감정 시점이 6개월 이상 앞설 수 있어 체감률이 곧 시세 대비 할인도 아니다.',
    })
  } else {
    caveats.push(
      priced
        ? '감정가가 없어 체감률을 계산하지 못했다.'
        : '최저입찰가가 비공개라 체감률을 계산하지 못했다.'
    )
  }

  // ── 축 2: 시세 대비 ─────────────────────────────────────
  const cmp = priced ? comparable(item, marketStats) : null
  if (cmp) {
    const perPyeong = Math.round(item.min_bid_price / cmp.pyeong)
    const median = cmp.own.median_per_pyeong
    const points = Math.round(marketRatio(perPyeong, median) * WEIGHTS.market)
    const pct = Math.round(((perPyeong - median) / median) * 100)
    axes.push({
      key: 'market',
      label: `${PROPERTY_LABELS[cmp.type]} 시세 대비`,
      points,
      max: WEIGHTS.market,
      basis:
        `평당 ${perPyeong.toLocaleString()}원 vs 같은 시군구 실거래 ${cmp.own.count}건의 ` +
        `중위 평당 ${median.toLocaleString()}원 (${pct > 0 ? '+' : ''}${pct}%). ` +
        `같으면 0점, 40% 이상 싸면 만점으로 환산해 ${points}점. ` +
        '층·향·연식·권리관계는 반영되지 않은 단순 비교다.',
    })
  } else if (!COMPARABLE.has(item.property_type)) {
    caveats.push(
      '토지·상가는 개별 요인(용도지역·맹지·상권·공실)이 가격을 좌우해 ' +
        '시군구 중위값과 비교하지 않았다.'
    )
  } else {
    caveats.push('같은 시군구 실거래 표본이 모자라 시세 비교를 하지 못했다.')
  }

  // ── 축 3: 유찰 횟수 ─────────────────────────────────────
  if (item.fail_count > 0) {
    const points = Math.round(failRatio(item.fail_count) * WEIGHTS.failCount)
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
  const pen = penaltyOf(item)
  if (pen.points > 0) {
    axes.push({
      key: 'penalty',
      label: '감점',
      points: -pen.points,
      max: -WEIGHTS.penalty,
      basis: pen.reasons.join(' · '),
    })
  }

  // 받을 수 있었던 배점만 분모로 삼는다(normalize 주석 참조).
  // 유찰 축은 유찰 0회여도 "잴 수 있었으나 0점"이므로 분모에 항상 들어간다.
  const attainable =
    (axes.some((a) => a.key === 'discount') ? WEIGHTS.discount : 0) +
    (axes.some((a) => a.key === 'market') ? WEIGHTS.market : 0) +
    (axes.some((a) => a.key === 'discount') ? WEIGHTS.failCount : 0)
  const earned = axes.filter((a) => a.points > 0).reduce((sum, a) => sum + a.points, 0)
  const penalty = -axes.filter((a) => a.points < 0).reduce((sum, a) => sum + a.points, 0)
  const total = normalize(earned, attainable, penalty)
  // 체감률조차 못 구한 물건은 순위에 올리지 않는다. 낮은 점수가 아니라
  // "잴 수 없는 물건"이며, 둘을 섞으면 순위가 거짓말이 된다.
  const scorable = axes.some((a) => a.key === 'discount')

  caveats.push(
    '과거 낙찰가 이력이 없어 "이 지역은 통상 감정가의 몇 %에 낙찰되는가"는 ' +
      '반영되지 않았다. 이 점수는 얼마나 싸졌는지까지만 말한다.'
  )

  // 축 점수의 합과 총점이 다른 이유(환산)를 화면이 설명할 수 있어야 한다.
  return { total, axes, scorable, caveats, attainable }
}

/**
 * 점수가 매겨지는 물건만 골라 높은 순으로 세운다.
 *
 * 점수를 못 매기는 물건을 0점으로 섞지 않는 것이 핵심이다 —
 * "잴 수 없음"과 "나쁨"은 다르고, 섞으면 사용자가 후자로 읽는다.
 */
export function rankAuctions(items, marketStats) {
  return items
    .map((item) => ({ item, score: scoreAuction(item, marketStats) }))
    .filter((r) => r.score.scorable)
    .sort((a, b) => b.score.total - a.score.total)
}
