import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { User, MembershipTier } from '../types/user'
import {
  getCachedUser,
  getCurrentUser,
  onAuthChange,
  login as svcLogin,
  loginWithGoogle as svcLoginWithGoogle,
  signup as svcSignup,
  logout as svcLogout,
  resetPassword as svcResetPassword,
  upgradeMembership as svcUpgrade,
  getRemainingViews,
  getDailyLimit,
  canViewItem,
  recordView,
  AuthResult,
} from '../services/authService'
import { isSupabaseEnabled } from '../services/supabase'

interface AuthContextValue {
  user: User | null
  isLoggedIn: boolean
  /** 최초 세션 복원 중 여부 (헤더 깜빡임 방지용) */
  authLoading: boolean
  /** Supabase 연동 여부. false면 계정이 이 브라우저에만 저장된다. */
  isCloudAuth: boolean
  remainingViews: number | null
  dailyLimit: number | null
  login: (email: string, password: string) => Promise<AuthResult>
  loginWithGoogle: () => Promise<AuthResult>
  signup: (name: string, email: string, password: string) => Promise<AuthResult>
  resetPassword: (email: string) => Promise<AuthResult>
  logout: () => Promise<void>
  upgradeMembership: (tier: MembershipTier) => Promise<void>
  checkCanView: (itemId: string) => boolean
  markViewed: (itemId: string) => void
  refreshUsage: () => void
  showAuthModal: boolean
  authModalTab: 'login' | 'signup'
  openAuthModal: (tab?: 'login' | 'signup') => void
  closeAuthModal: () => void
  showMembershipModal: boolean
  openMembershipModal: () => void
  closeMembershipModal: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // 캐시된 사용자로 즉시 렌더한 뒤, 서버 세션으로 교정한다.
  const [user, setUser] = useState<User | null>(() => getCachedUser())
  const [authLoading, setAuthLoading] = useState(isSupabaseEnabled)
  const [remainingViews, setRemainingViews] = useState<number | null>(() =>
    getRemainingViews(getCachedUser())
  )
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login')
  const [showMembershipModal, setShowMembershipModal] = useState(false)

  const applyUser = useCallback((u: User | null) => {
    setUser(u)
    setRemainingViews(getRemainingViews(u))
  }, [])

  // 최초 마운트 시 실제 세션 확인 + 이후 상태 변화 구독
  useEffect(() => {
    let alive = true
    getCurrentUser()
      .then((u) => {
        if (alive) applyUser(u)
      })
      .finally(() => {
        if (alive) setAuthLoading(false)
      })

    const unsubscribe = onAuthChange((u) => {
      if (alive) applyUser(u)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [applyUser])

  const refreshUsage = useCallback(() => {
    setRemainingViews(getRemainingViews(user))
  }, [user])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await svcLogin(email, password)
      if (result.ok) {
        applyUser(await getCurrentUser())
        setShowAuthModal(false)
      }
      return result
    },
    [applyUser]
  )

  const loginWithGoogle = useCallback(async () => svcLoginWithGoogle(), [])

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await svcSignup(name, email, password)
      // 이메일 인증 대기 상태면 모달을 닫지 않고 안내를 보여준다.
      if (result.ok && !result.needsEmailConfirm) {
        applyUser(await getCurrentUser())
        setShowAuthModal(false)
      }
      return result
    },
    [applyUser]
  )

  const resetPassword = useCallback(async (email: string) => svcResetPassword(email), [])

  const logout = useCallback(async () => {
    await svcLogout()
    applyUser(null)
  }, [applyUser])

  const upgradeMembership = useCallback(
    async (tier: MembershipTier) => {
      if (!user) return
      const updated = await svcUpgrade(user.id, tier)
      if (updated) applyUser(updated)
      setShowMembershipModal(false)
    },
    [user, applyUser]
  )

  const checkCanView = useCallback((itemId: string) => canViewItem(user, itemId), [user, remainingViews])

  const markViewed = useCallback(
    (itemId: string) => {
      recordView(itemId)
      setRemainingViews(getRemainingViews(user))
    },
    [user]
  )

  const openAuthModal = useCallback((tab: 'login' | 'signup' = 'login') => {
    setAuthModalTab(tab)
    setShowAuthModal(true)
  }, [])

  const closeAuthModal = useCallback(() => setShowAuthModal(false), [])
  const openMembershipModal = useCallback(() => setShowMembershipModal(true), [])
  const closeMembershipModal = useCallback(() => setShowMembershipModal(false), [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        authLoading,
        isCloudAuth: isSupabaseEnabled,
        remainingViews,
        dailyLimit: getDailyLimit(user),
        login,
        loginWithGoogle,
        signup,
        resetPassword,
        logout,
        upgradeMembership,
        checkCanView,
        markViewed,
        refreshUsage,
        showAuthModal,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        showMembershipModal,
        openMembershipModal,
        closeMembershipModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
