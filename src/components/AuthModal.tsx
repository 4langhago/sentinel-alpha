import React, { useState } from 'react'
import { X, Mail, Lock, User, Eye, EyeOff, LogIn, UserPlus, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const AuthModal = () => {
  const {
    showAuthModal,
    authModalTab,
    closeAuthModal,
    login,
    signup,
    loginWithGoogle,
    resetPassword,
    isCloudAuth,
  } = useAuth()

  const [tab, setTab] = useState<'login' | 'signup'>(authModalTab)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    setTab(authModalTab)
    setError('')
    setNotice('')
    setName('')
    setEmail('')
    setPassword('')
  }, [authModalTab, showAuthModal])

  if (!showAuthModal) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      if (tab === 'login') {
        const res = await login(email, password)
        if (!res.ok) setError(res.error || '로그인 실패')
      } else {
        if (!name.trim()) { setError('이름을 입력하세요.'); return }
        if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return }
        const res = await signup(name, email, password)
        if (!res.ok) setError(res.error || '회원가입 실패')
        else if (res.needsEmailConfirm) {
          setNotice(`${email} 로 인증 메일을 보냈습니다. 메일의 링크를 클릭하면 가입이 완료됩니다.`)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    const res = await loginWithGoogle()
    if (!res.ok) setError(res.error || '구글 로그인에 실패했습니다.')
  }

  const handleForgotPassword = async () => {
    setError('')
    setNotice('')
    if (!email.trim()) {
      setError('비밀번호를 재설정할 이메일을 입력해 주세요.')
      return
    }
    const res = await resetPassword(email)
    if (!res.ok) setError(res.error || '재설정 메일 발송에 실패했습니다.')
    else setNotice(`${email} 로 비밀번호 재설정 링크를 보냈습니다.`)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAuthModal} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header gradient */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-8 pt-8 pb-6 text-white">
          <button
            onClick={closeAuthModal}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold mb-1">
            {tab === 'login' ? '로그인' : '회원가입'}
          </h2>
          <p className="text-indigo-200 text-sm">
            {tab === 'login'
              ? '계정에 로그인하여 더 많은 물건을 확인하세요'
              : '무료 가입 후 하루 3건을 확인하세요'}
          </p>

          {/* Tab switcher */}
          <div className="flex mt-5 bg-white/10 rounded-xl p-1">
            <button
              onClick={() => { setTab('login'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === 'login' ? 'bg-white text-violet-700 shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              로그인
            </button>
            <button
              onClick={() => { setTab('signup'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === 'signup' ? 'bg-white text-violet-700 shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              회원가입
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'signup' ? '6자 이상 입력' : '비밀번호'}
                required
                className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {notice && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 flex items-center justify-center space-x-2 disabled:opacity-60"
          >
            {tab === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            <span>{loading ? '처리 중...' : tab === 'login' ? '로그인' : '무료 가입'}</span>
          </button>

          {isCloudAuth && (
            <>
              <div className="flex items-center space-x-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">또는</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <button
                type="button"
                onClick={handleGoogle}
                className="w-full py-3 border border-gray-200 rounded-xl font-semibold text-gray-700 text-sm hover:bg-gray-50 transition-colors"
              >
                구글 계정으로 계속하기
              </button>
            </>
          )}

          {!isCloudAuth && (
            <p className="text-center text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
              현재 계정이 이 브라우저에만 저장됩니다. Supabase 설정 후 기기 간 로그인이 가능합니다.
            </p>
          )}

          {tab === 'login' && isCloudAuth && (
            <p className="text-center text-sm">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-gray-500 hover:text-violet-600 hover:underline"
              >
                비밀번호를 잊으셨나요?
              </button>
            </p>
          )}

          {tab === 'login' && (
            <p className="text-center text-sm text-gray-500">
              계정이 없으신가요?{' '}
              <button
                type="button"
                onClick={() => { setTab('signup'); setError('') }}
                className="text-violet-600 font-semibold hover:underline"
              >
                무료로 가입하기
              </button>
            </p>
          )}

          {tab === 'signup' && (
            <p className="text-center text-xs text-gray-400">
              가입 시 이용약관 및 개인정보처리방침에 동의하게 됩니다
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

export default AuthModal
