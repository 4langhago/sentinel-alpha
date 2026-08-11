/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Pretendard Variable을 최우선으로 사용, 실패 시 시스템 폰트로 폴백
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'Helvetica Neue',
          'Segoe UI',
          'Apple SD Gothic Neo',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
      colors: {
        // 브랜드 액센트: 실사용 중이던 violet 하드코딩 값을 기준으로 정리한 스케일.
        // CTA·활성 탭·필터칩·페이지네이션 등 "브랜드/상호작용" 신호에만 사용하고
        // 차트 선/데이터 표현에는 절대 사용하지 않는다 (chart.* 토큰 사용).
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // 데이터 시맨틱 토큰: 상승/하락/중립. 국내 관습대로 상승=rose, 하락=blue.
        data: {
          up: '#e11d48',        // rose-600 — 상승
          'up-soft': '#ffe4e6', // rose-100 — 상승 배지/배경
          down: '#2563eb',      // blue-600 — 하락
          'down-soft': '#dbeafe', // blue-100 — 하락 배지/배경
          neutral: '#64748b',   // slate-500 — 보합/변동없음
        },
        // 차트 전용 토큰: 브랜드색과 분리해 "이 색은 데이터"임을 명확히 한다.
        chart: {
          line: '#475569',        // slate-600 — 기본 추세선
          grid: '#e2e8f0',        // slate-200 — 격자선(라이트)
          'grid-dark': '#334155', // slate-700 — 격자선(다크)
          provisional: '#f59e0b', // amber-500 — 당월 미확정(잠정) 구간 표시
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'blink': 'blink 1s step-end infinite',
        'slide-up': 'slideUp 0.5s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
