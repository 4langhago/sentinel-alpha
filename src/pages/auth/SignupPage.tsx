import React, { useMemo, useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import {
  User as UserIcon,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Check,
  ArrowLeft,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import AuthLayout from './AuthLayout'

type Step = 1 | 2 | 3

const STEP_LABELS = ['약관 동의', '계정 정보', '가입 완료']

/** 비밀번호 강도 판정 (UI 표시 전용, 실제 검증은 서버/Supabase 정책을 따른다) */
const getPasswordStrength = (pw: string) => {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++

  if (score <= 1) return { score, label: '약함', color: 'bg-red-500' }
  if (score <= 3) return { score, label: '보통', color: 'bg-amber-500' }
  return { score, label: '강함', color: 'bg-emerald-500' }
}

/** 다단계 회원가입 페이지: ① 약관 동의 → ② 계정 정보 → ③ 완료 안내 */
const SignupPage = () => {
  const { signup, isLoggedIn, authLoading } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>(1)

  // Step 1: 약관 동의
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeMarketing, setAgreeMarketing] = useState(false)

  // Step 2: 계정 정보
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false)

  if (!authLoading && isLoggedIn) {
    return <Navigate to="/" replace />
  }

  const allRequiredAgreed = agreeTerms && agreePrivacy
  const allAgreed = agreeTerms && agreePrivacy && agreeMarketing

  const toggleAll = (checked: boolean) => {
    setAgreeTerms(checked)
    setAgreePrivacy(checked)
    setAgreeMarketing(checked)
  }

  const nameError = touched.name && !name.trim() ? '이름을 입력해 주세요.' : ''
  const emailError =
    touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '올바른 이메일 형식이 아닙니다.' : ''
  const passwordError =
    touched.password && password.length < 6 ? '비밀번호는 6자 이상이어야 합니다.' : ''
  const passwordConfirmError =
    touched.passwordConfirm && password !== passwordConfirm ? '비밀번호가 일치하지 않습니다.' : ''

  const strength = useMemo(() => getPasswordStrength(password), [password])

  const isStep2Valid =
    name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    password.length >= 6 &&
    password === passwordConfirm

  const goToStep2 = () => {
    if (!allRequiredAgreed) return
    setError('')
    setStep(2)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true, passwordConfirm: true })
    if (!isStep2Valid) return

    setError('')
    setLoading(true)
    try {
      const res = await signup(name.trim(), email.trim(), password)
      if (!res.ok) {
        setError(res.error || '회원가입에 실패했습니다.')
        return
      }
      if (res.needsEmailConfirm) {
        setNeedsEmailConfirm(true)
        setStep(3)
      } else {
        navigate('/', { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={step === 3 ? '가입이 완료되었습니다' : '회원가입'}
      subtitle={
        step === 3
          ? '시세인사이트와 함께 스마트한 부동산 투자를 시작하세요'
          : '무료 가입 후 하루 3건을 확인하세요'
      }
      footer={
        step !== 3 ? (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="text-violet-600 dark:text-violet-400 font-semibold hover:underline">
              로그인
            </Link>
          </p>
        ) : undefined
      }
    >
      {/* 스텝 인디케이터 */}
      <ol className="flex items-center mb-8" aria-label="회원가입 진행 단계">
        {STEP_LABELS.map((label, idx) => {
          const stepNum = (idx + 1) as Step
          const isDone = step > stepNum
          const isCurrent = step === stepNum
          return (
            <li key={label} className="flex-1 flex items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isDone
                      ? 'bg-violet-600 text-white'
                      : isCurrent
                      ? 'bg-violet-600 text-white ring-4 ring-violet-100 dark:ring-violet-900/40'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4" /> : stepNum}
                </div>
                <span
                  className={`mt-1.5 text-[11px] font-medium whitespace-nowrap ${
                    isCurrent ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {label}
                </span>
              </div>
              {idx < STEP_LABELS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mb-4 rounded transition-colors ${
                    step > stepNum ? 'bg-violet-600' : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>

      {/* Step 1: 약관 동의 */}
      {step === 1 && (
        <div className="space-y-4">
          <label className="flex items-center space-x-3 p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-900/40 rounded-xl cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allAgreed}
              onChange={(e) => toggleAll(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
            />
            <span className="text-sm font-bold text-gray-900 dark:text-white">전체 동의하기</span>
          </label>

          <div className="space-y-2 px-1">
            <label className="flex items-center justify-between cursor-pointer select-none py-1.5">
              <span className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-violet-600 dark:text-violet-400 font-semibold">(필수)</span> 이용약관 동의
                </span>
              </span>
            </label>
            <label className="flex items-center justify-between cursor-pointer select-none py-1.5">
              <span className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => setAgreePrivacy(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-violet-600 dark:text-violet-400 font-semibold">(필수)</span> 개인정보처리방침 동의
                </span>
              </span>
            </label>
            <label className="flex items-center justify-between cursor-pointer select-none py-1.5">
              <span className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={agreeMarketing}
                  onChange={(e) => setAgreeMarketing(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-gray-400 dark:text-gray-500 font-semibold">(선택)</span> 마케팅 정보 수신 동의
                </span>
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={goToStep2}
            disabled={!allRequiredAgreed}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-violet-500/30 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <span>다음</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 2: 계정 정보 */}
      {step === 2 && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="signup-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              이름
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="signup-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="홍길동"
                required
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'signup-name-error' : undefined}
                className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors ${
                  nameError
                    ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                    : 'border-gray-200 dark:border-gray-700 focus:ring-violet-500'
                }`}
              />
            </div>
            {nameError && (
              <p id="signup-name-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {nameError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              이메일
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="example@email.com"
                required
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'signup-email-error' : undefined}
                className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors ${
                  emailError
                    ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                    : 'border-gray-200 dark:border-gray-700 focus:ring-violet-500'
                }`}
              />
            </div>
            {emailError && (
              <p id="signup-email-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {emailError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              비밀번호
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="signup-password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                placeholder="6자 이상 입력"
                required
                aria-invalid={!!passwordError}
                aria-describedby="signup-password-strength"
                className={`w-full pl-10 pr-10 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors ${
                  passwordError
                    ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                    : 'border-gray-200 dark:border-gray-700 focus:ring-violet-500'
                }`}
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
            {password && (
              <div id="signup-password-strength" className="mt-2 flex items-center space-x-2">
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${Math.min(strength.score, 5) * 20}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 w-8 shrink-0">{strength.label}</span>
              </div>
            )}
            {passwordError && (
              <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {passwordError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="signup-password-confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              비밀번호 확인
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="signup-password-confirm"
                type={showPwConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, passwordConfirm: true }))}
                placeholder="비밀번호 재입력"
                required
                aria-invalid={!!passwordConfirmError}
                aria-describedby={passwordConfirmError ? 'signup-password-confirm-error' : undefined}
                className={`w-full pl-10 pr-10 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors ${
                  passwordConfirmError
                    ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                    : 'border-gray-200 dark:border-gray-700 focus:ring-violet-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPwConfirm((v) => !v)}
                aria-label={showPwConfirm ? '비밀번호 숨기기' : '비밀번호 표시'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded"
              >
                {showPwConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordConfirmError && (
              <p id="signup-password-confirm-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {passwordConfirmError}
              </p>
            )}
            {!passwordConfirmError && passwordConfirm && password === passwordConfirm && (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>비밀번호가 일치합니다</span>
              </p>
            )}
          </div>

          {error && (
            <div role="alert" className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center space-x-2 pt-1">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="py-3 px-4 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>이전</span>
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-violet-500/30 transition-all duration-300 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              {loading ? '처리 중...' : '가입 완료'}
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            가입 시 이용약관 및 개인정보처리방침에 동의하게 됩니다
          </p>
        </form>
      )}

      {/* Step 3: 완료 안내 */}
      {step === 3 && (
        <div className="text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-violet-600 to-indigo-600 rounded-full flex items-center justify-center">
            {needsEmailConfirm ? <Mail className="w-8 h-8 text-white" /> : <Sparkles className="w-8 h-8 text-white" />}
          </div>

          {needsEmailConfirm ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-xl px-5 py-4 text-sm text-left space-y-1">
              <p className="font-semibold">이메일 인증이 필요합니다</p>
              <p>
                <span className="font-medium">{email}</span> 로 인증 메일을 보냈습니다. 메일의 링크를 클릭하면 가입이 완료됩니다.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              환영합니다, <span className="font-semibold text-gray-900 dark:text-white">{name}</span> 님! 회원가입이 완료되었습니다.
            </p>
          )}

          <Link
            to="/login"
            className="inline-flex items-center justify-center w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-violet-500/30 transition-all duration-300"
          >
            로그인하러 가기
          </Link>
        </div>
      )}
    </AuthLayout>
  )
}

export default SignupPage
