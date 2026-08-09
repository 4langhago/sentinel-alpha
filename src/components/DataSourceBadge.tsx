import { RefreshCw, Database, FlaskConical } from 'lucide-react'

interface Props {
  isLive: boolean
  /** 서버가 데이터를 마지막으로 수집한 시각 (ISO) */
  lastUpdate?: string | null
  /** 브라우저가 마지막으로 조회한 시각 */
  fetchedAt?: Date | null
  loading?: boolean
  onRefresh?: () => void
  className?: string
}

const formatSync = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * 지금 보고 있는 데이터가 실제 국토부 실거래인지 샘플인지 명확히 알린다.
 * 샘플을 실데이터처럼 보이게 하지 않는 것이 이 컴포넌트의 목적이다.
 */
const DataSourceBadge = ({ isLive, lastUpdate, fetchedAt, loading, onRefresh, className = '' }: Props) => (
  <div className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${className}`}>
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
        isLive
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
      }`}
    >
      {isLive ? <Database className="w-3 h-3" /> : <FlaskConical className="w-3 h-3" />}
      {isLive ? '국토교통부 실거래가' : '샘플 데이터 (실제 거래 아님)'}
    </span>

    {isLive && lastUpdate && (
      <span className="text-gray-500 dark:text-gray-400">{formatSync(lastUpdate)} 수집</span>
    )}

    {fetchedAt && (
      <span className="text-gray-400 dark:text-gray-500">
        {fetchedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 조회
      </span>
    )}

    {onRefresh && (
      <button
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        {loading ? '갱신 중' : '새로고침'}
      </button>
    )}
  </div>
)

export default DataSourceBadge
