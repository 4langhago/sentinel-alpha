// 관심 단지 저장
// localStorage를 즉시 반영용 소스로 쓰고, 로그인 상태면 Supabase favorites 테이블과 동기화한다.
// (동기 API를 유지해 UI가 낙관적으로 즉시 반응하도록 함)
import { supabase } from './supabase'

const KEY = 'favorite_complexes'

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

const write = (list: string[]) => localStorage.setItem(KEY, JSON.stringify(list))

export const getFavorites = (): string[] => read()

export const isFavorite = (name: string): boolean => read().includes(name)

/** 관심 등록/해제. 등록 후 상태를 반환한다. */
export const toggleFavorite = (name: string): boolean => {
  const list = read()
  const idx = list.indexOf(name)
  const next = idx >= 0 ? list.filter((n) => n !== name) : [...list, name]
  write(next)

  // 서버 동기화는 실패해도 로컬 동작을 막지 않는다.
  void syncOne(name, idx < 0)
  return idx < 0
}

const syncOne = async (name: string, added: boolean) => {
  if (!supabase) return
  try {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) return
    if (added) {
      await supabase.from('favorites').upsert({ user_id: userId, case_number: name })
    } else {
      await supabase.from('favorites').delete().eq('user_id', userId).eq('case_number', name)
    }
  } catch (e) {
    console.warn('[favorites] 동기화 실패:', e)
  }
}

/**
 * 로그인 직후 호출. 서버 목록과 로컬 목록을 합쳐(합집합) 양쪽을 맞춘다.
 * 로그인 전에 담아둔 관심 단지가 사라지지 않도록 하기 위함.
 */
export const syncFavoritesOnLogin = async (): Promise<string[]> => {
  const local = read()
  if (!supabase) return local

  try {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) return local

    const { data, error } = await supabase.from('favorites').select('case_number').eq('user_id', userId)
    if (error) throw error

    const remote = (data || []).map((r: { case_number: string }) => r.case_number)
    const merged = Array.from(new Set([...remote, ...local]))
    write(merged)

    // 로컬에만 있던 항목을 서버로 올린다.
    const missing = merged.filter((n) => !remote.includes(n))
    if (missing.length > 0) {
      await supabase.from('favorites').upsert(missing.map((n) => ({ user_id: userId, case_number: n })))
    }
    return merged
  } catch (e) {
    console.warn('[favorites] 로그인 동기화 실패:', e)
    return local
  }
}
