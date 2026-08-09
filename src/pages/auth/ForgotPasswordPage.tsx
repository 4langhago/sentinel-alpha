import React, { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import AuthLayout from './AuthLayout'

/** 비밀번호 재설정 메일 발송 페이지. AuthContext.resetPassword 를 그대로 사용한다. */
const ForgotPasswordPage = () => {
  const { resetPassword, isCloudAuth, isLoggedIn, authLoading } = useAuth()

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!authLoading && isLoggedIn) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('이메일을 입력해 주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await resetPassword(email)
      if (!res.ok) setError(res.error || '재설정 메일 발송에 실패했습니다.')
      else setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="비밀번호 찾기"
      subtitle="가입한 이메일로 재설정 링크를 보내드립니다"
      footer={
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          <Link to="/login" className="inline-flex items-center space-x-1 text-violet-600 dark:text-violet-400 font-semibold hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>로그인으로 돌아가기</span>
          </Link>
        </p>
      }
    >
      {!isCloudAuth ? (
        <div role="alert" className="flex items-start space-x-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            현재 이 브라우저에만 계정이 저장되는 로컬 모드라 재설정 메일을 보낼 수 없습니다. 관리자에게 문의하거나
            Supabase 설정 후 이용해 주세요.
          </span>
        </div>
      ) : sent ? (
        <div role="alert" className="flex items-start space-x-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-xl px-4 py-4 text-sm">
          <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">재설정 메일을 보냈습니다</p>
            <p><span className="font-medium">{email}</span> 주소로 비밀번호 재설정 링크를 발송했습니다. 메일함(스팸함 포함)을 확인해 주세요.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              이메일
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="forgot-email"
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

          {error && (
            <div role="alert" className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-violet-500/30 transition-all duration-300 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            {loading ? '발송 중...' : '재설정 메일 보내기'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}

export default ForgotPasswordPage
