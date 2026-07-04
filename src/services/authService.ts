import { User, DailyUsage, MembershipTier, FREE_DAILY_LIMIT, MEMBERSHIP_PLANS } from '../types/user'

const STORAGE_KEYS = {
  USER: 'auction_user',
  USERS_DB: 'auction_users_db',
  DAILY_USAGE: 'auction_daily_usage',
}

const today = () => new Date().toISOString().slice(0, 10)

// --- User DB helpers (simulate backend) ---
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

// --- Current user session ---
export const getCurrentUser = (): User | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

const saveCurrentUser = (user: User) => {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user))
}

// --- Auth actions ---
export const signup = (
  name: string,
  email: string,
  password: string
): { ok: boolean; error?: string } => {
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
  saveCurrentUser(publicUser)
  return { ok: true }
}

export const login = (
  email: string,
  password: string
): { ok: boolean; error?: string } => {
  const db = getUsersDb()
  const found = Object.values(db).find((u) => u.email === email)
  if (!found) return { ok: false, error: '등록되지 않은 이메일입니다.' }
  if (found.password !== password) return { ok: false, error: '비밀번호가 올바르지 않습니다.' }
  const { password: _pw, ...publicUser } = found
  saveCurrentUser(publicUser)
  return { ok: true }
}

export const logout = () => {
  localStorage.removeItem(STORAGE_KEYS.USER)
}

// --- Membership upgrade (simulate payment) ---
export const upgradeMembership = (
  userId: string,
  tier: MembershipTier
): User => {
  const db = getUsersDb()
  const entry = db[userId]
  if (!entry) throw new Error('사용자를 찾을 수 없습니다.')

  const expiry = new Date()
  expiry.setMonth(expiry.getMonth() + 1)
  entry.membership = tier
  entry.membershipExpiry = expiry.toISOString()
  db[userId] = entry

  saveUsersDb(db)
  const { password: _pw, ...publicUser } = entry
  saveCurrentUser(publicUser)
  return publicUser
}

// --- Daily usage tracking ---
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
