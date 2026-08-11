import { useState } from 'react'
import { TrendPoint } from '../types/trade'

interface Props {
  trend: TrendPoint[]
  className?: string
}

const W = 640
// 상단 선 그래프 영역 / 하단 거래량 미니바 영역을 분리한 레이아웃.
// PAD.bottom은 월 라벨 한 줄만큼만 남기고, 그 사이에 GAP + VOLUME_H를 둔다.
const CHART_H = 148
const GAP = 10
const VOLUME_H = 30
const PAD = { top: 16, right: 16, bottom: 26, left: 56 }
const H = PAD.top + CHART_H + GAP + VOLUME_H + PAD.bottom

// 차트 색상은 브랜드 violet과 분리된 데이터 전용 시맨틱 토큰을 쓴다
// (tailwind.config.js의 chart.* — line/grid/grid-dark/provisional).
const CHART_COLORS = {
  line: '#475569', // chart.line (slate-600) — 기본 추세선
  provisional: '#f59e0b', // chart.provisional (amber-500) — 당월(집계 중) 포인트/라벨 강조
  volume: 'rgb(71 85 105 / 0.28)', // chart.line 저채도 — 거래량 미니바
  volumeProvisional: 'rgb(245 158 11 / 0.35)', // chart.provisional 저채도 — 당월 거래량 미니바
}

export interface CompletedTrendChange {
  /** 완결된 월 기준 증감률(%). 비교할 완결 월이 2개 미만이면 null */
  changePct: number | null
  /** 비교 기준이 된 첫 완결 월 */
  baseMonth?: string
}

/**
 * 당월(아직 집계가 끝나지 않은 달)을 제외한 "완결된 월" 기준으로 증감률을 계산한다.
 * 당월은 신고 지연 때문에 표본이 적고 값이 튈 수 있어, 신뢰할 수 있는 지표로 쓰지 않는다.
 * PriceTrendChart와 HomePage 히어로가 동일한 규칙을 공유하도록 이 함수를 내보낸다.
 */
export const computeCompletedChange = (trend: TrendPoint[]): CompletedTrendChange => {
  if (trend.length < 2) return { changePct: null }
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastIdx = trend.length - 1
  const lastIsPartial = trend[lastIdx].month === currentMonth
  const completeTrend = lastIsPartial ? trend.slice(0, -1) : trend

  const first = completeTrend[0]?.median_per_pyeong
  const last = completeTrend[completeTrend.length - 1]?.median_per_pyeong
  if (completeTrend.length < 2 || !(first > 0)) return { changePct: null }

  return {
    changePct: Math.round(((last - first) / first) * 1000) / 10,
    baseMonth: completeTrend[0].month,
  }
}

const manwon = (v: number) => Math.round(v / 10000).toLocaleString()

/**
 * 월별 중위 평당가 추이. 외부 차트 라이브러리 없이 인라인 SVG로 그린다.
 * (번들 크기를 늘리지 않고 다크모드에서도 동일하게 동작)
 *
 * 상단: 중위 평당가 라인 + 호버/탭 크로스헤어·툴팁
 * 하단: 월별 거래량 미니바 (표본 크기를 함께 보여줘 라인만 보고 과신하지 않도록)
 */
const PriceTrendChart = ({ trend, className = '' }: Props) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  if (trend.length === 0) {
    return (
      <p className={`text-sm text-slate-400 dark:text-slate-500 ${className}`}>
        추이를 그릴 거래 데이터가 없습니다.
      </p>
    )
  }

  if (trend.length === 1) {
    const only = trend[0]
    return (
      <p className={`text-sm text-slate-500 dark:text-slate-400 ${className}`}>
        {only.month} 한 달치 거래만 있어 추이를 그릴 수 없습니다 (중위 평당{' '}
        {manwon(only.median_per_pyeong)}만원, {only.count}건).
      </p>
    )
  }

  const values = trend.map((t) => t.median_per_pyeong)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  // 모든 값이 같으면 높이 0이 되어 선이 사라지므로 최소 폭을 준다.
  const span = rawMax - rawMin || rawMax * 0.1 || 1
  const min = rawMin - span * 0.15
  const max = rawMax + span * 0.15

  const innerW = W - PAD.left - PAD.right
  const x = (i: number) => PAD.left + (trend.length === 1 ? innerW / 2 : (i / (trend.length - 1)) * innerW)
  const y = (v: number) => PAD.top + CHART_H - ((v - min) / (max - min)) * CHART_H

  const line = trend.map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(t.median_per_pyeong).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(trend.length - 1).toFixed(1)} ${PAD.top + CHART_H} L ${x(0).toFixed(1)} ${PAD.top + CHART_H} Z`

  // 당월은 아직 수집이 끝나지 않아 건수가 적고 값이 튈 수 있다.
  // 마지막 지점이 당월이면 "집계 중"으로 별도 표시하고, 증감률 계산에서는 제외한다.
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastIdx = trend.length - 1
  const lastIsPartial = trend[lastIdx].month === currentMonth

  const { changePct, baseMonth: changeBaseLabel } = computeCompletedChange(trend)

  // 거래량 미니바 (하단)
  const maxCount = Math.max(...trend.map((t) => t.count), 1)
  const volumeTop = PAD.top + CHART_H + GAP
  const barW = Math.max((innerW / trend.length) * 0.5, 4)
  const barHeight = (count: number) => (count / maxCount) * VOLUME_H

  // 각 포인트의 호버/탭 영역 경계(중간 지점 기준)
  const hitBounds = trend.map((_, i) => {
    const cx = x(i)
    const prevMid = i === 0 ? PAD.left : (x(i - 1) + cx) / 2
    const nextMid = i === trend.length - 1 ? W - PAD.right : (cx + x(i + 1)) / 2
    return { start: prevMid, width: Math.max(nextMid - prevMid, 1) }
  })

  const active = activeIdx !== null ? trend[activeIdx] : null
  const activePartial = activeIdx !== null && lastIsPartial && activeIdx === lastIdx

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">월별 중위 평당가</p>
        {changePct !== null ? (
          <p
            className={`text-sm font-semibold ${
              changePct > 0 ? 'text-data-up' : changePct < 0 ? 'text-data-down' : 'text-data-neutral'
            }`}
          >
            {changeBaseLabel} 대비 {changePct > 0 ? '+' : ''}
            {changePct}%
          </p>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">완결된 월이 부족해 증감률을 계산할 수 없습니다</p>
        )}
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[420px]"
          role="img"
          aria-label="월별 중위 평당가 및 거래량 추이"
          onMouseLeave={() => setActiveIdx(null)}
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.line} stopOpacity="0.28" />
              <stop offset="100%" stopColor={CHART_COLORS.line} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 가로 눈금 + y축 라벨 (4~5개) */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const v = min + (max - min) * (1 - f)
            const yy = PAD.top + CHART_H * f
            return (
              <g key={f}>
                <line
                  x1={PAD.left}
                  y1={yy}
                  x2={W - PAD.right}
                  y2={yy}
                  stroke="currentColor"
                  className="text-chart-grid dark:text-chart-grid-dark"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 8}
                  y={yy + 4}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500"
                  fontSize="11"
                >
                  {manwon(v)}
                </text>
              </g>
            )
          })}

          <path d={area} fill="url(#trendFill)" />
          {/* 당월(집계 중) 구간은 점선으로 분리해 확정 구간과 구분한다. */}
          {lastIsPartial ? (
            <>
              <path
                d={trend
                  .slice(0, lastIdx)
                  .map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(t.median_per_pyeong).toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke={CHART_COLORS.line}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={`M ${x(lastIdx - 1).toFixed(1)} ${y(trend[lastIdx - 1].median_per_pyeong).toFixed(1)} L ${x(
                  lastIdx
                ).toFixed(1)} ${y(trend[lastIdx].median_per_pyeong).toFixed(1)}`}
                fill="none"
                stroke={CHART_COLORS.line}
                strokeWidth="2.5"
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.55"
              />
            </>
          ) : (
            <path d={line} fill="none" stroke={CHART_COLORS.line} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* 호버/탭 크로스헤어 */}
          {active && (
            <line
              x1={x(activeIdx!)}
              y1={PAD.top}
              x2={x(activeIdx!)}
              y2={PAD.top + CHART_H}
              stroke="currentColor"
              className="text-slate-300 dark:text-slate-600"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {trend.map((t, i) => {
            const partial = lastIsPartial && i === lastIdx
            const isActive = activeIdx === i
            return (
              <g key={t.month}>
                <circle
                  cx={x(i)}
                  cy={y(t.median_per_pyeong)}
                  r={isActive ? 5.5 : 4}
                  fill={partial ? CHART_COLORS.provisional : CHART_COLORS.line}
                  opacity={partial ? 0.7 : 1}
                  className="transition-[r] duration-100"
                />
                {isActive && (
                  <circle
                    cx={x(i)}
                    cy={y(t.median_per_pyeong)}
                    r="8"
                    fill="none"
                    stroke={partial ? CHART_COLORS.provisional : CHART_COLORS.line}
                    strokeWidth="1.5"
                    opacity="0.5"
                  />
                )}
                <text
                  x={x(i)}
                  y={PAD.top + CHART_H + GAP + VOLUME_H + 18}
                  textAnchor={partial ? 'end' : 'middle'}
                  className={partial ? 'fill-chart-provisional' : 'fill-slate-400 dark:fill-slate-500'}
                  fontSize="11"
                >
                  {t.month.slice(2).replace('-', '.')}
                </text>
                {partial && (
                  <text
                    x={x(i)}
                    y={y(t.median_per_pyeong) - 10}
                    textAnchor="end"
                    className="fill-chart-provisional"
                    fontSize="10"
                  >
                    집계 중
                  </text>
                )}
              </g>
            )
          })}

          {/* 하단 거래량 미니바: "이 달 표본이 몇 건인지"를 라인과 같은 x축으로 보여준다 */}
          {trend.map((t, i) => {
            const partial = lastIsPartial && i === lastIdx
            const h = barHeight(t.count)
            return (
              <rect
                key={`vol-${t.month}`}
                x={x(i) - barW / 2}
                y={volumeTop + (VOLUME_H - h)}
                width={barW}
                height={Math.max(h, 1)}
                rx="1.5"
                fill={partial ? CHART_COLORS.volumeProvisional : CHART_COLORS.volume}
              />
            )
          })}

          {/* 호버/탭 히트 영역 (투명, 각 포인트 사이 중간까지 반응) */}
          {hitBounds.map((b, i) => (
            <rect
              key={`hit-${trend[i].month}`}
              x={b.start}
              y={PAD.top}
              width={b.width}
              height={CHART_H + GAP + VOLUME_H}
              fill="transparent"
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => setActiveIdx((cur) => (cur === i ? null : i))}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </svg>

        {/* HTML 툴팁: SVG <title>은 호버 지연이 크고 모바일에서 동작하지 않아 별도 구현한다 */}
        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-700 px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{
              left: `${(x(activeIdx!) / W) * 100}%`,
              top: `${(y(active.median_per_pyeong) / H) * 100 - 2}%`,
            }}
          >
            <p className="font-semibold">{active.month}</p>
            <p>
              중위 평당 {manwon(active.median_per_pyeong)}만원 · {active.count}건
            </p>
            {activePartial && <p className="text-chart-provisional">집계 중 · 당월 데이터 미확정</p>}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
        단위: 만원 / 3.3㎡{lastIsPartial ? ' · 점선 구간(당월)은 아직 집계 중인 데이터로 확정치가 아닙니다.' : ''}
      </p>
    </div>
  )
}

export default PriceTrendChart
