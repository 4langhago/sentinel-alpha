// 지도 SDK 연동 어댑터
//
// 카카오맵 JS SDK는 <script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=...">
// 형태의 런타임 스크립트 로딩 방식이라 npm import 없이도 안전하게 붙일 수 있다.
// API 키(VITE_KAKAO_MAP_KEY)가 없는 동안에는 이 파일의 로더가 전혀 호출되지 않고,
// MapPanel은 RegionMapFallback(타일 히트맵)을 기본 경로로 사용한다.

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void
        LatLng: new (lat: number, lng: number) => unknown
        Map: new (container: HTMLElement, options: Record<string, unknown>) => unknown
      }
    }
  }
}

/** 시도 중심 좌표 (대략적인 시청/도청 기준. 지도 초기 중심 잡기용) */
export const SIDO_CENTERS: Record<string, { lat: number; lng: number }> = {
  서울: { lat: 37.5665, lng: 126.978 },
  경기: { lat: 37.4138, lng: 127.5183 },
  인천: { lat: 37.4563, lng: 126.7052 },
  부산: { lat: 35.1796, lng: 129.0756 },
  대구: { lat: 35.8714, lng: 128.6014 },
  광주: { lat: 35.1595, lng: 126.8526 },
  대전: { lat: 36.3504, lng: 127.3845 },
  울산: { lat: 35.5384, lng: 129.3114 },
  세종: { lat: 36.4801, lng: 127.289 },
  강원: { lat: 37.8228, lng: 128.1555 },
  충북: { lat: 36.6357, lng: 127.4917 },
  충남: { lat: 36.5184, lng: 126.8 },
  전북: { lat: 35.7175, lng: 127.153 },
  전남: { lat: 34.8161, lng: 126.4629 },
  경북: { lat: 36.4919, lng: 128.8889 },
  경남: { lat: 35.4606, lng: 128.2132 },
  제주: { lat: 33.4996, lng: 126.5312 },
}
/** 전국 기본 중심 (지역 미선택 시) */
export const KOREA_CENTER = { lat: 36.2, lng: 127.9 }

let loadPromise: Promise<NonNullable<Window['kakao']>['maps']> | null = null

/** 카카오맵 SDK를 1회만 로드하고 캐시한다. */
export const loadKakaoMaps = (apiKey: string) => {
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve(window.kakao.maps)
      return
    }
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`
    script.async = true
    script.onload = () => {
      if (!window.kakao) {
        reject(new Error('kakao maps sdk 로드 실패'))
        return
      }
      window.kakao.maps.load(() => resolve(window.kakao!.maps))
    }
    script.onerror = () => reject(new Error('kakao maps sdk 스크립트 로드 실패'))
    document.head.appendChild(script)
  })

  return loadPromise
}
