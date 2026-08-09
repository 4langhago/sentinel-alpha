import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, Heart, Calculator, Home, Menu, X, UserPlus, LogIn, LogOut, Crown, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ThemeToggle from './ThemeToggle'

const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  FREE:     { label: '무료',       cls: 'bg-gray-100 text-gray-600' },
  BASIC:    { label: '베이직',     cls: 'bg-blue-100 text-blue-700' },
  PREMIUM:  { label: '프리미엄',   cls: 'bg-violet-100 text-violet-700' },
  BUSINESS: { label: '비즈니스',   cls: 'bg-amber-100 text-amber-700' },
}

const Navigation = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
  const { user, isLoggedIn, logout, openMembershipModal, remainingViews, dailyLimit } = useAuth()

  const navItems = [
    { path: '/', label: '홈', icon: Home },
    { path: '/search', label: '검색', icon: Search },
    { path: '/favorites', label: '관심단지', icon: Heart },
    { path: '/calculator', label: '수익계산', icon: Calculator }
  ]

  const isActive = (path: string) => location.pathname === path

  const badge = user ? TIER_BADGE[user.membership] : null

  return (
    <nav className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50 transition-colors duration-300">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-black text-gray-900 dark:text-white">시세인사이트</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive(item.path)
                      ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center space-x-2">
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
                <div className="flex items-center space-x-1.5 text-sm text-gray-700 dark:text-gray-300 px-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">{user.name}</span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center space-x-1.5 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>로그아웃</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="flex items-center space-x-1.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
                >
                  <LogIn className="w-4 h-4" />
                  <span>로그인</span>
                </button>
                <button
                  onClick={() => navigate('/signup')}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all font-medium text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>무료 가입</span>
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center space-x-2">
            <ThemeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-gray-100 dark:border-gray-800">
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
                        ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
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
                    <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                      <User className="w-4 h-4" />
                      <span className="font-medium">{user.name}</span>
                      {badge && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      )}
                    </div>
                    <button
                      onClick={() => { logout(); setIsMobileMenuOpen(false) }}
                      className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>로그아웃</span>
                    </button>
                  </div>
                  <button
                    onClick={() => { openMembershipModal(); setIsMobileMenuOpen(false) }}
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-lg font-medium text-sm"
                  >
                    <Crown className="w-4 h-4" />
                    <span>멤버십 업그레이드</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { navigate('/login'); setIsMobileMenuOpen(false) }}
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg font-medium text-sm"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>로그인</span>
                  </button>
                  <button
                    onClick={() => { navigate('/signup'); setIsMobileMenuOpen(false) }}
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg font-medium text-sm"
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
