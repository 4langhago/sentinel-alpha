import { Link } from 'react-router-dom'
import {
  TradeItem,
  RegionStats,
  baselinePerPyeong,
  formatPrice,
  toPyeong,
  PROPERTY_LABELS,
} from '../types/trade'

interface Props {
  items: TradeItem[]
  /** 같은 지역 통계. 주어지면 같은 종목 중위 평당가와 비교해 싼지/비싼지 표시한다. */
  stats?: Pick<RegionStats, 'median_per_pyeong' | 'per_property'>
}

/**
 * 데스크톱 조밀 테이블 뷰. 여러 거래의 가격·평당가를 세로로 정렬해
 * 한눈에 비교할 수 있게 한다(카드 그리드는 비교 과업에 취약하다).
 * 행 높이 44~48px, 헤더 sticky. 숫자 컬럼은 우정렬 + tabular-nums.
 */
const TradeTable = ({ items, stats }: Props) => {
  const th = (align: 'left' | 'right' = 'left') =>
    `px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap ${
      align === 'right' ? 'text-right' : 'text-left'
    }`

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/60 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90 dark:supports-[backdrop-filter]:bg-slate-900/70 border-b border-slate-100 dark:border-slate-700">
            <tr>
              <th className={th()}>단지명</th>
              <th className={th()}>지역</th>
              <th className={th('right')}>전용면적</th>
              <th className={th('right')}>층</th>
              <th className={th('right')}>거래일</th>
              <th className={th('right')}>거래금액</th>
              <th className={th('right')}>평당가</th>
              <th className={th('right')}>지역 중위 대비</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
            {items.map((item) => {
              const isRent = item.deal_type === 'RENT'
              const pyeong = toPyeong(item.area)
              // 같은 종목의 중위 평당가와 비교한다 (상가·토지는 아파트와 스케일이 다르다).
              const medianPerPyeong = baselinePerPyeong(stats, item.property_type)
              const diffPct =
                !isRent && medianPerPyeong > 0 && item.price_per_pyeong > 0
                  ? Math.round(((item.price_per_pyeong - medianPerPyeong) / medianPerPyeong) * 100)
                  : null
              // 전월세는 보증금/월세 기준이라 평당가·중위 대비가 무의미하므로 카드와 동일하게 숨긴다.
              const showUnitPrice = !isRent && !item.share_deal

              return (
                <tr key={item.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                  <td className="px-3 py-2.5 h-11 max-w-[220px]">
                    <Link
                      to={`/complex/${encodeURIComponent(item.name)}`}
                      className="font-bold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 truncate block"
                    >
                      {item.name}
                    </Link>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {PROPERTY_LABELS[item.property_type] || item.property_type}
                      {isRent && (item.rent_type === 'JEONSE' ? ' · 전세' : ' · 월세')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap truncate max-w-[140px]">
                    {item.region_name} {item.umd}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                    {item.area}㎡ ({pyeong}평)
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                    {item.property_type !== 'LAND' && item.floor > 0 ? `${item.floor}층` : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                    {item.deal_date}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                    <span className="font-black text-slate-900 dark:text-white">{formatPrice(item.price)}</span>
                    {isRent && item.monthly_rent > 0 && (
                      <span className="text-indigo-600 dark:text-indigo-400 text-xs ml-1">
                        /{Math.round(item.monthly_rent / 10000)}만
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                    {showUnitPrice ? `${Math.round(item.price_per_pyeong / 10000).toLocaleString()}만원` : '–'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {showUnitPrice && diffPct !== null ? (
                      <span
                        className={`inline-block text-xs font-semibold rounded px-1.5 py-0.5 ${
                          diffPct > 0
                            ? 'text-data-up bg-data-up-soft dark:bg-data-up/10'
                            : diffPct < 0
                            ? 'text-data-down bg-data-down-soft dark:bg-data-down/10'
                            : 'text-data-neutral bg-slate-100 dark:bg-slate-700'
                        }`}
                      >
                        {diffPct > 0 ? '+' : ''}
                        {diffPct}%
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">–</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default TradeTable
