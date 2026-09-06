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

/**
 * "2026/09/14" 같은 온비드 날짜 문자열이 이미 지났는지.
 * 형식이 다르거나 파싱이 안 되면 false로 둔다 — 모르는 것을 "지났다"고
 * 단정하면 배분요구 확정 여부를 잘못 알려주게 된다.
 */
const isPastDate = (raw: string): boolean => {
  const t = Date.parse(raw.replace(/\//g, '-'))
  return Number.isFinite(t) && t < Date.now()
}

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
  /**
   * 매각이 아니라 임대로 나온 물건(실측 2,705건).
   * 감정가·최저입찰가가 매매가가 아니라 임대료라, 취득세나 매매 시세 비교를
   * 그대로 얹으면 숫자가 통째로 거짓이 된다.
   */
  const rental = item.disposal === '임대'

  // ── 이 물건이 매각인지 임대인지부터 ─────────────────────
  // 실측 69,753건 중 2,705건이 임대다. 목록에서는 매각 물건과 나란히 보이는데
  // 감정가·최저입찰가의 뜻이 아예 달라(매매가가 아니라 임대료), 모르고 보면
  // "평당 41만원 아파트"처럼 읽힌다. 실제로 그렇게 나왔다.
  if (rental) {
    out.push({
      kind: 'warning',
      label: '매각이 아니라 임대 물건',
      basis:
        '소유권을 사는 것이 아니라 사용권을 빌리는 입찰이다. 표시된 감정가와 ' +
        '최저입찰가는 매매가가 아니라 임대료이므로, 매매 시세 비교나 취득세 ' +
        '계산을 적용하지 않았다. 임대 기간·갱신 조건·원상복구 의무는 공고문에서 확인해야 한다.',
      emphasis: true,
    })
  }

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
  if (!rental && cmp && own && own.count >= MIN_SAMPLE && own.median_per_pyeong > 0 && pyeong > 0 && priced) {
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
  } else if (!rental && cmp && priced && pyeong > 0) {
    out.push({
      kind: 'unknown',
      label: '시세 비교 불가',
      basis: `같은 시군구 ${PROPERTY_LABELS[cmp]} 실거래 표본이 ${MIN_SAMPLE}건 미만이라 비교 기준을 만들 수 없다.`,
    })
  } else if (!rental && priced && pyeong > 0) {
    out.push({
      kind: 'unknown',
      label: '시세 비교 불가',
      basis:
        '토지·상가 등은 용도지역·맹지 여부·상권처럼 개별 요인이 가격을 좌우해, ' +
        '시군구 평균과 비교하면 오히려 오해를 만든다. 감정평가 실무도 토지는 공시지가기준법을 쓴다.',
    })
  }

  // ── 지표 3: 취득 부대비용 개산 ───────────────────────────
  // 임대 물건에는 취득세가 없다. 임대료에 취득세율을 곱한 값은 아무 뜻이 없다.
  if (priced && !rental) {
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

  // ── 배분요구종기일 ───────────────────────────────────────
  // 경공매 서비스들이 권리분석에서 가장 먼저 짚는 날짜다. 임차인이 이 날까지
  // 배분요구를 했는지에 따라 보증금이 배분으로 소멸하는지, 낙찰자가 인수하는지가
  // 갈린다(국세징수법상 공매의 배분요구 종기). 우리 데이터에 이 날짜는 있지만
  // "누가 배분요구를 했는가"는 없다 — 날짜만 짚고 판정은 하지 않는다.
  if (item.distribution_deadline) {
    const past = isPastDate(item.distribution_deadline)
    out.push({
      kind: 'unknown',
      label: `배분요구종기일 ${item.distribution_deadline}`,
      basis:
        (past
          ? '이미 지났다. 배분요구 여부가 확정됐으므로 공매재산명세서의 ' +
            '"배분요구 및 채권신고 현황"에서 임차인이 배분요구를 했는지 확인할 수 있다. '
          : '아직 지나지 않았다. 배분요구 현황이 확정되지 않아 인수 여부를 지금 판단할 수 없다. ') +
        '대항력 있는 임차인(전입신고가 말소기준권리보다 빠른 경우)이 배분요구를 하지 않았거나 ' +
        '배분에서 보증금을 다 못 받으면, 그 차액을 낙찰자가 떠안는다. 낙찰가 외에 ' +
        '수천만 원이 더 드는 가장 흔한 경로다.',
      emphasis: !past,
    })
  }

  // ── 재산유형에 따라 권리분석의 근거 법령이 다르다 ────────
  // 압류재산은 국세징수법에 따른 체납처분 절차라 등기상 권리의 소멸·인수가
  // 법으로 정해지지만, 신탁·기타일반재산은 공고문의 인수조건이 곧 계약조건이다.
  // 같은 "공매"로 묶여 보이지만 확인해야 할 문서가 다르다.
  if (item.prpt_div === '압류재산') {
    out.push({
      kind: 'unknown',
      label: '압류재산 — 국세징수법 절차',
      basis:
        '세금 체납으로 압류된 재산을 캠코가 대행 매각하는 건이다. 말소기준권리보다 ' +
        '뒤에 설정된 권리는 소멸하고 앞선 권리는 인수한다 — 판단 근거는 등기부등본과 ' +
        '공매재산명세서다. 법원경매와 달리 인도명령이 없어 명도는 협의 또는 소송으로만 된다.',
    })
  } else if (item.prpt_div === '기타일반재산') {
    out.push({
      kind: 'unknown',
      label: '신탁·기타일반재산 — 공고문이 계약조건',
      basis:
        '신탁회사나 금융기관이 담보물을 처분하는 건이 대부분이다. 압류재산과 달리 ' +
        '국세징수법의 소멸·인수 규칙이 그대로 적용되지 않고, 공고문에 적힌 인수조건이 ' +
        '곧 계약조건이 된다. 임차인·유치권 인수 여부를 반드시 공고문 원문에서 확인해야 한다.',
    })
  }

  // ── 드문 입찰 조건은 그 자체가 제약이다 ──────────────────
  // 실측 69,753건 중 일반경쟁 53,570 / 제한경쟁 3 / 지명경쟁 2,
  // 전자입찰 53,563 / 현장입찰 12. 드물기 때문에 모르고 갔다가 못 넣는다.
  if (item.bid_method && item.bid_method !== '일반경쟁') {
    out.push({
      kind: 'warning',
      label: `${item.bid_method} 물건`,
      basis:
        '누구나 입찰할 수 있는 물건이 아니다. 공고문이 정한 자격(지역·업종·자격증 등)을 ' +
        '갖춰야 하며, 자격 없이 넣은 입찰은 무효 처리된다.',
      emphasis: true,
    })
  }
  if (item.bid_div === '현장입찰') {
    out.push({
      kind: 'warning',
      label: '현장입찰',
      basis:
        '온비드 전자입찰이 아니라 지정된 장소에 직접 가서 입찰해야 한다. ' +
        '시간과 지참 서류를 공고문에서 확인해야 하며, 온라인으로는 참여할 수 없다.',
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
