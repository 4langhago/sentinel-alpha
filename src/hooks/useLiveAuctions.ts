import { useState, useEffect, useCallback, useRef } from 'react'
import { auctionApi } from '../services/auctionApi'
import { AuctionItem } from '../types/auction'

const POLL_INTERVAL_MS = 60_000 // 60초 주기 폴링

export interface LiveAuctionState {
  items: AuctionItem[]
  total: number
  isLive: boolean          // FastAPI 서버 연동 여부 (false = mock 폴백)
  lastUpdated: Date | null
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
      setIsLive(health !== null && health.status === 'ok')
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

  return { items, total, isLive, lastUpdated, loading, refresh: fetchData }
}

export default useLiveAuctions
