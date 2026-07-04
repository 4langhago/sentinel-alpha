// 투자 계산 유틸리티
export interface CalculatorInputs {
  propertyPrice: number
  auctionPrice: number
  renovationCost: number
  acquisitionTax: number
  brokerageFee: number
  monthlyRent: number
  vacancyRate: number
  managementFee: number
  taxRate: number
}

export interface CalculatorResults {
  totalInvestment: number
  expectedProfit: number
  profitRate: number
  monthlyIncome: number
  annualYield: number
  breakEvenPoint: number
}

export const calculateInvestment = (inputs: CalculatorInputs): CalculatorResults => {
  const totalInvestment = inputs.auctionPrice + inputs.renovationCost + inputs.acquisitionTax + inputs.brokerageFee
  
  const effectiveRentRate = (100 - inputs.vacancyRate) / 100
  const monthlyNetIncome = inputs.monthlyRent * effectiveRentRate - inputs.managementFee
  const annualNetIncome = monthlyNetIncome * 12
  const afterTaxIncome = annualNetIncome * (1 - inputs.taxRate / 100)
  
  const expectedProfit = inputs.propertyPrice - totalInvestment
  const profitRate = (expectedProfit / totalInvestment) * 100
  const annualYield = (afterTaxIncome / totalInvestment) * 100
  const breakEvenPoint = totalInvestment / monthlyNetIncome

  return {
    totalInvestment,
    expectedProfit,
    profitRate,
    monthlyIncome: monthlyNetIncome,
    annualYield,
    breakEvenPoint
  }
}

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원'
}

export const formatPercent = (value: number): string => {
  return value.toFixed(2) + '%'
}
