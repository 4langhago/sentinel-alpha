// 최근 검색 조건 (localStorage)
//
// 조건을 여러 개 걸어 찾다가 다른 조건으로 넘어가면 직전 조합을 되짚기 어렵다.
// URL 쿼리가 이미 필터의 단일 진실 소스이므로, 저장도 "쿼리 문자열 한 줄"로
// 충분하다 — 복원은 그 쿼리를 그대로 주소창에 돌려놓기만 하면 된다.

const KEY = 'realestate.recentSearches.v1'
const MAX = 5

export interface RecentSearch {
  /** "sido=서울&type=LAND" 형태의 URL 쿼리 (물음표 없음) */
  query: string
  /** 사람이 읽을 요약 ("서울 강남구 · 토지 · 3~6억") */
  label: string
  /** 저장 시각 (epoch ms) */
  at: number
}

export const loadRecentSearches = (): RecentSearch[] => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 저장 형식이 바뀌었거나 손상된 항목이 섞여도 드롭다운이 깨지지 않게 걸러낸다.
    return parsed
      .filter((r): r is RecentSearch => r && typeof r.query === 'string' && typeof r.label === 'string')
      .slice(0, MAX)
  } catch {
    // 시크릿 모드·저장소 차단 등에서 localStorage 접근 자체가 던질 수 있다.
    return []
  }
}

/** 같은 조건은 중복 저장하지 않고 맨 앞으로 올린다. 최대 5건 유지. */
export const saveRecentSearch = (entry: Omit<RecentSearch, 'at'>): RecentSearch[] => {
  const next = [
    { ...entry, at: Date.now() },
    ...loadRecentSearches().filter((r) => r.query !== entry.query),
  ].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 저장 실패는 기능 손실이 아니라 편의 손실이라 조용히 넘어간다.
  }
  return next
}

export const clearRecentSearches = (): void => {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 위와 같은 이유로 무시 */
  }
}
