# 시세 인사이트 (sise-insight)

국토교통부 실거래가 공개시스템 데이터를 기반으로 아파트·오피스텔·상가·토지 등의 실거래 시세를 검색·분석하는 웹 서비스입니다.

> 이 프로젝트는 원래 "한국 법원 경매 검색 앱"으로 시작했으나, 실거래가 기반 시세 분석 서비스로 방향을 전환했습니다.

## 🚀 주요 기능

- 🔍 **실거래 검색** — 지역/기간/거래 유형(매매·전월세)별 검색
- 🏢 **단지 상세** — 특정 단지의 거래 이력과 평당가 추이 확인
- 📊 **시세 요약 & 차트** — 지역별 중위 평당가, 월별 추이
- 🧮 **수익 계산기**
- ⭐ **관심 단지 관리**
- 🔐 **회원 인증** — Supabase 기반 로그인/회원가입, 미설정 시 localStorage 폴백
- 💳 **멤버십/일일 조회 한도** — 등급별 일일 조회 건수 제한

## 🛠️ 기술 스택

- **React 18 + TypeScript** — UI
- **Vite** — 빌드 도구
- **Tailwind CSS** — 스타일링
- **React Router** — 라우팅
- **Supabase** — 인증 및 사용자 프로필 저장
- **Netlify Functions** — 실거래 데이터 API (`netlify/functions`)
- **Node.js 스크립트** — 국토교통부 API에서 실거래 데이터를 수집해 조회용 샤드로 저장 (`scripts/collect-local.mjs`)

## 📦 설치 및 실행

### 전제 조건

Node.js와 npm이 설치되어 있어야 합니다.

```bash
npm install
```

### 개발 서버

```bash
npm run dev       # 프론트엔드(Vite)만 실행
npm run dev:api   # 로컬 API 서버만 실행 (netlify/functions 를 흉내내는 개발용 서버)
npm run dev:all   # 위 두 개를 동시에 실행
```

### 실거래 데이터 수집

국토교통부 실거래가 공개 API 키(`MOLIT_API_KEY`)를 `.env.local`에 설정한 뒤 실행합니다.

```bash
# 빠른 검증 (서울, 1개월, 최대 20건)
npm run collect -- --sido 서울 --months 1 --max 20

# 전체 수집
npm run collect
```

수집 결과는 `netlify/functions/data/` 아래에 조회용 샤드 파일로 저장되며, 로컬 API 서버(`dev-api`)와 배포된 Netlify Functions가 이 샤드를 읽어 응답합니다.

### 빌드

```bash
npm run build     # tsc --noEmit 타입 체크 후 vite build
npm run typecheck # 타입 체크만 실행
npm run preview   # 빌드 결과 미리보기
```

## 📁 프로젝트 구조 (요약)

```
src/
├── components/          # React 컴포넌트 (Navigation, Footer, TradeCard, PriceTrendChart 등)
├── pages/                # 페이지 컴포넌트 (HomePage, SearchPage, ComplexPage, CalculatorPage, FavoritesPage, auth/)
├── services/             # authService, supabase 등 서비스 레이어
├── types/                # TypeScript 타입 정의
└── App.tsx               # 메인 앱 컴포넌트

netlify/functions/
├── api.mjs               # 실거래 조회 API (샤드에서 필요한 부분만 읽어 응답)
├── refresh-trades.mjs    # 실거래 데이터 갱신 함수
├── refresh-now.mjs       # 수동 갱신 트리거
├── lib/                  # collect(수집), storage(샤딩/조회), regionCodes 등 공통 로직
└── data/                 # 수집된 실거래 데이터 샤드

scripts/
├── collect-local.mjs     # 로컬에서 실거래 데이터를 수집해 샤드로 저장
└── dev-api.mjs           # 로컬 개발용 API 서버

supabase/
└── schema.sql            # 사용자 프로필(profiles) 테이블 등 스키마
```

## 🔧 환경 변수

```bash
cp .env.example .env.local
```

주요 변수:
- `MOLIT_API_KEY` — 국토교통부 실거래가 공개 API 서비스 키 (데이터 수집용)
- Supabase 관련 키 — 인증 사용 시 설정 (`.env.example` 참고). 미설정 시 인증은 localStorage 폴백 모드로 동작합니다.

## 🚀 배포

Netlify 배포를 기준으로 합니다 (`netlify.toml` 참고).

```bash
npm run build
```

빌드 명령과 함수 디렉터리(`netlify/functions`)는 `netlify.toml`에 정의되어 있습니다.

## 📝 라이선스

MIT License
