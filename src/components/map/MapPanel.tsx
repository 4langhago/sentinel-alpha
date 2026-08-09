import { useEffect, useRef, useState } from 'react'
import { MapPinned, AlertTriangle } from 'lucide-react'
import { SidoRegion } from '../../types/trade'
import { loadKakaoMaps, SIDO_CENTERS, KOREA_CENTER } from './mapAdapter'
import RegionMapFallback from './RegionMapFallback'

interface Props {
  regions: SidoRegion[]
  sido?: string
  sggCode?: string
  q?: string
  onSelectSido: (sido: string) => void
  onSelectSgg: (sggCode: string) => void
}

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined

/** 실제 지도 SDK 연결 자리. 키가 없으면 항상 RegionMapFallback(타일 히트맵)이 기본 경로다. */
const KakaoMap = ({ sido }: { sido?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    if (!KAKAO_KEY) return
    loadKakaoMaps(KAKAO_KEY)
      .then((maps) => {
        if (!alive || !containerRef.current) return
        const center = (sido && SIDO_CENTERS[sido]) || KOREA_CENTER
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(center.lat, center.lng),
          level: sido ? 8 : 13,
        })
        setStatus('ready')
      })
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
  }, [sido])

  if (status === 'error') {
    return (
      <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center gap-2 text-gray-400 dark:text-gray-500 p-6">
        <AlertTriangle className="w-8 h-8" />
        <p className="text-sm">지도를 불러오지 못했습니다. API 키를 확인해주세요.</p>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[320px]">
      <div ref={containerRef} className="absolute inset-0 rounded-2xl overflow-hidden" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900/40 rounded-2xl animate-pulse">
          <MapPinned className="w-8 h-8 text-gray-300 dark:text-gray-600" />
        </div>
      )}
    </div>
  )
}

/**
 * 지도 패널. VITE_KAKAO_MAP_KEY가 설정되면 카카오맵을, 없으면(기본 경로)
 * 시도/시군구 타일 히트맵(RegionMapFallback)으로 "지금 보고 있는 지역"을 시각화한다.
 */
const MapPanel = ({ regions, sido, sggCode, q, onSelectSido, onSelectSgg }: Props) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 h-full">
      {KAKAO_KEY ? (
        <KakaoMap sido={sido} />
      ) : (
        <RegionMapFallback
          regions={regions}
          sido={sido}
          sggCode={sggCode}
          q={q}
          onSelectSido={onSelectSido}
          onSelectSgg={onSelectSgg}
        />
      )}
    </div>
  )
}

export default MapPanel
