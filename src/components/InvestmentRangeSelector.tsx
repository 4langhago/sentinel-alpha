import React from 'react'
import { DollarSign, TrendingUp } from 'lucide-react'

export interface InvestmentRange {
  min: number
  max: number
}

interface InvestmentRangeSelectorProps {
  value: InvestmentRange
  onChange: (range: InvestmentRange) => void
}

const INVESTMENT_RANGES = [
  { min: 0, max: 5000, label: '5천만원 이하' },
  { min: 5000, max: 10000, label: '5천만원 ~ 1억원' },
  { min: 10000, max: 20000, label: '1억원 ~ 2억원' },
  { min: 20000, max: 30000, label: '2억원 ~ 3억원' },
  { min: 30000, max: 50000, label: '3억원 ~ 5억원' },
  { min: 50000, max: 100000, label: '5억원 ~ 10억원' },
  { min: 100000, max: 200000, label: '10억원 이상' }
]

const formatCurrency = (amount: number): string => {
  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(0)}억원`
  }
  return `${(amount / 1000).toFixed(0)}천만원`
}

const InvestmentRangeSelector: React.FC<InvestmentRangeSelectorProps> = ({ value, onChange }) => {
  const handleRangeChange = (rangeIndex: number) => {
    const range = INVESTMENT_RANGES[rangeIndex]
    onChange({ min: range.min, max: range.max })
  }

  const isActiveRange = (range: { min: number; max: number }) => {
    return value.min === range.min && value.max === range.max
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <DollarSign className="w-5 h-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-gray-900">투자금액 범위</h3>
      </div>

      {/* Range Buttons */}
      <div className="space-y-2">
        {INVESTMENT_RANGES.map((range, index) => (
          <button
            key={index}
            onClick={() => handleRangeChange(index)}
            className={`w-full px-4 py-3 text-left rounded-lg border-2 transition-all duration-200 ${
              isActiveRange(range)
                ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{range.label}</span>
              <TrendingUp className="w-4 h-4 opacity-60" />
            </div>
          </button>
        ))}
      </div>

      {/* Custom Range Input */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-3">직접 입력</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">최소 금액</label>
            <input
              type="number"
              value={value.min}
              onChange={(e) => onChange({ ...value, min: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="최소 금액"
              min="0"
              step="1000"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">최대 금액</label>
            <input
              type="number"
              value={value.max}
              onChange={(e) => onChange({ ...value, max: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="최대 금액"
              min="0"
              step="1000"
            />
          </div>
        </div>
      </div>

      {/* Current Selection Display */}
      <div className="mt-4 p-3 bg-green-50 rounded-lg">
        <p className="text-sm text-green-700">
          선택된 범위: {formatCurrency(value.min)} ~ {formatCurrency(value.max)}
        </p>
      </div>
    </div>
  )
}

export default InvestmentRangeSelector
