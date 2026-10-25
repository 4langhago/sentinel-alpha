# Realestate (시세 인사이트 / sentinel-alpha)
국토교통부 실거래가 기반 시세 분석 서비스. Streamlit + FastAPI + Telegram bot + Vite/React 웹앱.

## 상태
- 웹: Netlify site `auction-insight-kr`. **PUBLIC repo** (`4langhago/sentinel-alpha`, 브랜치 main). 시크릿 커밋 금지.
- Netlify 자동배포 예약작업 `AuctionInsightDeploy` 는 9/7부터 403(토큰 만료 추정)이라 2026-10-25 비활성화. 배포는 수동.

## 구조
- `src/` React 18 + TypeScript + Tailwind (pages, components, services), `index.html`, `vite` 설정
- `netlify/functions/` api, refresh-trades, refresh-auctions, refresh-now / `scripts/` 데이터 수집·배포 (`deploy.mjs`)
- `app.py` Streamlit / `api/` FastAPI (`api_server.py`, risk_engine) / `bot/bot_main.py` 텔레그램 봇
- `supabase/`, `docs/`, `DEVELOPMENT_PLAN.md`, `TASK_TRACKER.md`

## 실행·테스트
- 설치: `npm install`
- 개발: `npm run dev` (Vite), `npm run dev:api`, `npm run dev:all`
- 검증: `npm run typecheck`, `npm test` (vitest), `npm run build`
- 데이터 수집: `npm run collect`, `npm run collect:auction`
- 배포: `npm run deploy` (타입체크·테스트·빌드 통과 후 배포, `-- --dry` 로 검증만)
- Python: `streamlit run app.py` / `python api/api_server.py` / `python bot/bot_main.py`

## 환경변수
`.env.example` 참고, 값은 읽거나 커밋 금지 (`.env.local`, `.env.production` 포함).
`VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_KAKAO_MAP_KEY`, `COURT_API_KEY`, `MOLIT_API_KEY`, `ONBID_API_KEY`, `REFRESH_TOKEN`, `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`, `API_SERVER_URL`, `WEBHOOK_URL`, `PORT`

## 포트
- Streamlit 8501, FastAPI api 8000, Telegram bot 8080
- 8000 은 `apps/commute` Flask 프록시와 충돌 — 동시 실행 시 commute 를 8001 로.

## 안전 규칙
- 공개 저장소: 키·토큰·사용자 ID·Netlify siteId 등 식별자를 문서에 쓰지 않는다.
- 공공 API 일일 호출 한도 준수 (온비드 개발계정 1,000회, 수집기 회당 400회 상한).
- 배포 전 typecheck·test·build 통과 필수. 배포 토큰 갱신은 사용자 작업.
- API 키 미설정 시 샘플 데이터 폴백 배지 표시 동작 유지.

## 연동 도구
- `devops-infra-ops` Netlify·시크릿·예약작업, `project-manager-pm` 로드맵(`TASK_TRACKER.md`)
- OMC `executor`, `designer`, `test-engineer`, `code-reviewer`, `security-reviewer`
