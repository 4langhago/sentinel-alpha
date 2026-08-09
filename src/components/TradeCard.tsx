import { Link } from 'react-router-dom'
import { Building2, MapPin, Calendar, Layers, Ruler } from 'lucide-react'
import { TradeItem, formatPrice, toPyeong, PROPERTY_LABELS } from '../types/trade'

interface Props {
  item: TradeItem
  /** 같은 지역 중위 평당가. 주어지면 상대적으로 싼지/비싼지 표시한다. */
  medianPerPyeong?: number
}

const TradeCard = ({ item, medianPerPyeong }: Props) => {
  const isRent = item.deal_type === 'RENT'
  const pyeong = toPyeong(item.area)

  // 지역 중위 평당가 대비 편차 (매매만 의미 있음)
  const diffPct =
    !isRent && medianPerPyeong && medianPerPyeong > 0 && item.price_per_pyeong > 0
      ? Math.round(((item.price_per_pyeong - medianPerPyeong) / medianPerPyeong) * 100)
      : null

  return (
    <Link
      to={`/complex/${encodeURIComponent(item.name)}`}
      className="group block bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 hover:shadow-lg hover:border-violet-200 dark:hover:border-violet-500/40 transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
            {item.name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {item.region_name} {item.umd}
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2 py-1">
          <Building2 className="w-3 h-3" />
          {PROPERTY_LABELS[item.property_type] || item.property_type}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-3">
        <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white whitespace-nowrap">
          {formatPrice(item.price)}
        </span>
        {isRent ? (
          <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            {item.rent_type === 'JEONSE' ? '전세' : `월세 ${Math.round(item.monthly_rent / 10000)}만원`}
          </span>
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">매매</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1">
          <Ruler className="w-3.5 h-3.5" />
          {item.area}㎡ ({pyeong}평)
        </span>
        {/* 토지는 층 개념이 없다 */}
        {item.property_type !== 'LAND' && item.floor > 0 && (
          <span className="inline-flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            {item.floor}층
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {item.deal_date}
        </span>
        {item.build_year > 0 && <span>{item.build_year}년 준공</span>}
        {item.use_type && (
          <span className="inline-block bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5 text-[11px]">
            {item.use_type}
          </span>
        )}
        {item.dealing_type && (
          <span className="inline-block bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5 text-[11px]">
            {item.dealing_type}
          </span>
        )}
        {item.share_deal && (
          <span className="inline-block bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5 text-[11px]">
            지분거래
          </span>
        )}
      </div>

      {/* 전월세는 보증금/월세 기준이라 평당가·중위 대비 비교가 의미 없으므로 매매에만 표시한다. */}
      {!isRent && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {item.property_type === 'LAND' ? '평당(대지)' : '평당'}{' '}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {Math.round(item.price_per_pyeong / 10000).toLocaleString()}만원
            </span>
          </span>
          {diffPct !== null && !item.share_deal && (
            <span
              className={`text-xs font-semibold ${
                diffPct > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : diffPct < 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-400'
              }`}
            >
              지역 중위 대비 {diffPct > 0 ? '+' : ''}
              {diffPct}%
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

export default TradeCard
