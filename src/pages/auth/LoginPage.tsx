import React, { useState } from 'react'
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import AuthLayout from './AuthLayout'

const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.89c2.28-2.1 3.56-5.19 3.56-8.82Z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.89-3.02c-1.08.73-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z" />
    <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.61l4.01 3.1c.94-2.83 3.59-4.96 6.71-4.96Z" />
  </svg>
)

/** 이메일/비밀번호 로그인 페이지. 기존 AuthContext.login/loginWithGoogle 을 그대로 사용한다. */
const LoginPage = () => {
  const { login, loginWithGoogle, isCloudAuth, isLoggedIn, authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 이미 로그인된 사용자는 홈으로 리다이렉트
  if (!authLoading && isLoggedIn) {
    return <Navigate to="/" replace />
  }

  const from = (location.state as { from?: Location })?.from

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(email, password)
      if (!res.ok) {
        setError(res.error || '로그인에 실패했습니다.')
        return
      }
      navigate(from ? `${from.pathname}${from.search}${from.hash}` : '/', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    const res = await loginWithGoogle()
    if (!res.ok) setError(res.error || '구글 로그인에 실패했습니다.')
  }

  return (
    <AuthLayout
      title="로그인"
      subtitle="계정에 로그인하여 더 많은 물건을 확인하세요"
      footer={
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          아직 계정이 없으신가요?{' '}
          <Link to="/signup" className="text-violet-600 dark:text-violet-400 font-semibold hover:underline">
            무료로 가입하기
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            이메일
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              required
              aria-invalid={!!error}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm transition-colors"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              비밀번호
            </label>
            {/* 로컬 모드에서도 링크는 항상 노출한다. 로컬 모드 안내는 /forgot-password 페이지에서 처리한다. */}
            <Link to="/forgot-password" className="text-xs text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:underline">
              비밀번호를 잊으셨나요?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              required
              aria-invalid={!!error}
              className="w-full pl-10 pr-10 py-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">로그인 상태 유지</span>
        </label>

        {error && (
          <div role="alert" className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-violet-500/30 transition-all duration-300 flex items-center justify-center space-x-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          <LogIn className="w-4 h-4" />
          <span>{loading ? '로그인 중...' : '로그인'}</span>
        </button>

        {isCloudAuth ? (
          <>
            <div className="flex items-center space-x-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-400 dark:text-gray-500">또는</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full py-3 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-gray-700 dark:text-gray-200 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <GoogleIcon />
              <span>구글 계정으로 계속하기</span>
            </button>
          </>
        ) : (
          <p className="text-center text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2">
            현재 계정이 이 브라우저에만 저장됩니다. Supabase 설정 후 기기 간 로그인이 가능합니다.
          </p>
        )}
      </form>
    </AuthLayout>
  )
}

export default LoginPage
