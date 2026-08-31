import { MapPin, ExternalLink, Gavel, Clock, Ruler, TrendingDown } from 'lucide-react'
import {
  AuctionItem,
  AUCTION_STATUS_LABELS,
  formatBidTime,
  primaryArea,
  remainingDays,
} from '../types/auction'
import { formatPrice, toPyeong } from '../types/trade'

interface Props {
  item: AuctionItem
  /** 같은 지역의 실거래 중위 평당가(원). 주어지면 "시세 대비" 한 줄을 덧붙인다. */
  medianPerPyeong?: number
}

/**
 * 국내 경공매 서비스들이 목록 카드에서 공통적으로 가장 크게 보여주는 것은
 * (1) 최저입찰가, (2) 감정가 대비 체감률, (3) 남은 시간, (4) 유찰 횟수다.
 * 이 넷을 한눈에 잡히도록 배치하고, 그 아래에 소재지·면적 같은 식별 정보를 둔다.
 *
 * 여기에 우리만의 두 가지를 반드시 얹는다:
 *   - last_seen_at (우리가 마지막으로 확인한 시각)
 *   - 온비드 원문 링크
 * 우리 데이터는 하루 두 번 찍은 스냅샷이라, 사용자가 이 카드만 보고 입찰을
 * 결정하면 실제 피해가 날 수 있다. 최종 확인은 원문에서 하도록 유도한다.
 */
const AuctionCard = ({ item, medianPerPyeong }: Props) => {
  const days = remainingDays(item.bid_end_at)
  const closed = item.status === 'CLOSED'
  const area = primaryArea(item)

  // 마감까지 남은 시간. 3일 이내는 붉게 강조한다 — 공매에서 가장 급한 정보다.
  const dday =
    closed || days === null
      ? null
      : days < 0
        ? '마감'
        : days === 0
          ? '오늘 마감'
          : `D-${days}`
  const urgent = !closed && days !== null && days >= 0 && days <= 3

  // 체감률은 낮을수록 싸다. 50% 이하면 색을 바꿔 눈에 띄게 한다.
  const rate = item.discount_rate
  const deepDiscount = rate !== null && rate <= 50

  // 같은 지역 실거래 중위 평당가와의 비교. 감정가가 아니라 시장가 대비 감각을 준다.
  // 면적이 없거나(권리만 있는 물건) 최저가가 비공개면 계산하지 않는다.
  const pyeong = area ? toPyeong(area.sqm) : 0
  const perPyeong = pyeong > 0 && item.min_bid_price > 0 ? Math.round(item.min_bid_price / pyeong) : 0
  const vsMarket =
    perPyeong > 0 && medianPerPyeong && medianPerPyeong > 0
      ? Math.round(((perPyeong - medianPerPyeong) / medianPerPyeong) * 100)
      : null

  return (
    <div
      className={`group flex flex-col bg-white dark:bg-gray-800 rounded-2xl border p-5 transition-all hover:shadow-lg ${
        closed
          ? 'border-gray-200 dark:border-gray-700 opacity-70'
          : 'border-gray-100 dark:border-gray-700 hover:border-violet-200 dark:hover:border-violet-500/40'
      }`}
    >
      {/* 상태 · 마감 · 재산유형 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-1 ${
              closed
                ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                : item.status === 'OPEN'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400'
            }`}
          >
            <Gavel className="w-3 h-3" />
            {item.bid_status || AUCTION_STATUS_LABELS[item.status]}
          </span>
          <span className="inline-block text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2 py-1">
            {item.prpt_div}
          </span>
          {item.private_contract && (
            <span className="inline-block text-[11px] font-semibold bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400 rounded-full px-2 py-1">
              수의계약 가능
            </span>
          )}
        </div>
        {dday && (
          <span
            className={`shrink-0 text-xs font-black rounded-lg px-2 py-1 ${
              urgent
                ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {dday}
          </span>
        )}
      </div>

      {/* 물건명 · 소재지 */}
      <h3 className="font-bold text-gray-900 dark:text-white text-sm leading-snug line-clamp-2 mb-1">
        {item.name}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-3 truncate">
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        {item.region_name || item.address}
        <span className="text-gray-400 dark:text-gray-500">· {item.use_scls || item.use_mcls}</span>
      </p>

      {/* 최저입찰가 (가장 크게) + 감정가 + 체감률 */}
      <div className="mb-3">
        {item.min_bid_undisclosed ? (
          <div className="text-lg font-black text-gray-500 dark:text-gray-400">최저가 비공개</div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white whitespace-nowrap">
              {formatPrice(item.min_bid_price)}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">최저입찰가</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
          {item.appraisal_price > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              감정가 {formatPrice(item.appraisal_price)}
            </span>
          )}
          {rate !== null && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5 ${
                deepDiscount
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
              }`}
            >
              <TrendingDown className="w-3 h-3" />
              감정가의 {rate}%
            </span>
          )}
          {item.fail_count > 0 && (
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">
              유찰 {item.fail_count}회
            </span>
          )}
        </div>
      </div>

      {/* 면적 · 회차 · 시세 비교 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
        {area && (
          <span className="inline-flex items-center gap-1" title={`${area.label} ${area.sqm}㎡`}>
            <Ruler className="w-3.5 h-3.5" />
            {area.label} {toPyeong(area.sqm)}평
          </span>
        )}
        {item.bid_round > 0 && <span>{item.bid_round}회차</span>}
        {vsMarket !== null && (
          <span
            className={vsMarket < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}
            title="같은 시군구 실거래 중위 평당가와 비교한 값입니다. 물건 상태·권리관계는 반영되지 않습니다."
          >
            지역 시세 대비 {vsMarket > 0 ? '+' : ''}
            {vsMarket}%
          </span>
        )}
      </div>

      {/* 입찰 기간 */}
      <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-2.5 py-2 mb-3">
        <Clock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
        <span>
          {formatBidTime(item.bid_start_at)} ~ {formatBidTime(item.bid_end_at)}
        </span>
      </div>

      {/* 신선도 고지 + 원문 링크. 이 두 줄은 선택이 아니라 필수다 —
          우리 데이터는 스냅샷이라 최종 확인은 반드시 온비드 원문에서 해야 한다. */}
      <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
          {formatBidTime(item.last_seen_at)} 확인
        </span>
        <a
          href={item.detail_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
        >
          온비드 원문
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

export default AuctionCard
