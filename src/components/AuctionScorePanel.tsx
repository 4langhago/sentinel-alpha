import { useState } from 'react'
import { ChevronDown, ChevronUp, Sigma } from 'lucide-react'
import { AuctionItem } from '../types/auction'
import { scoreAuction, WEIGHTS } from '../utils/auctionScore'
import type { RegionStats } from '../types/trade'

interface Props {
  item: AuctionItem
  marketStats?: Pick<RegionStats, 'per_property'>
}

/**
 * 추천 점수와 그 근거.
 *
 * 총점만 크게 띄우고 끝내지 않는 것이 이 컴포넌트의 요점이다. 가중치는
 * 업계 표준이 아니라 우리가 정한 것이므로(auctionScore.ts 참조), 축별로
 * 몇 점이 왜 나왔는지를 펼쳐 볼 수 있어야 사용자가 동의 여부를 스스로
 * 판단할 수 있다. 근거를 감추면 임의의 가중치가 객관적 판정처럼 보인다.
 */
const AuctionScorePanel = ({ item, marketStats }: Props) => {
  const [open, setOpen] = useState(false)
  const score = scoreAuction(item, marketStats)

  // 잴 수 없는 물건에 0점을 띄우면 "나쁜 물건"으로 읽힌다. 아예 감춘다.
  if (!score.scorable) return null

  // 색은 절대 점수가 아니라 확인 가능한 배점 대비로 정한다. 토지는 분모가
  // 50이라 절대 점수로 색을 고르면 아무리 조건이 좋아도 늘 회색이 된다.
  const ratio = score.attainable > 0 ? score.total / score.attainable : 0
  const tone =
    ratio >= 0.75
      ? 'text-emerald-600 dark:text-emerald-400'
      : ratio >= 0.5
        ? 'text-violet-600 dark:text-violet-400'
        : 'text-gray-500 dark:text-gray-400'

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 -mx-1 px-1 py-1.5 min-h-[36px] text-left"
      >
        <Sigma className={`w-3.5 h-3.5 shrink-0 ${tone}`} />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">추천 점수</span>
        <span className={`text-lg font-black leading-none ${tone}`}>{score.total}</span>
        {/* 분모는 100이 아니라 이 물건에서 확인 가능했던 배점이다.
            토지가 45/50에 머무는 것은 나쁜 물건이라는 뜻이 아니라
            우리가 절반만 확인했다는 뜻이고, 그게 보여야 한다. */}
        <span className="text-[11px] text-gray-400 dark:text-gray-500">/ {score.attainable}</span>
        <span className="ml-auto shrink-0 inline-flex items-center gap-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
          {open ? '근거 접기' : '근거 보기'}
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {score.axes.map((a) => {
            const negative = a.points < 0
            const ratio = Math.min(1, Math.abs(a.points) / Math.abs(a.max))
            return (
              <div key={a.key}>
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.label}</span>
                  <span
                    className={`font-black tabular-nums ${
                      negative ? 'text-rose-600 dark:text-rose-400' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {a.points > 0 ? '+' : ''}
                    {a.points}
                    <span className="font-semibold text-gray-400 dark:text-gray-500">
                      {' '}
                      / {a.max}
                    </span>
                  </span>
                </div>
                {/* 막대는 장식이 아니라 배점 대비 위치를 보여주는 눈금이다. */}
                <div className="mt-1 h-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${negative ? 'bg-rose-400' : 'bg-violet-400'}`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  {a.basis}
                </p>
              </div>
            )
          })}

          <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
              점수에 반영되지 않은 것
            </p>
            <ul className="space-y-0.5">
              {score.caveats.map((c) => (
                <li
                  key={c}
                  className="text-[10px] leading-relaxed text-gray-400 dark:text-gray-500"
                >
                  · {c}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
              분모 {score.attainable}점은 <strong>이 물건에서 확인 가능했던 배점</strong>입니다.
              전체 배점은 감정가 대비 {WEIGHTS.discount}점 · 시세 대비 {WEIGHTS.market}점 · 유찰{' '}
              {WEIGHTS.failCount}점, 감점 최대 {WEIGHTS.penalty}점입니다.
              {score.attainable < WEIGHTS.discount + WEIGHTS.market + WEIGHTS.failCount && (
                <>
                  {' '}
                  이 물건은 시세 비교를 할 수 없어 분모가 작습니다.{' '}
                  <strong>
                    분모가 다른 물건끼리 점수를 직접 비교하지 마세요 — 같은 용도로 좁혀서 보면
                    같은 기준으로 줄을 섭니다.
                  </strong>
                </>
              )}{' '}
              이 가중치는 업계 표준이 아니라 이 서비스가 정한 것이며, 투자 권유가 아닙니다.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default AuctionScorePanel
