// 인증 서비스
// 1순위: Supabase(실제 계정 DB, 어느 기기에서든 로그인 유지)
// 2순위: localStorage 폴백(환경변수 미설정 시 개발용)
//
// 사용자 프로필은 Supabase의 public.profiles 테이블에 저장한다.
// 스키마는 supabase/schema.sql 참고.
import { User, DailyUsage, MembershipTier, FREE_DAILY_LIMIT, MEMBERSHIP_PLANS } from '../types/user'
import { supabase, isSupabaseEnabled } from './supabase'

// auction_ 접두사는 경매 검색 앱 시절의 잔재이나, 바꾸면 기존 사용자의 로그인 세션·사용량 기록이 초기화되므로 그대로 유지한다.
const STORAGE_KEYS = {
  USER: 'auction_user',
  USERS_DB: 'auction_users_db',
  DAILY_USAGE: 'auction_daily_usage',
}

export type AuthResult = { ok: boolean; error?: string; needsEmailConfirm?: boolean }

const today = () => new Date().toISOString().slice(0, 10)

// --- localStorage 폴백용 유저 DB ---
const getUsersDb = (): Record<string, User & { password: string }> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS_DB) || '{}')
  } catch {
    return {}
  }
}
const saveUsersDb = (db: Record<string, User & { password: string }>) => {
  localStorage.setItem(STORAGE_KEYS.USERS_DB, JSON.stringify(db))
}

// --- 현재 세션 캐시 (Supabase 모드에서도 새로고침 시 즉시 렌더용으로 사용) ---
export const getCachedUser = (): User | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

const saveCachedUser = (user: User | null) => {
  if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user))
  else localStorage.removeItem(STORAGE_KEYS.USER)
}

// Supabase auth user + profiles 행을 앱의 User 타입으로 변환
const toUser = (
  authUser: { id: string; email?: string | null; created_at?: string },
  profile: { name?: string | null; membership?: string | null; membership_expiry?: string | null } | null
): User => ({
  id: authUser.id,
  name: profile?.name || authUser.email?.split('@')[0] || '사용자',
  email: authUser.email || '',
  membership: (profile?.membership as MembershipTier) || 'FREE',
  membershipExpiry: profile?.membership_expiry || undefined,
  createdAt: authUser.created_at || new Date().toISOString(),
})

// 프로필 조회. 행이 없으면(트리거 미설정 등) 즉시 생성해 준다.
const fetchProfile = async (userId: string, fallbackName: string) => {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('name, membership, membership_expiry')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.warn('[auth] 프로필 조회 실패:', error.message)
    return null
  }
  if (data) return data

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: userId, name: fallbackName, membership: 'FREE' })
    .select('name, membership, membership_expiry')
    .maybeSingle()
  if (insertError) {
    console.warn('[auth] 프로필 생성 실패:', insertError.message)
    return null
  }
  return created
}

/** 현재 로그인 사용자를 서버(또는 localStorage)에서 가져온다. */
export const getCurrentUser = async (): Promise<User | null> => {
  if (!supabase) return getCachedUser()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    saveCachedUser(null)
    return null
  }
  const profile = await fetchProfile(data.user.id, data.user.email?.split('@')[0] || '사용자')
  const user = toUser(data.user, profile)
  saveCachedUser(user)
  return user
}

// --- 회원가입 / 로그인 ---
export const signup = async (name: string, email: string, password: string): Promise<AuthResult> => {
  if (!supabase) {
    const db = getUsersDb()
    if (Object.values(db).some((u) => u.email === email)) {
      return { ok: false, error: '이미 사용 중인 이메일입니다.' }
    }
    const id = `user_${Date.now()}`
    const user: User & { password: string } = {
      id,
      name,
      email,
      password,
      membership: 'FREE',
      createdAt: new Date().toISOString(),
    }
    db[id] = user
    saveUsersDb(db)
    const { password: _pw, ...publicUser } = user
    saveCachedUser(publicUser)
    return { ok: true }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })
  if (error) return { ok: false, error: translateAuthError(error.message) }

  // 이메일 확인이 켜져 있으면 session이 없다 → 확인 메일 안내
  if (!data.session) return { ok: true, needsEmailConfirm: true }

  if (data.user) {
    const profile = await fetchProfile(data.user.id, name)
    saveCachedUser(toUser(data.user, profile))
  }
  return { ok: true }
}

export const login = async (email: string, password: string): Promise<AuthResult> => {
  if (!supabase) {
    const db = getUsersDb()
    const found = Object.values(db).find((u) => u.email === email)
    if (!found) return { ok: false, error: '등록되지 않은 이메일입니다.' }
    if (found.password !== password) return { ok: false, error: '비밀번호가 올바르지 않습니다.' }
    const { password: _pw, ...publicUser } = found
    saveCachedUser(publicUser)
    return { ok: true }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: translateAuthError(error.message) }
  if (data.user) {
    const profile = await fetchProfile(data.user.id, data.user.email?.split('@')[0] || '사용자')
    saveCachedUser(toUser(data.user, profile))
  }
  return { ok: true }
}

/** 구글 소셜 로그인 (Supabase 대시보드에서 Google provider 활성화 필요) */
export const loginWithGoogle = async (): Promise<AuthResult> => {
  if (!supabase) return { ok: false, error: '소셜 로그인은 Supabase 설정 후 사용할 수 있습니다.' }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) return { ok: false, error: translateAuthError(error.message) }
  return { ok: true }
}

export const resetPassword = async (email: string): Promise<AuthResult> => {
  if (!supabase) return { ok: false, error: '비밀번호 재설정은 Supabase 설정 후 사용할 수 있습니다.' }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  })
  if (error) return { ok: false, error: translateAuthError(error.message) }
  return { ok: true }
}

export const logout = async (): Promise<void> => {
  if (supabase) await supabase.auth.signOut()
  saveCachedUser(null)
}

/** 로그인/로그아웃 상태 변화 구독. 해제 함수를 반환한다. */
export const onAuthChange = (cb: (user: User | null) => void): (() => void) => {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      saveCachedUser(null)
      cb(null)
      return
    }
    const profile = await fetchProfile(session.user.id, session.user.email?.split('@')[0] || '사용자')
    const user = toUser(session.user, profile)
    saveCachedUser(user)
    cb(user)
  })
  return () => data.subscription.unsubscribe()
}

// Supabase 영문 에러 메시지를 한국어로 변환
const translateAuthError = (message: string): string => {
  const m = message.toLowerCase()
  if (m.includes('already registered') || m.includes('already been registered'))
    return '이미 사용 중인 이메일입니다.'
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (m.includes('email not confirmed')) return '이메일 인증을 완료한 뒤 로그인해 주세요.'
  if (m.includes('password should be at least')) return '비밀번호는 6자 이상이어야 합니다.'
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return '이메일 형식이 올바르지 않습니다.'
  if (m.includes('rate limit') || m.includes('too many')) return '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'
  return message
}

// --- 멤버십 업그레이드 (결제 연동 전 시뮬레이션) ---
export const upgradeMembership = async (userId: string, tier: MembershipTier): Promise<User | null> => {
  const expiry = new Date()
  expiry.setMonth(expiry.getMonth() + 1)

  if (!supabase) {
    const db = getUsersDb()
    const entry = db[userId]
    if (!entry) throw new Error('사용자를 찾을 수 없습니다.')
    entry.membership = tier
    entry.membershipExpiry = expiry.toISOString()
    db[userId] = entry
    saveUsersDb(db)
    const { password: _pw, ...publicUser } = entry
    saveCachedUser(publicUser)
    return publicUser
  }

  const { error } = await supabase
    .from('profiles')
    .update({ membership: tier, membership_expiry: expiry.toISOString() })
    .eq('id', userId)
  if (error) {
    console.warn('[auth] 멤버십 변경 실패:', error.message)
    return null
  }
  return getCurrentUser()
}

// --- 일일 조회 한도 (localStorage 기준) ---
const getUsage = (): DailyUsage => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DAILY_USAGE)
    if (!raw) return { date: today(), count: 0, viewedIds: [] }
    const usage: DailyUsage = JSON.parse(raw)
    if (usage.date !== today()) return { date: today(), count: 0, viewedIds: [] }
    return usage
  } catch {
    return { date: today(), count: 0, viewedIds: [] }
  }
}

const saveUsage = (usage: DailyUsage) => {
  localStorage.setItem(STORAGE_KEYS.DAILY_USAGE, JSON.stringify(usage))
}

export const getDailyUsage = (): DailyUsage => getUsage()

export const getDailyLimit = (user: User | null): number | null => {
  if (!user) return FREE_DAILY_LIMIT
  const plan = MEMBERSHIP_PLANS.find((p) => p.tier === user.membership)
  return plan?.dailyLimit ?? null
}

export const getRemainingViews = (user: User | null): number | null => {
  const limit = getDailyLimit(user)
  if (limit === null) return null
  const usage = getUsage()
  return Math.max(0, limit - usage.count)
}

export const canViewItem = (user: User | null, itemId: string): boolean => {
  const limit = getDailyLimit(user)
  if (limit === null) return true
  const usage = getUsage()
  if (usage.viewedIds.includes(itemId)) return true
  return usage.count < limit
}

export const recordView = (itemId: string): void => {
  const usage = getUsage()
  if (!usage.viewedIds.includes(itemId)) {
    usage.viewedIds.push(itemId)
    usage.count += 1
    saveUsage(usage)
  }
}
