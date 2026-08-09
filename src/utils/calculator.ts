// 부동산 투자 수익 계산 유틸리티
export interface CalculatorInputs {
  /** 현재 시세 (실거래 중위가 등) */
  marketPrice: number
  /** 실제 매수가 */
  purchasePrice: number
  renovationCost: number
  acquisitionTax: number
  brokerageFee: number
  monthlyRent: number
  /** 공실률 % */
  vacancyRate: number
  managementFee: number
  /** 임대소득 세율 % */
  taxRate: number
}

export interface CalculatorResults {
  /** 매수가 + 부대비용 */
  totalInvestment: number
  /** 시세 - 총투자금 */
  expectedProfit: number
  profitRate: number
  /** 월 순수입 (공실·관리비 반영) */
  monthlyIncome: number
  /** 세후 연 수익률 % */
  annualYield: number
  /** 원금 회수까지 걸리는 개월 수 */
  breakEvenPoint: number
}

export const calculateInvestment = (inputs: CalculatorInputs): CalculatorResults => {
  const totalInvestment =
    inputs.purchasePrice + inputs.renovationCost + inputs.acquisitionTax + inputs.brokerageFee

  const effectiveRentRate = (100 - inputs.vacancyRate) / 100
  const monthlyNetIncome = inputs.monthlyRent * effectiveRentRate - inputs.managementFee
  const annualNetIncome = monthlyNetIncome * 12
  const afterTaxIncome = annualNetIncome * (1 - inputs.taxRate / 100)

  const expectedProfit = inputs.marketPrice - totalInvestment

  // 0으로 나누면 Infinity/NaN이 그대로 화면에 노출되므로 방어한다.
  const profitRate = totalInvestment > 0 ? (expectedProfit / totalInvestment) * 100 : 0
  const annualYield = totalInvestment > 0 ? (afterTaxIncome / totalInvestment) * 100 : 0
  const breakEvenPoint = monthlyNetIncome > 0 ? totalInvestment / monthlyNetIncome : 0

  return {
    totalInvestment,
    expectedProfit,
    profitRate,
    monthlyIncome: monthlyNetIncome,
    annualYield,
    breakEvenPoint,
  }
}

export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('ko-KR').format(Math.round(amount)) + '원'

export const formatPercent = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) + '%' : '-'
