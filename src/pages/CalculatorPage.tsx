import React, { useState } from 'react'
import { Calculator, TrendingUp, DollarSign, Home, Percent, Calendar, AlertCircle, Check, Search } from 'lucide-react'
import { calculateInvestment, formatCurrency, formatPercent, CalculatorInputs, CalculatorResults } from '../utils/calculator'
import RegionSelector from '../components/RegionSelector'
import AmountRangeSelector, { AmountRange } from '../components/AmountRangeSelector'
import auctionApi from '../services/auctionApi'

const CalculatorPage = () => {
  const [inputs, setInputs] = useState<CalculatorInputs>({
    propertyPrice: 650000000,
    auctionPrice: 500000000,
    renovationCost: 20000000,
    acquisitionTax: 15000000,
    brokerageFee: 5000000,
    monthlyRent: 2000000,
    vacancyRate: 5,
    managementFee: 100000,
    taxRate: 15
  })

  const [results, setResults] = useState<CalculatorResults | null>(null)
  const [selectedRegions, setSelectedRegions] = useState<string[]>(['ulsan'])
  const [investmentRange, setInvestmentRange] = useState<AmountRange>({ min: 0, max: 500000000 })
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const calculateResults = () => {
    setResults(calculateInvestment(inputs))
  }

  React.useEffect(() => {
    calculateResults()
  }, [inputs])

  const handleInputChange = (field: keyof CalculatorInputs, value: string | number) => {
    setInputs(prev => ({
      ...prev,
      [field]: typeof value === 'string' ? Number(value) || 0 : value
    }))
  }

  const handleSearchAuctions = async () => {
    setIsLoading(true)
    try {
      const result = await auctionApi.searchAuctions({
        regions: selectedRegions,
        amountRange: investmentRange
      })
      setSearchResults(result.items)
    } catch (error) {
      console.error('검색 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatYears = (value: number) => {
    return `${value.toFixed(1)}년`
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center space-x-2">
          <Calculator className="w-8 h-8 text-primary-600" />
          <span>투자 수익 계산기</span>
        </h2>
        <p className="text-gray-600">
          경매 물건의 투자 수익성을 정확하게 분석하세요
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Search Filters */}
        <div className="space-y-6">
          <div className="card">
            <RegionSelector 
              selectedRegions={selectedRegions}
              onRegionChange={setSelectedRegions}
            />
          </div>
          
          <div className="card">
            <AmountRangeSelector
              value={investmentRange}
              onChange={setInvestmentRange}
            />
          </div>
          
          <button
            onClick={handleSearchAuctions}
            disabled={isLoading || selectedRegions.length === 0}
            className="w-full btn btn-primary flex items-center justify-center space-x-2"
          >
            <Search className="w-5 h-5" />
            <span>{isLoading ? '검색 중...' : '경매 물건 검색'}</span>
          </button>
          
          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">검색 결과</h3>
              <div className="space-y-3">
                {searchResults.map((item) => (
                  <div key={item.id} className="p-3 border border-gray-200 rounded-lg hover:border-primary-300 transition-colors">
                    <div className="flex space-x-3">
                      <img
                        src={item.images && item.images.length > 0 ? item.images[0] : 'https://picsum.photos/seed/default-property/100/100.jpg'}
                        alt={item.description}
                        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.src = 'https://picsum.photos/seed/fallback-property/100/100.jpg'
                        }}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.address}</div>
                        <div className="text-sm text-gray-600">{item.description}</div>
                        <div className="text-sm font-medium text-primary-600 mt-1">
                          최저 입찰가: {formatCurrency(item.minimumBid)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Input Section */}
        <div className="space-y-6">
          {/* Property Information */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Home className="w-5 h-5 mr-2" />
              부동산 정보
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  시장 가치 (감정가)
                </label>
                <input
                  type="number"
                  value={inputs.propertyPrice}
                  onChange={(e) => handleInputChange('propertyPrice', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {formatCurrency(inputs.propertyPrice)}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  낙찰 예상가
                </label>
                <input
                  type="number"
                  value={inputs.auctionPrice}
                  onChange={(e) => handleInputChange('auctionPrice', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {formatCurrency(inputs.auctionPrice)}
                </div>
              </div>
            </div>
          </div>

          {/* Additional Costs */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <DollarSign className="w-5 h-5 mr-2" />
              추가 비용
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  리모델링 비용
                </label>
                <input
                  type="number"
                  value={inputs.renovationCost}
                  onChange={(e) => handleInputChange('renovationCost', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {formatCurrency(inputs.renovationCost)}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  취득세
                </label>
                <input
                  type="number"
                  value={inputs.acquisitionTax}
                  onChange={(e) => handleInputChange('acquisitionTax', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {formatCurrency(inputs.acquisitionTax)}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  중개수수료
                </label>
                <input
                  type="number"
                  value={inputs.brokerageFee}
                  onChange={(e) => handleInputChange('brokerageFee', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {formatCurrency(inputs.brokerageFee)}
                </div>
              </div>
            </div>
          </div>

          {/* Rental Information */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              임대 수익 정보
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  월 예상 임대료
                </label>
                <input
                  type="number"
                  value={inputs.monthlyRent}
                  onChange={(e) => handleInputChange('monthlyRent', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {formatCurrency(inputs.monthlyRent)}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  공실률 (%)
                </label>
                <input
                  type="number"
                  value={inputs.vacancyRate}
                  onChange={(e) => handleInputChange('vacancyRate', e.target.value)}
                  min="0"
                  max="100"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  월 관리비
                </label>
                <input
                  type="number"
                  value={inputs.managementFee}
                  onChange={(e) => handleInputChange('managementFee', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {formatCurrency(inputs.managementFee)}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  소득세율 (%)
                </label>
                <input
                  type="number"
                  value={inputs.taxRate}
                  onChange={(e) => handleInputChange('taxRate', e.target.value)}
                  min="0"
                  max="100"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {results && (
            <>
              {/* Summary */}
              <div className="card bg-gradient-to-r from-primary-600 to-primary-700 text-white">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  투자 요약
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>총 투자금액</span>
                    <span className="text-xl font-bold">
                      {formatCurrency(results.totalInvestment)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>예상 차익</span>
                    <span className={`text-xl font-bold ${results.expectedProfit >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      {formatCurrency(results.expectedProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>차익률</span>
                    <span className={`text-xl font-bold ${results.profitRate >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      {formatPercent(results.profitRate)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Detailed Results */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Percent className="w-5 h-5 mr-2" />
                  상세 분석
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b">
                    <div>
                      <div className="font-medium text-gray-900">월 순수익</div>
                      <div className="text-sm text-gray-500">공실률 및 관리비 반영</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary-600">
                        {formatCurrency(results.monthlyIncome)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center py-3 border-b">
                    <div>
                      <div className="font-medium text-gray-900">연간 수익률</div>
                      <div className="text-sm text-gray-500">세후 기준</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary-600">
                        {formatPercent(results.annualYield)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center py-3">
                    <div>
                      <div className="font-medium text-gray-900">회수 기간</div>
                      <div className="text-sm text-gray-500">투자금 회수까지</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary-600">
                        {formatYears(results.breakEvenPoint)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Investment Advice */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  투자 의견
                </h3>
                <div className="space-y-3">
                  {results.expectedProfit > 0 && results.profitRate > 10 && (
                    <div className="flex items-start space-x-2">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">우량 투자 기회</div>
                        <div className="text-sm text-gray-600">
                          예상 차익률이 10% 이상으로 매우 좋은 투자 기회입니다.
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {results.expectedProfit > 0 && results.profitRate > 5 && results.profitRate <= 10 && (
                    <div className="flex items-start space-x-2">
                      <Check className="w-5 h-5 text-blue-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">양호한 투자</div>
                        <div className="text-sm text-gray-600">
                          안정적인 수익을 기대할 수 있는 투자 기회입니다.
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {results.annualYield > 5 && (
                    <div className="flex items-start space-x-2">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">임대 수익성 우수</div>
                        <div className="text-sm text-gray-600">
                          연간 수익률이 5% 이상으로 임대 수익성이 좋습니다.
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {results.breakEvenPoint > 15 && (
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">회수 기간 주의</div>
                        <div className="text-sm text-gray-600">
                          투자금 회수 기간이 15년 이상으로 장기 투자가 필요합니다.
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {results.expectedProfit < 0 && (
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">투자 주의 필요</div>
                        <div className="text-sm text-gray-600">
                          예상 차익이 음수로 투자 손실이 예상됩니다.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CalculatorPage
