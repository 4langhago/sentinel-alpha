import { useEffect, useState } from 'react'
import { Calculator, TrendingUp, DollarSign, Home, Percent, Search, AlertCircle } from 'lucide-react'
import {
  calculateInvestment,
  formatCurrency,
  formatPercent,
  CalculatorInputs,
  CalculatorResults,
} from '../utils/calculator'
import { tradeApi } from '../services/tradeApi'
import { ComplexDetail, formatPrice } from '../types/trade'

const FIELDS: { key: keyof CalculatorInputs; label: string; unit: '원' | '%'; hint?: string }[] = [
  { key: 'marketPrice', label: '현재 시세', unit: '원', hint: '실거래 중위가를 불러올 수 있습니다' },
  { key: 'purchasePrice', label: '매수가', unit: '원' },
  { key: 'renovationCost', label: '수리비', unit: '원' },
  { key: 'acquisitionTax', label: '취득세', unit: '원' },
  { key: 'brokerageFee', label: '중개수수료', unit: '원' },
  { key: 'monthlyRent', label: '월 임대료', unit: '원' },
  { key: 'managementFee', label: '월 관리비', unit: '원' },
  { key: 'vacancyRate', label: '공실률', unit: '%' },
  { key: 'taxRate', label: '임대소득 세율', unit: '%' },
]

const CalculatorPage = () => {
  const [inputs, setInputs] = useState<CalculatorInputs>({
    marketPrice: 650_000_000,
    purchasePrice: 600_000_000,
    renovationCost: 20_000_000,
    acquisitionTax: 15_000_000,
    brokerageFee: 5_000_000,
    monthlyRent: 2_000_000,
    vacancyRate: 5,
    managementFee: 100_000,
    taxRate: 15,
  })
  const [results, setResults] = useState<CalculatorResults | null>(null)

  // 단지 시세 불러오기
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState<ComplexDetail | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    setResults(calculateInvestment(inputs))
  }, [inputs])

  const setField = (key: keyof CalculatorInputs, value: string) =>
    setInputs((prev) => ({ ...prev, [key]: Number(value.replace(/[^0-9.]/g, '')) || 0 }))

  const loadComplex = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = keyword.trim()
    if (!name) return
    setLoading(true)
    setLoadError('')
    const detail = await tradeApi.complex(name)
    setLoading(false)
    if (!detail) {
      setLoaded(null)
      setLoadError(`'${name}' 거래 내역을 찾을 수 없습니다. 단지명을 정확히 입력해 보세요.`)
      return
    }
    setLoaded(detail)
    // 중위 실거래가를 시세·매수가 기준값으로 채운다.
    setInputs((prev) => ({
      ...prev,
      marketPrice: detail.median_price,
      purchasePrice: detail.median_price,
    }))
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mb-2 flex items-center justify-center gap-2">
          <Calculator className="w-7 h-7 text-violet-600" />
          투자 수익 계산기
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          실거래 시세를 기준으로 매수 후 임대 수익률을 계산합니다.
        </p>
      </div>

      {/* 단지 시세 불러오기 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
        <h2 className="font-bold text-gray-900 dark:text-white mb-3">단지 시세로 채우기</h2>
        <form onSubmit={loadComplex} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="단지명 입력 (예: 은마, 반포자이)"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60"
          >
            {loading ? '조회 중...' : '불러오기'}
          </button>
        </form>

        {loadError && (
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            {loadError}
          </p>
        )}
        {loaded && (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
            <span className="font-semibold">{loaded.name}</span> ({loaded.region_name}) 중위 실거래가{' '}
            <span className="font-semibold">{formatPrice(loaded.median_price)}</span>를 시세·매수가에
            채웠습니다.
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* 입력 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Home className="w-5 h-5 text-violet-600" />
            입력값
          </h2>
          <div className="space-y-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {f.label}
                  {f.hint && <span className="text-xs text-gray-400 font-normal ml-2">{f.hint}</span>}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={inputs[f.key].toLocaleString()}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    {f.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 결과 */}
        <div className="space-y-4">
          {results && (
            <>
              <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-6 text-white">
                <p className="text-white/70 text-sm mb-1">총 투자금</p>
                <p className="text-3xl font-black mb-4">{formatCurrency(results.totalInvestment)}</p>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
                  <div>
                    <p className="text-white/70 text-xs mb-0.5">시세 대비 손익</p>
                    <p className="text-lg font-bold">{formatCurrency(results.expectedProfit)}</p>
                  </div>
                  <div>
                    <p className="text-white/70 text-xs mb-0.5">손익률</p>
                    <p className="text-lg font-bold">{formatPercent(results.profitRate)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    label: '월 순수입',
                    value: formatCurrency(results.monthlyIncome),
                    Icon: DollarSign,
                    note: '공실·관리비 반영',
                  },
                  {
                    label: '세후 연 수익률',
                    value: formatPercent(results.annualYield),
                    Icon: Percent,
                    note: '총투자금 대비',
                  },
                  {
                    label: '원금 회수 기간',
                    value:
                      results.breakEvenPoint > 0
                        ? `${(results.breakEvenPoint / 12).toFixed(1)}년`
                        : '회수 불가',
                    Icon: TrendingUp,
                    note:
                      results.breakEvenPoint > 0 ? '임대 순수입 기준' : '월 순수입이 0 이하입니다',
                  },
                  {
                    label: '연 임대수입',
                    value: formatCurrency(results.monthlyIncome * 12),
                    Icon: DollarSign,
                    note: '세전',
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <c.Icon className="w-4 h-4 text-violet-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">{c.label}</p>
                    </div>
                    <p className="text-xl font-black text-gray-900 dark:text-white">{c.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{c.note}</p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                취득세·중개수수료는 직접 입력한 값을 그대로 사용합니다. 실제 세율은 주택 수·가격
                구간에 따라 달라지므로 참고용으로만 사용하세요.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CalculatorPage
