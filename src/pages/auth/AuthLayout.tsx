import React, { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Search, TrendingUp, ShieldCheck, Sparkles } from 'lucide-react'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  /** 하단에 붙는 보조 링크 (예: "계정이 없으신가요? 가입하기") */
  footer?: ReactNode
}

const VALUE_PROPS = [
  { icon: Search, text: '전국 아파트·상가·토지 실거래가 무료 조회' },
  { icon: TrendingUp, text: '데이터 기반 수익률 분석과 리스크 스코어' },
  { icon: ShieldCheck, text: '국토부 공식 데이터 기반, 매일 자동 갱신' },
]

/**
 * 인증 페이지 공통 레이아웃.
 * 데스크톱: 좌측 브랜드/가치제안 패널 + 우측 폼
 * 모바일: 1컬럼 (좌측 패널은 상단 요약 배너로 축소)
 */
const AuthLayout = ({ title, subtitle, children, footer }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* 좌측 브랜드 패널 (데스크톱) */}
      <div className="hidden lg:flex lg:w-[44%] xl:w-[40%] relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-indigo-700">
        {/* 장식용 배경 도형 */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          <Link to="/" className="flex items-center space-x-2 group w-fit">
            <div className="w-10 h-10 bg-white/15 backdrop-blur-sm rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Search className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black">시세인사이트</span>
          </Link>

          <div className="space-y-8 animate-fade-in">
            <div className="space-y-3">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-semibold text-indigo-100">
                <Sparkles className="w-3.5 h-3.5" />
                <span>무료로 시작하세요</span>
              </span>
              <h1 className="text-3xl xl:text-4xl font-black leading-tight">
                더 정확한 시세,
                <br />
                더 빠른 의사결정
              </h1>
              <p className="text-indigo-100 text-sm xl:text-base leading-relaxed">
                실거래가부터 수익률 분석까지, 부동산 투자에 필요한
                <br className="hidden xl:block" />
                모든 데이터를 한 곳에서 확인하세요.
              </p>
            </div>

            <ul className="space-y-4">
              {VALUE_PROPS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start space-x-3">
                  <div className="w-8 h-8 shrink-0 bg-white/15 backdrop-blur-sm rounded-lg flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm text-indigo-50 pt-1.5">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-indigo-200">
            © {new Date().getFullYear()} 시세인사이트. 국토교통부 실거래가 공개시스템 데이터 기반.
          </p>
        </div>
      </div>

      {/* 우측 폼 영역 */}
      <div className="flex-1 flex flex-col">
        {/* 모바일 상단 로고 바 */}
        <div className="lg:hidden flex items-center justify-center py-6 border-b border-gray-100 dark:border-gray-800">
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-black text-gray-900 dark:text-white">시세인사이트</span>
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">
          <div className="w-full max-w-md animate-fade-in">
            <div className="mb-8 text-center sm:text-left">
              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-2">{title}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{subtitle}</p>
            </div>

            {children}

            {footer && <div className="mt-6">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout
