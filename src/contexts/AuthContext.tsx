import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { User, MembershipTier } from '../types/user'
import {
  getCurrentUser,
  login as svcLogin,
  signup as svcSignup,
  logout as svcLogout,
  upgradeMembership as svcUpgrade,
  getRemainingViews,
  getDailyLimit,
  canViewItem,
  recordView,
  getDailyUsage,
} from '../services/authService'

interface AuthContextValue {
  user: User | null
  isLoggedIn: boolean
  remainingViews: number | null
  dailyLimit: number | null
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signup: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  upgradeMembership: (tier: MembershipTier) => void
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
  const [user, setUser] = useState<User | null>(() => getCurrentUser())
  const [remainingViews, setRemainingViews] = useState<number | null>(() =>
    getRemainingViews(getCurrentUser())
  )
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login')
  const [showMembershipModal, setShowMembershipModal] = useState(false)

  const refreshUsage = useCallback(() => {
    setRemainingViews(getRemainingViews(user))
  }, [user])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = svcLogin(email, password)
      if (result.ok) {
        const u = getCurrentUser()
        setUser(u)
        setRemainingViews(getRemainingViews(u))
        setShowAuthModal(false)
      }
      return result
    },
    []
  )

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const result = svcSignup(name, email, password)
      if (result.ok) {
        const u = getCurrentUser()
        setUser(u)
        setRemainingViews(getRemainingViews(u))
        setShowAuthModal(false)
      }
      return result
    },
    []
  )

  const logout = useCallback(() => {
    svcLogout()
    setUser(null)
    setRemainingViews(getRemainingViews(null))
  }, [])

  const upgradeMembership = useCallback(
    (tier: MembershipTier) => {
      if (!user) return
      const updated = svcUpgrade(user.id, tier)
      setUser(updated)
      setRemainingViews(getRemainingViews(updated))
      setShowMembershipModal(false)
    },
    [user]
  )

  const checkCanView = useCallback(
    (itemId: string) => canViewItem(user, itemId),
    [user, remainingViews]
  )

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
        remainingViews,
        dailyLimit: getDailyLimit(user),
        login,
        signup,
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
