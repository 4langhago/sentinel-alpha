import { useState, useEffect, useCallback, useRef } from 'react'
import { auctionApi } from '../services/auctionApi'
import { AuctionItem } from '../types/auction'

const POLL_INTERVAL_MS = 60_000 // 60초 주기 폴링

export interface LiveAuctionState {
  items: AuctionItem[]
  total: number
  isLive: boolean          // 실제 수집 데이터 여부 (false = 샘플/mock 폴백)
  dataSource: string | null // 'mock' | 'data.go.kr' 등
  lastSync: string | null   // 서버가 데이터를 마지막으로 갱신한 시각
  lastUpdated: Date | null  // 브라우저가 마지막으로 조회한 시각
  loading: boolean
  refresh: () => void
}

/**
 * 경매 데이터 실시간 훅
 * - 마운트 시 즉시 조회 후 60초 주기로 폴링
 * - 탭이 다시 활성화되면 즉시 재조회
 * - FastAPI 서버 미응답 시 auctionApi가 mock 데이터로 폴백 (isLive=false)
 */
export const useLiveAuctions = (limit = 100): LiveAuctionState => {
  const [items, setItems] = useState<AuctionItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLive, setIsLive] = useState(false)
  const [dataSource, setDataSource] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async () => {
    try {
      const [result, health] = await Promise.all([
        auctionApi.searchAuctions({ limit }),
        auctionApi.getHealth(),
      ])
      if (!mountedRef.current) return
      setItems(result.items)
      setTotal(result.total)
      // status:'ok'는 함수가 살아있다는 뜻일 뿐이라 mock 폴백 중에도 true다.
      // 실제 수집 데이터인지는 is_live/source로만 판단한다.
      setIsLive(health !== null && (health.is_live ?? health.source !== 'mock') === true)
      setDataSource(health?.source ?? null)
      setLastSync(health?.last_update && health.last_update !== 'never' ? health.last_update : null)
      setLastUpdated(new Date())
    } catch (error) {
      console.warn('[useLiveAuctions] 데이터 조회 실패:', error)
      if (mountedRef.current) setIsLive(false)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    mountedRef.current = true
    fetchData()

    const timer = setInterval(fetchData, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      mountedRef.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchData])

  return { items, total, isLive, dataSource, lastSync, lastUpdated, loading, refresh: fetchData }
}

export default useLiveAuctions
