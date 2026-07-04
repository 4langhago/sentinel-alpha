import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, DollarSign } from 'lucide-react'

export interface AmountRange {
  min: number
  max: number
}

interface AmountRangeSelectorProps {
  value: AmountRange
  onChange: (range: AmountRange) => void
}

const AMOUNT_OPTIONS = [
  // 1억 이하: 천만원 단위
  { value: 0, label: '0원' },
  { value: 10000000, label: '1천만원' },
  { value: 20000000, label: '2천만원' },
  { value: 30000000, label: '3천만원' },
  { value: 40000000, label: '4천만원' },
  { value: 50000000, label: '5천만원' },
  { value: 60000000, label: '6천만원' },
  { value: 70000000, label: '7천만원' },
  { value: 80000000, label: '8천만원' },
  { value: 90000000, label: '9천만원' },
  { value: 100000000, label: '1억원' },
  
  // 2억 이하: 5천만원 단위
  { value: 150000000, label: '1.5억원' },
  { value: 200000000, label: '2억원' },
  
  // 3억 이상: 1억 단위
  { value: 300000000, label: '3억원' },
  { value: 400000000, label: '4억원' },
  { value: 500000000, label: '5억원' },
  { value: 600000000, label: '6억원' },
  { value: 700000000, label: '7억원' },
  { value: 800000000, label: '8억원' },
  { value: 900000000, label: '9억원' },
  { value: 1000000000, label: '10억원' },
  { value: 1500000000, label: '15억원' },
  { value: 2000000000, label: '20억원' },
]

const AmountRangeSelector: React.FC<AmountRangeSelectorProps> = ({ value, onChange }) => {
  const [minDropdownOpen, setMinDropdownOpen] = useState(false)
  const [maxDropdownOpen, setMaxDropdownOpen] = useState(false)
  const minDropdownRef = useRef<HTMLDivElement>(null)
  const maxDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (minDropdownRef.current && !minDropdownRef.current.contains(event.target as Node)) {
        setMinDropdownOpen(false)
      }
      if (maxDropdownRef.current && !maxDropdownRef.current.contains(event.target as Node)) {
        setMaxDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getAmountLabel = (amount: number): string => {
    const option = AMOUNT_OPTIONS.find(opt => opt.value === amount)
    return option ? option.label : `${amount.toLocaleString()}원`
  }

  const handleMinAmountChange = (amount: number) => {
    // Ensure min is not greater than max
    if (amount <= value.max) {
      onChange({ ...value, min: amount })
    }
    setMinDropdownOpen(false)
  }

  const handleMaxAmountChange = (amount: number) => {
    // Ensure max is not less than min
    if (amount >= value.min) {
      onChange({ ...value, max: amount })
    }
    setMaxDropdownOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <DollarSign className="w-5 h-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-gray-900">청구액</h3>
      </div>

      <div className="space-y-4">
        {/* 최소 금액 선택 */}
        <div className="relative" ref={minDropdownRef}>
          <label className="block text-sm font-medium text-gray-700 mb-2">최소</label>
          <button
            type="button"
            onClick={() => setMinDropdownOpen(!minDropdownOpen)}
            className="w-full px-4 py-3 text-left bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 flex items-center justify-between hover:border-gray-400 transition-colors"
          >
            <span className="text-gray-900">{getAmountLabel(value.min)}</span>
            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${minDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {minDropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              <div className="py-1">
                {AMOUNT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleMinAmountChange(option.value)}
                    disabled={option.value > value.max}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-100 transition-colors ${
                      value.min === option.value ? 'bg-primary-50 text-primary-700 font-medium' : 
                      option.value > value.max ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 최대 금액 선택 */}
        <div className="relative" ref={maxDropdownRef}>
          <label className="block text-sm font-medium text-gray-700 mb-2">최대</label>
          <button
            type="button"
            onClick={() => setMaxDropdownOpen(!maxDropdownOpen)}
            className="w-full px-4 py-3 text-left bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 flex items-center justify-between hover:border-gray-400 transition-colors"
          >
            <span className="text-gray-900">{getAmountLabel(value.max)}</span>
            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${maxDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {maxDropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              <div className="py-1">
                {AMOUNT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleMaxAmountChange(option.value)}
                    disabled={option.value < value.min}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-100 transition-colors ${
                      value.max === option.value ? 'bg-primary-50 text-primary-700 font-medium' : 
                      option.value < value.min ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 현재 선택 범위 표시 */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-700">
          선택된 범위: {getAmountLabel(value.min)} ~ {getAmountLabel(value.max)}
        </p>
      </div>
    </div>
  )
}

export default AmountRangeSelector
