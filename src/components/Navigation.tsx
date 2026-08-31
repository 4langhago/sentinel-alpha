import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, Heart, Calculator, Home, Menu, X, UserPlus, LogIn, LogOut, Crown, User, Gavel } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ThemeToggle from './ThemeToggle'

const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  FREE:     { label: '무료',       cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  BASIC:    { label: '베이직',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  PREMIUM:  { label: '프리미엄',   cls: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
  BUSINESS: { label: '비즈니스',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
}

const Navigation = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
  const { user, isLoggedIn, logout, openMembershipModal, remainingViews, dailyLimit } = useAuth()

  const navItems = [
    { path: '/', label: '홈', icon: Home },
    { path: '/search', label: '검색', icon: Search },
    { path: '/auction', label: '경공매', icon: Gavel },
    { path: '/favorites', label: '관심단지', icon: Heart },
    { path: '/calculator', label: '수익계산', icon: Calculator }
  ]

  const isActive = (path: string) => location.pathname === path

  const badge = user ? TIER_BADGE[user.membership] : null

  return (
    <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 transition-colors duration-300">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-black text-slate-900 dark:text-white">시세인사이트</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive(item.path)
                      ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Right side */}
          <div className="hidden lg:flex items-center space-x-2">
            <ThemeToggle />

            {isLoggedIn && user ? (
              <>
                {remainingViews !== null && (
                  <button
                    onClick={openMembershipModal}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      오늘 {remainingViews}/{dailyLimit}건
                    </span>
                  </button>
                )}
                {badge && (
                  <button
                    onClick={openMembershipModal}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${badge.cls} hover:opacity-80 transition-opacity`}
                  >
                    <Crown className="w-3 h-3" />
                    <span>{badge.label}</span>
                  </button>
                )}
                <div className="flex items-center space-x-1.5 text-sm text-slate-700 dark:text-slate-300 px-2">
                  <User className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">{user.name}</span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center space-x-1.5 px-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>로그아웃</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="flex items-center space-x-1.5 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
                >
                  <LogIn className="w-4 h-4" />
                  <span>로그인</span>
                </button>
                <button
                  onClick={() => navigate('/signup')}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-lg hover:shadow-lg hover:shadow-primary-500/30 transition-all font-medium text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>무료 가입</span>
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden flex items-center space-x-2">
            <ThemeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-1 mb-3">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.path)
                        ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
              {isLoggedIn && user ? (
                <>
                  {remainingViews !== null && (
                    <button
                      onClick={() => { openMembershipModal(); setIsMobileMenuOpen(false) }}
                      className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg"
                    >
                      <span className="text-sm font-medium text-amber-700 dark:text-amber-400">오늘 남은 조회</span>
                      <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{remainingViews}/{dailyLimit}건</span>
                    </button>
                  )}
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300">
                      <User className="w-4 h-4" />
                      <span className="font-medium">{user.name}</span>
                      {badge && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      )}
                    </div>
                    <button
                      onClick={() => { logout(); setIsMobileMenuOpen(false) }}
                      className="flex items-center space-x-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>로그아웃</span>
                    </button>
                  </div>
                  <button
                    onClick={() => { openMembershipModal(); setIsMobileMenuOpen(false) }}
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-lg font-medium text-sm"
                  >
                    <Crown className="w-4 h-4" />
                    <span>멤버십 업그레이드</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { navigate('/login'); setIsMobileMenuOpen(false) }}
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg font-medium text-sm"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>로그인</span>
                  </button>
                  <button
                    onClick={() => { navigate('/signup'); setIsMobileMenuOpen(false) }}
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-lg font-medium text-sm"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>무료 회원가입</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}

export default Navigation
