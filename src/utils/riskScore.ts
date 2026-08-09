// 실거래 데이터 기반 리스크 스코어 산출 (규칙 기반. LLM/AI 추론 없음)
//
// 이 모듈은 단지의 거래 이력(TradeItem[])만으로 계산 가능한 4가지 요소를
// 가중합해 0~100 점의 "리스크 스코어"를 만든다. 점수가 높을수록 "현재 시세를
// 신뢰하기 어렵거나 최근 하락 압력이 크다"는 뜻이며, 투자 매력도 자체를
// 평가하는 지표가 아니다. 모든 임계값에는 근거를 주석으로 남긴다.

import { ComplexDetail } from '../types/trade'

export type RiskGrade = '낮음' | '보통' | '높음'

export interface RiskFactor {
  key: string
  /** 사용자에게 보여줄 근거 항목 제목 */
  label: string
  /** 왜 이 점수가 나왔는지 설명하는 문장 */
  detail: string
  /** 이 요소가 최종 점수에 실제로 기여한 점수(0~weight) */
  contribution: number
  /** 이 요소의 만점 가중치 */
  weight: number
  /** 데이터 부족 등으로 이 요소를 계산에서 제외했는지 여부 */
  skipped: boolean
}

export interface RiskScoreResult {
  /** 계산이 가능했는지 여부. false면 score/grade는 의미 없는 값이다. */
  available: boolean
  /** 0~100. 높을수록 시세 신뢰도가 낮거나 하락 압력이 크다는 뜻 */
  score: number
  grade: RiskGrade
  factors: RiskFactor[]
  /** available=false일 때 사용자에게 보여줄 안내 문구 */
  message?: string
}

/** 최소 표본 크기. 국토부 실거래가는 동일 단지·동일 면적이어도 3건 미만이면
 * 특정 거래(급매/증여성 거래 등)의 영향이 지나치게 커서 "중위가"라는 개념 자체가
 * 통계적으로 불안정하다고 보고, 점수를 만들어내지 않는다. */
const MIN_SAMPLE_SIZE = 3

/** 변동성/고점 대비 하락률 계산에 필요한 최소 관측월 수. 월별 포인트가 2개면
 * "지난달 대비 이번달 등락" 단 한 번의 비교일 뿐이라 그 한 번의 차이를
 * "변동성"이나 "하락 추세"로 부르는 것은 과한 해석이다. 최소 3개월(등락이
 * 최소 2번 관측되는 시점)부터 추세라고 부를 최소한의 근거가 생긴다고 보았다. */
const MIN_MONTHS_FOR_TREND = 3

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const gradeOf = (score: number): RiskGrade => {
  // 3등분. 0~33 / 34~66 / 67~100 의 단순 삼분위 경계로, 특정 단지 표본에
  // 맞춰 임의로 조정하지 않고 고정된 절대 기준을 사용한다.
  if (score <= 33) return '낮음'
  if (score <= 66) return '보통'
  return '높음'
}

/** 월별 중위 평당가 시계열을 만든다 (ComplexPage.buildTrend와 동일한 방식). */
const monthlyMedianPerPyeong = (detail: ComplexDetail): { month: string; median: number }[] => {
  const byMonth = new Map<string, number[]>()
  for (const h of detail.history) {
    if (h.deal_type !== 'TRADE' || h.price_per_pyeong <= 0 || h.share_deal) continue
    const ym = h.deal_date.slice(0, 7)
    if (!byMonth.has(ym)) byMonth.set(ym, [])
    byMonth.get(ym)!.push(h.price_per_pyeong)
  }
  const median = (nums: number[]) => {
    const s = [...nums].sort((a, b) => a - b)
    const m = s.length >> 1
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  return [...byMonth.entries()]
    .map(([month, vals]) => ({ month, median: median(vals) }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * 단지 상세(ComplexDetail)를 받아 리스크 스코어를 계산한다.
 * 표본이 부족하면 점수를 만들지 않고 available: false 를 반환한다.
 */
export const computeRiskScore = (detail: ComplexDetail): RiskScoreResult => {
  const trades = detail.history.filter(
    (h) => h.deal_type === 'TRADE' && h.price_per_pyeong > 0 && !h.share_deal
  )

  if (trades.length < MIN_SAMPLE_SIZE) {
    // 상단 요약 카드의 "매매 거래 N건"(detail.trade_count)은 전체 이력 기준 통계이고,
    // 여기서 쓰는 detail.history는 백엔드가 최근 항목만 잘라 보낸 배열이라(예: 최근 50건)
    // 그 안에 매매가 몇 건 남았는지는 다를 수 있다. 두 숫자를 그대로 나란히 보여주면
    // "요약엔 15건인데 왜 부족하다는거냐"는 모순으로 읽히므로, 어떤 모집단을 기준으로
    // 부족하다고 말하는 것인지 문구에 명시한다.
    const historySize = detail.history.length
    const totalTradeCount = detail.trade_count
    const message =
      totalTradeCount > trades.length
        ? `최근 이력 ${historySize}건 중 매매는 ${trades.length}건뿐이라 스코어를 산출할 수 없습니다. ` +
          `(전체 누적 매매는 ${totalTradeCount}건이지만, 최근 이력에는 전월세 거래 비중이 높아 표본에 포함되지 않았습니다.)`
        : `매매 거래가 ${trades.length}건뿐이라 스코어를 산출할 수 없습니다. (최소 ${MIN_SAMPLE_SIZE}건 필요)`
    return {
      available: false,
      score: 0,
      grade: '보통',
      factors: [],
      message,
    }
  }

  const factors: RiskFactor[] = []
  const monthly = monthlyMedianPerPyeong(detail)

  // ── 1. 거래량 부족 리스크 (가중치 30) ─────────────────────────────
  // 국토부 실거래가는 표본이 적을수록 특정 거래(고가/급매)에 중위가가 휘둘린다.
  // 20건 이상이면 계절/개별 변수의 영향이 충분히 상쇄된다고 보고 리스크 0,
  // 최소 표본 기준선(3건)에서는 만점(30)을 부여해 선형 보간한다.
  //
  // 이 요소는 "실제로 이 단지에 매매가 얼마나 있었는가"를 묻는 것이므로
  // detail.trade_count(전체 누적 매매 건수)를 우선 사용한다. detail.history는
  // 백엔드가 최근 항목만 잘라 보낸 배열이라(예: 최근 50건) 그 안에 남은 매매
  // 건수만 세면, 실제로는 거래가 충분한 단지도 전월세 비중이 높은 최근 구간
  // 때문에 표본이 적어 보이는 왜곡이 생긴다. trade_count가 없거나 0이면
  // (구버전 응답 등) history 기준으로 폴백하고 그 사실을 문구에 남긴다.
  {
    const usingFullCount = detail.trade_count > 0
    const count = usingFullCount ? detail.trade_count : trades.length
    const FULL_RISK_AT = MIN_SAMPLE_SIZE // 3건: 만점 리스크
    const ZERO_RISK_AT = 20 // 20건 이상: 리스크 0으로 간주
    const ratio = clamp((ZERO_RISK_AT - count) / (ZERO_RISK_AT - FULL_RISK_AT), 0, 1)
    const contribution = Math.round(ratio * 30)
    const scopeNote = usingFullCount ? '' : ' (최근 이력 기준)'
    factors.push({
      key: 'volume',
      label: '거래량',
      detail:
        count >= ZERO_RISK_AT
          ? `매매 ${count}건으로 표본이 충분해 시세 신뢰도가 높습니다${scopeNote}.`
          : `매매 ${count}건은 기준(20건) 대비 적어 중위가가 개별 거래에 흔들리기 쉽습니다${scopeNote}.`,
      contribution,
      weight: 30,
      skipped: false,
    })
  }

  // ── 2. 최근 가격 변동성 (가중치 30) ────────────────────────────────
  // 월별 중위 평당가의 변동계수(표준편차/평균)로 측정한다. 관측월이
  // MIN_MONTHS_FOR_TREND(3개월) 미만이면 "등락 한 번"에 불과해 변동성이라
  // 부를 근거가 부족하므로 이 요소는 건너뛴다.
  // 국내 아파트 평당가는 통상 월간 5% 내외로 등락하며, 15% 이상 벌어지면
  // 정상적인 시세 흐름보다 이상치(허위/특수관계 거래 혼입 등)일 가능성이
  // 커진다고 보고 15%를 만점 기준으로 잡았다.
  {
    if (monthly.length < MIN_MONTHS_FOR_TREND) {
      factors.push({
        key: 'volatility',
        label: '가격 변동성',
        detail: `월별 거래가 ${monthly.length}개월분뿐이라 변동성을 판단하기엔 근거가 부족해 이 항목은 반영하지 않았습니다. (최소 ${MIN_MONTHS_FOR_TREND}개월 필요)`,
        contribution: 0,
        weight: 30,
        skipped: true,
      })
    } else {
      const vals = monthly.map((m) => m.median)
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      const variance = vals.reduce((a, b) => a + (b - avg) ** 2, 0) / vals.length
      const cv = avg > 0 ? Math.sqrt(variance) / avg : 0
      const CV_FULL_RISK = 0.15
      const ratio = clamp(cv / CV_FULL_RISK, 0, 1)
      const contribution = Math.round(ratio * 30)
      factors.push({
        key: 'volatility',
        label: '가격 변동성',
        detail: `최근 ${monthly.length}개월 평당가 변동폭이 평균 대비 약 ${Math.round(cv * 100)}%입니다 (기준: 15% 이상이면 높음).`,
        contribution,
        weight: 30,
        skipped: false,
      })
    }
  }

  // ── 3. 직전 고점 대비 하락률 (가중치 25) ───────────────────────────
  // 월별 중위 평당가 시계열에서의 최고점과 가장 최근 값을 비교한다.
  // 20% 이상 하락은 국내 아파트 시장에서 통상 "조정기"로 분류되는 수준이라
  // 이를 만점 기준으로 삼았다. 관측월이 MIN_MONTHS_FOR_TREND(3개월) 미만이면
  // "고점"이라 부를 만한 흐름 자체가 형성되지 않았다고 보아 반영하지 않는다.
  {
    if (monthly.length < MIN_MONTHS_FOR_TREND) {
      factors.push({
        key: 'decline',
        label: '고점 대비 하락률',
        detail: `관측된 월별 데이터가 ${monthly.length}개월분뿐이라 "고점"을 판단할 근거가 부족해 이 항목은 반영하지 않았습니다. (최소 ${MIN_MONTHS_FOR_TREND}개월 필요)`,
        contribution: 0,
        weight: 25,
        skipped: true,
      })
    } else {
      const peak = Math.max(...monthly.map((m) => m.median))
      const latest = monthly[monthly.length - 1].median
      const decline = peak > 0 ? (peak - latest) / peak : 0
      const DECLINE_FULL_RISK = 0.2
      const ratio = clamp(decline / DECLINE_FULL_RISK, 0, 1)
      const contribution = Math.round(ratio * 25)
      factors.push({
        key: 'decline',
        label: '고점 대비 하락률',
        detail:
          decline > 0
            ? `최근 평당가가 직전 고점 대비 약 ${Math.round(decline * 100)}% 낮습니다 (기준: 20% 이상이면 높음).`
            : '최근 평당가가 직전 고점 대비 하락하지 않았습니다.',
        contribution,
        weight: 25,
        skipped: false,
      })
    }
  }

  // ── 4. 준공 연차 (가중치 15) ───────────────────────────────────────
  // 준공 10년 이내는 노후화 리스크가 낮다고 보아 0점, 재건축 연한과
  // 맞물리는 30년 이상은 만점(15)으로 선형 보간한다. build_year가 없으면 제외.
  {
    const buildYear = detail.build_year
    if (!buildYear || buildYear <= 0) {
      factors.push({
        key: 'age',
        label: '준공 연차',
        detail: '준공 연도 정보가 없어 이 항목은 반영하지 않았습니다.',
        contribution: 0,
        weight: 15,
        skipped: true,
      })
    } else {
      const age = new Date().getFullYear() - buildYear
      const ZERO_RISK_AGE = 10
      const FULL_RISK_AGE = 30
      const ratio = clamp((age - ZERO_RISK_AGE) / (FULL_RISK_AGE - ZERO_RISK_AGE), 0, 1)
      const contribution = Math.round(ratio * 15)
      factors.push({
        key: 'age',
        label: '준공 연차',
        detail: `준공 ${age}년차입니다 (기준: 10년 이내 낮음 / 30년 이상 높음).`,
        contribution,
        weight: 15,
        skipped: false,
      })
    }
  }

  // 데이터 부족으로 제외된 요소는 분모(가중치 합)에서도 빼서 100점 만점으로 재환산한다.
  // 이렇게 하지 않으면 정보가 없다는 이유만으로 점수가 실제보다 낮게(안전하게) 나와
  // "근거 없는 안심"을 유발할 수 있기 때문이다.
  const used = factors.filter((f) => !f.skipped)
  const usedWeightSum = used.reduce((a, f) => a + f.weight, 0)
  const usedContribSum = used.reduce((a, f) => a + f.contribution, 0)
  const score = usedWeightSum > 0 ? Math.round((usedContribSum / usedWeightSum) * 100) : 0

  return {
    available: true,
    score,
    grade: gradeOf(score),
    factors,
  }
}
