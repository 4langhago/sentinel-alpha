import { Link } from 'react-router-dom'
import { Building2, MapPin, Calendar, Layers, Ruler } from 'lucide-react'
import {
  TradeItem,
  RegionStats,
  baselinePerPyeong,
  formatArea,
  formatPrice,
  AreaUnit,
  PROPERTY_LABELS,
  hasComplexPage,
  AREA_NAME,
} from '../types/trade'

interface Props {
  item: TradeItem
  /** 같은 지역 통계. 주어지면 같은 종목 중위 평당가와 비교해 싼지/비싼지 표시한다. */
  stats?: Pick<RegionStats, 'median_per_pyeong' | 'per_property'>
  /** 면적 표기 단위. 목록 전체가 한 단위로 통일돼야 카드끼리 비교가 된다. */
  areaUnit?: AreaUnit
}

const TradeCard = ({ item, stats, areaUnit = 'sqm' }: Props) => {
  const isRent = item.deal_type === 'RENT'
  // ㎡/평/평형을 한 줄에 다 늘어놓으면 읽기 어렵다. 고른 단위 하나만 찍고
  // 나머지 표기(전용 ㎡·평, 통상 평형)는 title 툴팁으로 남긴다.
  const area = formatArea(item.area, item.property_type, areaUnit)

  // 지역 중위 평당가 대비 편차 (매매만 의미 있음).
  // 아파트를 상가·토지가 섞인 중위값과 비교하면 값이 무의미해지므로 같은 종목끼리 비교한다.
  const medianPerPyeong = baselinePerPyeong(stats, item.property_type)
  const diffPct =
    !isRent && medianPerPyeong > 0 && item.price_per_pyeong > 0
      ? Math.round(((item.price_per_pyeong - medianPerPyeong) / medianPerPyeong) * 100)
      : null

  // 상가·토지는 단지 상세가 없다(필지 단위라 이름으로 묶으면 다른 땅이 섞인다).
  // 링크를 걸어두면 눌렀을 때 404가 나므로 카드 자체를 정적인 블록으로 그린다.
  //
  // 감싸는 컴포넌트를 렌더 본문 안에서 정의하면 매 렌더마다 새 함수(=새 컴포넌트
  // 타입)가 되어 React가 이전 서브트리를 버리고 다시 마운트한다 — 카드 안의
  // hover 상태·트랜지션이 리렌더마다 끊긴다. 그래서 컴포넌트를 만들지 않고
  // 태그만 조건부로 고른다.
  const linkable = hasComplexPage(item.property_type)
  const cardClass =
    'group block bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 transition-all' +
    (linkable ? ' hover:shadow-lg hover:border-violet-200 dark:hover:border-violet-500/40' : '')

  // 내용을 한 번만 만들고 바깥 태그(Link/div)만 조건부로 고른다. Link와 div는
  // props 형태가 달라(to가 필수/없음) 태그 자체를 변수에 담아 공용으로 쓰면
  // 타입이 맞지 않는다 — 내용을 감싸는 두 갈래로 나누는 편이 더 안전하다.
  const content = (
    <>
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
        <span className="inline-flex items-center gap-1" title={area.title}>
          <Ruler className="w-3.5 h-3.5" />
          {AREA_NAME[item.property_type]} {area.text}
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
            {/*
              같은 "평당"이 종목마다 다른 면적을 가리키면 안 된다.
              토지는 대지면적, 상가는 건물 연면적 기준이다(상가를 대지 기준으로 내면
              중위값이 58% 높아진다 — 대지면적 보유율이 23.7%뿐이라 기준은 연면적 유지).
            */}
            {item.property_type === 'LAND'
              ? '평당(대지)'
              : item.property_type === 'COMMERCIAL'
              ? '평당(연면적)'
              : '평당'}{' '}
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
    </>
  )

  return linkable ? (
    <Link to={`/complex/${encodeURIComponent(item.name)}`} className={cardClass}>
      {content}
    </Link>
  ) : (
    <div className={cardClass}>{content}</div>
  )
}

export default TradeCard
