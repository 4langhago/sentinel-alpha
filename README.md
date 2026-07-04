# 한국 법원 경매 검색 앱

한국 전국 법원의 경매 데이터를 검색하고 분석하는 웹 애플리케이션입니다.

## 🚀 기능

- 🔍 **전국 법원 경매 물건 검색**
- 🏠 **물건 종류별 필터링** (아파트, 주택, 상가, 토지, 오피스 등)
- 💰 **투자 금액 설정** (최소/최대 입찰가)
- 📍 **지역별 검색**
- 📊 **상세 정보 표시**
- 🏛️ **법원별 필터링**
- ⭐ **관심 물건 관리**
- 🧮 **투자 수익 계산기**

## 🛠️ 기술 스택

- **React 18** - UI 라이브러리
- **TypeScript** - 타입 안전성
- **Tailwind CSS** - 스타일링
- **Vite** - 빌드 도구
- **Lucide React** - 아이콘
- **React Router** - 라우팅

## 📦 설치 및 실행

### 전제 조건

Node.js (v16 이상)와 npm이 설치되어 있어야 합니다.

### 설치

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm run dev
```

앱이 http://localhost:3000 에서 실행됩니다.

### 빌드

```bash
# 프로덕션 빌드
npm run build

# 빌드된 앱 미리보기
npm run preview
```

## 📁 프로젝트 구조

```
src/
├── components/          # React 컴포넌트
│   ├── Navigation.tsx  # 네비게이션
│   ├── SearchFilters.tsx # 검색 필터
│   └── AuctionList.tsx  # 경매 목록
├── pages/              # 페이지 컴포넌트
│   ├── HomePage.tsx    # 홈페이지
│   ├── SearchPage.tsx  # 검색 페이지
│   ├── DetailPage.tsx  # 상세 정보
│   ├── FavoritesPage.tsx # 관심 물건
│   └── CalculatorPage.tsx # 투자 계산기
├── types/              # TypeScript 타입
│   └── auction.ts      # 경매 관련 타입
├── data/               # 데이터
│   └── mockData.ts     # 모의 데이터
└── App.tsx             # 메인 앱 컴포넌트
```

## 🔄 Git 워크플로우

### 브랜치 전략
- `main` - 프로덕션 코드
- `develop` - 개발 브랜치
- `feature/*` - 기능별 브랜치

### 커밋 메시지 규칙
```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 스타일 수정
refactor: 코드 리팩토링
test: 테스트 관련
chore: 빌드/설정 관련
```

## � 배포

### GitHub Pages 배포

```bash
# GitHub Pages에 배포
npm run deploy

# 특정 저장소에 배포
npm run deploy:github
```

### Google Cloud Platform 배포

1. **Google Cloud Storage + Cloud CDN**
   ```bash
   # GCS에 업로드 후 CDN 설정
   gsutil rsync -r dist/ gs://your-bucket-name/
   ```

2. **Firebase Hosting**
   ```bash
   # Firebase 프로젝트 설정 후 배포
   firebase deploy
   ```

3. **Cloud Run (API 서버)**
   ```bash
   # API 서버 배포
   gcloud run deploy auction-api --source .
   ```

## 🔧 환경 설정

실제 데이터 연동을 위한 환경 변수 설정:

```bash
# .env.local 파일 생성
cp .env.example .env.local

# API 설정
VITE_API_BASE_URL=https://your-api-server.com/api
VITE_APP_NAME=Korean Auction App
```

## 📊 실제 데이터 연동

### 한국 법원 경매 API 연동 방법

1. **법원 경매 포털 API**
   - 대법원 법원 경매 포털 연동
   - 공공데이터포털 API 활용

2. **데이터 수집 방법**
   - 웹 스크래핑 (법적 고려 필요)
   - 공식 API 연동
   - 제3-party 데이터 서비스

3. **API 서버 구성**
   ```typescript
   // Google Cloud Run 예시
   export const auctionApi = {
     searchAuctions: async (params) => {
       const response = await fetch(`${API_BASE_URL}/auctions`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(params)
       })
       return response.json()
     }
   }
   ```

### 배포된 실제 데이터 연동 URL 예시

- **프로덕션**: `https://korean-auction-app.web.app`
- **API 서버**: `https://auction-api-xxxxx.a.run.app`
- **데이터 소스**: 법원 경매 포털 실시간 데이터

## 🎯 주요 기능 설명

### 검색 필터
- **물건 종류**: 아파트, 주택, 상가, 토지 등 선택 가능
- **투자 금액**: 최소/최대 입찰가 범위 설정
- **지역**: 주소로 검색
- **법원**: 특정 법원만 선택
- **경매 상태**: 예정, 진행중, 완료 등 필터링

### 경매 목록
- 카드 형태의 상세 정보 표시
- 최저 입찰가, 감정가, 면적 등 핵심 정보
- 상태별 색상 구분
- 반응형 디자인

## 🚀 개선 계획

- [ ] 실제 법원 API 연동
- [ ] 지도 기반 검색
- [ ] 데이터 시각화
- [ ] 모바일 앱 버전
- [ ] 실시간 알림

## 📝 라이선스

MIT License
