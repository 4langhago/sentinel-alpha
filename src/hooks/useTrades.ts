import { useState, useEffect, useCallback, useRef } from 'react'
import { tradeApi } from '../services/tradeApi'
import { TradeItem, TradeSearchParams } from '../types/trade'

const POLL_INTERVAL_MS = 5 * 60_000 // 실거래는 일 1회 갱신이라 5분 폴링이면 충분

export interface TradesState {
  items: TradeItem[]
  total: number
  totalPages: number
  /** 실제 국토부 데이터인지 (false = 샘플) */
  isLive: boolean
  source: string | null
  scope: string | null
  scopeTruncated: boolean
  scopeSize: number
  /** 서버가 데이터를 마지막으로 수집한 시각 */
  lastUpdate: string | null
  /** 브라우저가 마지막으로 조회한 시각 */
  fetchedAt: Date | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * 실거래 목록 훅
 * - params가 바뀌면 즉시 재조회
 * - 5분 주기 폴링 + 탭 복귀 시 재조회
 */
export const useTrades = (params: TradeSearchParams = {}): TradesState => {
  const [items, setItems] = useState<TradeItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLive, setIsLive] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [scope, setScope] = useState<string | null>(null)
  const [scopeTruncated, setScopeTruncated] = useState(false)
  const [scopeSize, setScopeSize] = useState(0)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  // 객체 리터럴을 그대로 의존성에 넣으면 매 렌더마다 재조회되므로 직렬화해 비교한다.
  const key = JSON.stringify(params)

  const fetchData = useCallback(async () => {
    try {
      const result = await tradeApi.search(JSON.parse(key))
      if (!mounted.current) return
      setItems(result.items)
      setTotal(result.total)
      setTotalPages(result.totalPages)
      setIsLive(result.isLive)
      setSource(result.source)
      setScope(result.scope)
      setScopeTruncated(result.scopeTruncated)
      setScopeSize(result.scopeSize)
      setLastUpdate(result.lastUpdate)
      setFetchedAt(new Date())
      setError(null)
    } catch (e) {
      console.warn('[useTrades] 조회 실패:', e)
      if (mounted.current) setError('실거래 데이터를 불러오지 못했습니다.')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [key])

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    fetchData()

    const timer = setInterval(fetchData, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      mounted.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchData])

  return {
    items, total, totalPages, isLive, source, scope, scopeTruncated, scopeSize,
    lastUpdate, fetchedAt, loading, error, refresh: fetchData,
  }
}

export default useTrades
