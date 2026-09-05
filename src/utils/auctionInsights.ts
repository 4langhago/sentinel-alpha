// 공매 물건의 투자 판단 참고 지표와 경고.
//
// ── 이 파일이 하지 않는 것 ────────────────────────────────────
// 점수를 매기거나 등급을 부여하지 않고, "사라" "사지 마라"를 말하지 않는다.
// 조사 결과 "시세 대비 몇 % 이하면 싸다"는 업계 표준 기준선은 **존재하지 않았다**.
// 없는 기준으로 점수를 만들면 임의의 가중치가 사용자에게는 객관적 판단처럼 보인다.
// 돈을 거는 결정이라 그 착시가 실제 피해로 이어진다.
//
// 대신 (1) 원본 사실 (2) 우리가 계산한 지표(계산식을 함께) (3) 데이터로 확인되는
// 경고 (4) 데이터로는 알 수 없어 반드시 직접 확인해야 하는 것 — 넷을 구분해 보여준다.
//
// ── 근거 ──────────────────────────────────────────────────
// 경공매 전문가 기준 조사(2026-08-31)에서 확인된 것 중, 우리가 가진 데이터로
// 실제 계산 가능한 항목만 구현했다. 계산 불가한 것(권리분석·명도 난이도 등)은
// 절대 추정하지 않고 "확인 필요"로만 띄운다.
import { AuctionItem } from '../types/auction'
import { PROPERTY_LABELS, toPyeong } from '../types/trade'
import type { PropertyType, RegionStats } from '../types/trade'

/** 시세 비교에 최소한 필요한 실거래 표본 수. 적으면 중위값이 극단치에 흔들린다. */
const MIN_SAMPLE = 5

/**
 * 시세 비교가 의미 있는 종목.
 * 토지·상가는 개별 요인(용도지역·맹지·상권·공실)이 가격을 좌우해 시군구
 * 중위값과 비교하는 것 자체가 오해를 만든다. 감정평가 실무에서도 토지는
 * 공시지가기준법을 쓰지 거래사례 비교를 우선하지 않는다.
 */
const COMPARABLE = new Set<PropertyType>(['APARTMENT', 'OFFICETEL'])

export interface Insight {
  /** 지표(계산된 값) / 경고(데이터로 확인됨) / 확인필요(데이터로 알 수 없음) */
  kind: 'metric' | 'warning' | 'unknown'
  label: string
  /** 표시할 값. 지표에만 있다. */
  value?: string
  /** 왜 이 값인지 — 계산식이나 근거. 사용자가 숫자를 검증할 수 있어야 한다. */
  basis: string
  /** 주의를 끌어야 하는 항목인지 */
  emphasis?: boolean
}

/** 취득세율(%). 2026년 기준, 지방교육세·농특세는 별도라 개산치임을 명시한다. */
const ACQUISITION_TAX = { housing: 1.1, other: 4.6 }

const won = (n: number): string => {
  if (n >= 100_000_000) {
    const eok = Math.floor(n / 100_000_000)
    const man = Math.round((n % 100_000_000) / 10_000)
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`
  }
  return `${Math.round(n / 10_000).toLocaleString()}만원`
}

/**
 * 물건 하나에 대한 참고 지표와 경고를 만든다.
 *
 * @param item 공매 물건
 * @param marketStats 같은 시군구 실거래 통계. 없으면 시세 비교를 건너뛴다.
 */
export function buildInsights(
  item: AuctionItem,
  marketStats?: Pick<RegionStats, 'per_property'>
): Insight[] {
  const out: Insight[] = []
  const sqm = item.area > 0 ? item.area : item.land_area
  const pyeong = sqm > 0 ? toPyeong(sqm) : 0
  const priced = item.min_bid_price > 0 && !item.min_bid_undisclosed

  // ── 지표 1: 체감률과 남은 하락 여지 ──────────────────────
  if (item.discount_rate !== null && item.fail_count > 0) {
    out.push({
      kind: 'metric',
      label: '누적 하락',
      value: `감정가의 ${item.discount_rate}%`,
      basis: `${item.fail_count}회 유찰. 온비드 압류재산은 통상 유찰 1회당 최저가가 10%씩 저감된다.`,
    })
  }

  // ── 지표 2: 시세 대비 (우리 고유 지표) ───────────────────
  const cmp = COMPARABLE.has(item.property_type as PropertyType)
    ? (item.property_type as PropertyType)
    : null
  const own = cmp ? marketStats?.per_property?.[cmp] : undefined
  if (cmp && own && own.count >= MIN_SAMPLE && own.median_per_pyeong > 0 && pyeong > 0 && priced) {
    const perPyeong = Math.round(item.min_bid_price / pyeong)
    const diff = Math.round(((perPyeong - own.median_per_pyeong) / own.median_per_pyeong) * 100)
    out.push({
      kind: 'metric',
      label: `${PROPERTY_LABELS[cmp]} 시세 대비`,
      value: `${diff > 0 ? '+' : ''}${diff}%`,
      basis:
        `이 물건 평당 ${won(perPyeong)} vs 같은 시군구 ${PROPERTY_LABELS[cmp]} 실거래 ` +
        `${own.count}건의 중위 평당 ${won(own.median_per_pyeong)}. ` +
        `층·향·연식·권리관계는 반영되지 않은 단순 비교다.`,
      emphasis: diff < -20,
    })
  } else if (cmp && priced && pyeong > 0) {
    out.push({
      kind: 'unknown',
      label: '시세 비교 불가',
      basis: `같은 시군구 ${PROPERTY_LABELS[cmp]} 실거래 표본이 ${MIN_SAMPLE}건 미만이라 비교 기준을 만들 수 없다.`,
    })
  } else if (priced && pyeong > 0) {
    out.push({
      kind: 'unknown',
      label: '시세 비교 불가',
      basis:
        '토지·상가 등은 용도지역·맹지 여부·상권처럼 개별 요인이 가격을 좌우해, ' +
        '시군구 평균과 비교하면 오히려 오해를 만든다. 감정평가 실무도 토지는 공시지가기준법을 쓴다.',
    })
  }

  // ── 지표 3: 취득 부대비용 개산 ───────────────────────────
  if (priced) {
    const housing = item.use_mcls === '주거용건물'
    const rate = housing ? ACQUISITION_TAX.housing : ACQUISITION_TAX.other
    const tax = Math.round(item.min_bid_price * (rate / 100))
    out.push({
      kind: 'metric',
      label: '취득세 개산',
      value: `약 ${won(tax)}`,
      basis:
        `최저입찰가 × ${rate}% (${housing ? '주택 1주택 기준' : '비주택'}). ` +
        '다주택·조정지역이면 최대 12%까지 오른다. 등기비·명도비·수리비는 별도다.',
    })
  }

  // ── 경고: 데이터로 확인되는 것만 ─────────────────────────
  if (item.share_deal) {
    out.push({
      kind: 'warning',
      label: '지분 매각',
      basis:
        '지분만 낙찰받으면 단독으로 처분·개발할 수 없다. 공유자와 협의하거나 ' +
        '공유물분할청구소송을 거쳐야 해 장기화된다. 싸 보이는 이유가 여기인 경우가 많다.',
      emphasis: true,
    })
  }

  // 온비드 원문은 "낙찰인이 명도 책임을 진다"는 같은 사실을 여러 표기로 쓴다.
  // 수집된 전체 샤드 실측(2026-09-05): 매수자 33,851 / 매수인 33,147 /
  // 낙찰자 9,193 / 낙찰자(매수자) 36. 셋 다 같은 사람을 가리키므로 함께 잡는다.
  // 매도자·임차인·공고기관처럼 책임 주체가 낙찰인이 아닌 값은 의도적으로 제외한다.
  const eviction = item.eviction_responsibility || ''
  if (/매수(자|인)|낙찰자/.test(eviction)) {
    out.push({
      kind: 'warning',
      label: `명도책임: ${eviction}`,
      basis:
        '공매는 법원경매와 달리 인도명령 제도가 없다. 점유자와 협의가 안 되면 ' +
        '처음부터 명도소송(통상 5~6개월)을 해야 하며 그 비용과 기간은 낙찰자 부담이다.',
      emphasis: true,
    })
  } else if (/상이|기타사항/.test(eviction)) {
    // "물건별상이(기타사항참조)" 4,126건. 책임 주체를 데이터로 판정할 수 없다는
    // 뜻이므로, 경고로 단정하지도 침묵하지도 않고 확인 필요로 넘긴다.
    out.push({
      kind: 'unknown',
      label: '명도책임 확인 필요',
      basis:
        `원문: ${eviction}. 명도 책임이 물건마다 달라 공고문 기타사항을 직접 봐야 한다. ` +
        '낙찰인 부담으로 판명되면 인도명령 없이 명도소송(통상 5~6개월)을 감수해야 한다.',
    })
  }

  if (item.min_bid_undisclosed) {
    out.push({
      kind: 'warning',
      label: '최저입찰가 비공개',
      basis: '온비드가 최저입찰가를 공개하지 않은 물건이다. 원문에서 직접 확인해야 한다.',
    })
  }

  if (item.discount_rate !== null && item.discount_rate <= 30) {
    out.push({
      kind: 'warning',
      label: '과도한 저감',
      basis:
        `감정가의 ${item.discount_rate}%까지 떨어졌다. 유찰이 반복되는 물건은 ` +
        '권리관계·명도·물건 자체에 시장이 기피하는 이유가 있는 경우가 많다.',
      emphasis: true,
    })
  }

  // ── 확인 필요: 데이터로는 알 수 없는 것 ──────────────────
  out.push({
    kind: 'unknown',
    label: '권리관계 확인 필요',
    basis:
      '선순위 임차인·유치권·법정지상권 등은 등기부등본과 공매재산명세서를 직접 ' +
      '봐야 알 수 있다. 이 화면의 데이터로는 판정할 수 없으며, 인수해야 할 권리가 ' +
      '있으면 낙찰가 외에 추가 부담이 생긴다.',
  })

  if (item.appraisal_price > 0) {
    out.push({
      kind: 'unknown',
      label: '감정 시점 확인 필요',
      basis:
        '공매 감정평가는 통상 1회차 매각기일보다 6개월 이상 앞서 이뤄진다. ' +
        '하락장이면 감정가가 현재 시세보다 높게 남아 "싸 보이는 착시"를 만들고, ' +
        '상승장이면 반대다. 체감률만 보고 판단하면 안 되는 이유다.',
    })
  }

  return out
}
