import { useState } from 'react'
import { AlertTriangle, HelpCircle, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'
import { AuctionItem } from '../types/auction'
import type { RegionStats } from '../types/trade'
import { buildInsights, Insight } from '../utils/auctionInsights'

interface Props {
  item: AuctionItem
  marketStats?: Pick<RegionStats, 'per_property'>
}

const ICONS = {
  metric: TrendingDown,
  warning: AlertTriangle,
  unknown: HelpCircle,
} as const

const TONE = {
  metric: 'text-violet-600 dark:text-violet-400',
  warning: 'text-rose-600 dark:text-rose-400',
  unknown: 'text-gray-400 dark:text-gray-500',
} as const

const Row = ({ i }: { i: Insight }) => {
  const Icon = ICONS[i.kind]
  return (
    <li className="flex items-start gap-2">
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${TONE[i.kind]}`} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
          {i.label}
          {i.value && (
            <span className={`ml-1.5 font-black ${i.emphasis ? TONE[i.kind] : ''}`}>{i.value}</span>
          )}
        </p>
        {/* 근거를 항상 붙인다. 숫자만 보여주면 사용자가 검증할 수 없고,
            검증할 수 없는 숫자는 돈을 거는 판단에서 위험하다. */}
        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{i.basis}</p>
      </div>
    </li>
  )
}

/**
 * 투자 판단 참고 정보.
 *
 * 점수나 등급을 매기지 않는다. 조사 결과 "시세 대비 몇 % 이하면 싸다"는 업계
 * 표준 기준선이 존재하지 않았고, 없는 기준으로 만든 점수는 임의의 가중치를
 * 객관적 판단처럼 보이게 한다. 대신 계산된 지표·데이터로 확인되는 경고·
 * 데이터로는 알 수 없어 직접 확인해야 하는 것을 구분해 나열한다.
 */
const AuctionInsights = ({ item, marketStats }: Props) => {
  const [open, setOpen] = useState(false)
  const insights = buildInsights(item, marketStats)

  // 항상 보이는 것: 경고 전부 + 시세 대비.
  // 경고는 접힌 채로 놓치면 의미가 없고, 시세 대비는 온비드도 타 사이트도
  // 주지 않는 우리 고유 지표라 접힘 안에 숨길 이유가 없다.
  const pinned = insights.filter((i) => i.kind === 'warning' || i.label.endsWith('시세 대비'))
  const rest = insights.filter((i) => !pinned.includes(i))

  if (insights.length === 0) return null

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
      {pinned.length > 0 && (
        <ul className="space-y-2 mb-2">
          {pinned.map((i) => (
            <Row key={i.label} i={i} />
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 -mx-1 px-1 py-1.5 min-h-[32px] text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:underline"
          aria-expanded={open}
        >
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          투자 참고 정보 {open ? '접기' : `${rest.length}건 보기`}
        </button>
      )}

      {open && (
        <ul className="space-y-2 mt-2">
          {rest.map((i) => (
            <Row key={i.label} i={i} />
          ))}
        </ul>
      )}

      {(open || rest.length === 0) && (
        <p className="mt-3 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
            이 정보는 온비드 공개 데이터와 국토교통부 실거래가로 계산한 <strong>참고 자료</strong>이며,
            투자 권유나 법률·세무 자문이 아닙니다. 권리관계·명도·물건 상태는 등기부등본과
          공매재산명세서 원문 확인을 대체하지 않습니다. 최종 판단과 책임은 이용자에게 있습니다.
        </p>
      )}
    </div>
  )
}

export default AuctionInsights
