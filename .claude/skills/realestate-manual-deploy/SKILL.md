---
name: realestate-manual-deploy
description: sentinel-alpha(시세 인사이트, PUBLIC 저장소, Netlify auction-insight-kr)를 수동 배포하거나, netlify/functions·scripts 수집기(collect, collect:auction, refresh-now)의 공공 API 호출량을 바꾸거나, 환경변수·키 처리 코드를 수정할 때 트리거. typecheck·test·build 게이트, deploy --dry, 공공 API 일일 한도, 공개 저장소 식별자 유출 점검을 다룬다.
---

# Realestate Manual Deploy (sentinel-alpha)

자동배포 예약작업 `AuctionInsightDeploy` 는 403(토큰 만료 추정)으로 2026-10-25 비활성화됐다. 배포는 수동이고 사용자 승인 후에만 한다.

## 1. 배포 게이트

1. `npm run deploy -- --dry` — typecheck·test(vitest)·build 를 순서대로 돌리고 배포하지 않는다(개별 실행: `npm run typecheck`, `npm test`, `npm run build`). 통과 로그를 보여준다.
2. 사용자 승인 후 `npm run deploy` — 같은 검증 후 `netlify deploy --prod --dir=dist --skip-functions-cache`.
   - 실패하면 0·1·5·15분 간격으로 최대 4회 재시도한다(최악 약 21분). 중간에 끊지 않는다.
   - 배포 후 운영 `/api/health` 스모크 테스트를 한다. 스모크 실패는 배포가 됐어도 exit 1 이므로 사이트 상태를 확인하고 사용자에게 알린다.

- 재시도 4회 내내 403/Forbidden 이면 토큰 만료 가능성이 크다(순간 한도일 수도 있음). **토큰 갱신은 사용자 작업** — 토큰을 찾거나 읽으려 하지 않는다.
- 배포 후 데이터 화면과 키 미설정 시 "샘플 데이터 (실제 거래 아님)"·"샘플 데이터 (실제 물건 아님)" 배지 동작이 유지되는지 확인.

## 2. 공공 API 한도

- 온비드(공매) 개발계정 일일 1,000회. 로컬 수집기 `collect-auctions-local.mjs --max` 기본 400, `refresh-now?target=auctions` 기본 400·상한 1,000, 그리고 **스케줄 함수 `refresh-auctions` 가 3시간마다 같은 한도를 쓴다**.
- 국토부 실거래(MOLIT): `refresh-now` 기본 `max_calls` 900·상한 1,000.
- 이 상한을 올리거나 반복 호출·재시도 루프·스케줄 빈도를 늘리는 변경은 사용자 확인 후. 같은 날 수집기·refresh-now·스케줄 함수 호출량이 합산되어 한도를 넘을 수 있다.
- 한도 초과(`LIMITED_NUMBER`/요청제한) 응답 시 재시도하지 말고 다음 날로 미룬다.

## 3. 공개 저장소 점검 (커밋 전 스테이징 diff)

- 키·토큰(`COURT_API_KEY`, `MOLIT_API_KEY`, `ONBID_API_KEY`, `REFRESH_TOKEN`, `TELEGRAM_BOT_TOKEN`), `ALLOWED_USER_IDS` 값, Netlify siteId 등 식별자가 코드·문서·`TASK_TRACKER.md` 에 들어가지 않았는지.
- `VITE_` 접두사 변수는 클라이언트 번들에 노출된다. 서버 전용 키(`*_API_KEY`, `REFRESH_TOKEN`)에 `VITE_` 를 붙이거나 `src/` 에서 참조하지 않는다(카카오맵·Supabase anon 키는 예외적으로 공개 전제).
- `.env*` 파일은 읽거나 커밋하지 않는다. `.gitignore` 는 `.env.development`·`.env.test` 를 무시하지 않으므로 이런 파일이 생기면 스테이징되지 않았는지 확인한다. 공통 절차는 `secrets-security-hardening` 스킬.

## 4. 로컬 실행 포트

- Streamlit 8501, FastAPI 8000, 텔레그램 봇 8080. 8000 은 commute 프록시와 충돌 — 동시 실행 시 commute 를 8001 로.

## 5. 금지

- 게이트 실패를 무시한 배포, 사용자 승인 없는 `--prod` 배포.
- 예약작업 `AuctionInsightDeploy` 를 임의로 다시 활성화(토큰 갱신 확인 전).
- 공공 API 한도 상한 완화.

## 6. 에이전트 연동 (단계별)

| 단계 | 에이전트 | 역할 |
|---|---|---|
| Netlify·예약작업 | `devops-infra-ops` | 배포 토큰 만료(403) 진단, `AuctionInsightDeploy` 재활성화 판단 |
| 보안 검수 | `security-reviewer` | `VITE_` 노출, 서버 전용 키 참조 위치, 공개 저장소 식별자 |
| 테스트 보강 | `test-engineer` | 수집기·함수의 호출 상한 로직 회귀 테스트 |
| 코드 검수 | `code-reviewer` | 재시도 루프·호출량 증가 변경 |
| 완료 확인 | `verifier` | `deploy --dry` 통과와 배포 후 화면 증거 확인 |
| 로드맵 | `project-manager-pm` | `TASK_TRACKER.md` 갱신 |
| 화면 변경 | `designer` | src/ UI 변경 |
