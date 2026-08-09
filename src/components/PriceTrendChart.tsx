import { TrendPoint } from '../types/trade'

interface Props {
  trend: TrendPoint[]
  className?: string
}

const W = 640
const H = 200
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

/**
 * 월별 중위 평당가 추이. 외부 차트 라이브러리 없이 인라인 SVG로 그린다.
 * (번들 크기를 늘리지 않고 다크모드에서도 동일하게 동작)
 */
const PriceTrendChart = ({ trend, className = '' }: Props) => {
  if (trend.length === 0) {
    return (
      <p className={`text-sm text-gray-400 dark:text-gray-500 ${className}`}>
        추이를 그릴 거래 데이터가 없습니다.
      </p>
    )
  }

  if (trend.length === 1) {
    const only = trend[0]
    return (
      <p className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        {only.month} 한 달치 거래만 있어 추이를 그릴 수 없습니다 (중위 평당{' '}
        {Math.round(only.median_per_pyeong / 10000).toLocaleString()}만원, {only.count}건).
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
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (trend.length === 1 ? innerW / 2 : (i / (trend.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH

  const line = trend.map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(t.median_per_pyeong).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(trend.length - 1).toFixed(1)} ${PAD.top + innerH} L ${x(0).toFixed(1)} ${PAD.top + innerH} Z`

  // 당월은 아직 수집이 끝나지 않아 건수가 적고 값이 튈 수 있다.
  // 마지막 지점이 당월이면 "집계 중"으로 별도 표시하고, 증감률 계산에서는 제외한다.
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastIdx = trend.length - 1
  const lastIsPartial = trend[lastIdx].month === currentMonth
  const completeTrend = lastIsPartial ? trend.slice(0, -1) : trend

  const first = completeTrend[0]?.median_per_pyeong
  const last = completeTrend[completeTrend.length - 1]?.median_per_pyeong
  const changePct =
    completeTrend.length >= 2 && first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : null
  const changeBaseLabel = completeTrend[0]?.month

  const manwon = (v: number) => Math.round(v / 10000).toLocaleString()

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">월별 중위 평당가</p>
        {changePct !== null ? (
          <p
            className={`text-sm font-bold ${
              changePct > 0
                ? 'text-rose-600 dark:text-rose-400'
                : changePct < 0
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500'
            }`}
          >
            {changeBaseLabel} 대비 {changePct > 0 ? '+' : ''}
            {changePct}%
          </p>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">완결된 월이 부족해 증감률을 계산할 수 없습니다</p>
        )}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label="월별 중위 평당가 추이">
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(139 92 246)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(139 92 246)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 가로 눈금 + y축 라벨 */}
          {[0, 0.5, 1].map((f) => {
            const v = min + (max - min) * (1 - f)
            const yy = PAD.top + innerH * f
            return (
              <g key={f}>
                <line
                  x1={PAD.left}
                  y1={yy}
                  x2={W - PAD.right}
                  y2={yy}
                  stroke="currentColor"
                  className="text-gray-200 dark:text-gray-700"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 8}
                  y={yy + 4}
                  textAnchor="end"
                  className="fill-gray-400 dark:fill-gray-500"
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
                stroke="rgb(139 92 246)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={`M ${x(lastIdx - 1).toFixed(1)} ${y(trend[lastIdx - 1].median_per_pyeong).toFixed(1)} L ${x(
                  lastIdx
                ).toFixed(1)} ${y(trend[lastIdx].median_per_pyeong).toFixed(1)}`}
                fill="none"
                stroke="rgb(139 92 246)"
                strokeWidth="2.5"
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.55"
              />
            </>
          ) : (
            <path d={line} fill="none" stroke="rgb(139 92 246)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          )}

          {trend.map((t, i) => {
            const partial = lastIsPartial && i === lastIdx
            return (
              <g key={t.month}>
                <circle
                  cx={x(i)}
                  cy={y(t.median_per_pyeong)}
                  r="4"
                  fill="rgb(139 92 246)"
                  opacity={partial ? 0.55 : 1}
                  stroke={partial ? 'rgb(139 92 246)' : 'none'}
                  strokeDasharray={partial ? '2 2' : undefined}
                />
                <title>
                  {`${t.month} · 중위 평당 ${manwon(t.median_per_pyeong)}만원 · ${t.count}건`}
                  {partial ? ' (집계 중, 당월 데이터 미확정)' : ''}
                </title>
                <text
                  x={x(i)}
                  y={H - 8}
                  textAnchor={partial ? 'end' : 'middle'}
                  className={partial ? 'fill-violet-400 dark:fill-violet-400' : 'fill-gray-400 dark:fill-gray-500'}
                  fontSize="11"
                >
                  {t.month.slice(2).replace('-', '.')}
                </text>
                {partial && (
                  <text x={x(i)} y={y(t.median_per_pyeong) - 10} textAnchor="end" className="fill-violet-400" fontSize="10">
                    집계 중
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        단위: 만원 / 3.3㎡{lastIsPartial ? ' · 점선 구간(당월)은 아직 집계 중인 데이터로 확정치가 아닙니다.' : ''}
      </p>
    </div>
  )
}

export default PriceTrendChart
