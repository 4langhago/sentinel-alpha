---
name: realestate-manual-deploy
description: sentinel-alpha(시세 인사이트, PUBLIC 저장소, Netlify auction-insight-kr)를 수동 배포하거나, netlify/functions·scripts 수집기(collect, collect:auction, refresh-now)의 공공 API 호출량을 바꾸거나, 환경변수·키 처리 코드를 수정할 때 트리거. typecheck·test·build 게이트, deploy --dry, 공공 API 일일 한도, 공개 저장소 식별자 유출 점검을 다룬다.
---

# Realestate Manual Deploy (sentinel-alpha)

자동배포 예약작업 `AuctionInsightDeploy` 는 403(토큰 만료 추정)으로 2026-10-25 비활성화됐다. 배포는 수동이고 사용자 승인 후에만 한다.

## 1. 배포 게이트

1. `npm run typecheck`
2. `npm test` (vitest run)
3. `npm run build` (tsc --noEmit && vite build)
4. `npm run deploy -- --dry` — 위 검증만 하고 배포하지 않는다. 여기까지 통과를 보여준다.
5. 사용자 승인 후 `npm run deploy` → `netlify deploy --prod --dir=dist`.

- 배포가 403/인증 오류로 실패하면 Netlify 토큰 만료다. **토큰 갱신은 사용자 작업** — 토큰을 찾거나 읽으려 하지 않는다.
- 배포 후 사이트에서 데이터 화면과 "샘플 데이터 폴백" 배지 동작(키 미설정 시 표시)이 유지되는지 확인.

## 2. 공공 API 한도

- 온비드 개발계정 일일 1,000회. 경매 수집기 `collect-auctions-local.mjs` 의 `--max` 기본 400, `refresh-now` 함수의 `max_calls` 상한 1,000(기본 900).
- 이 상한을 올리거나 반복 호출·재시도 루프·스케줄 빈도를 늘리는 변경은 사용자 확인 후. 한 날 수집기와 refresh 함수를 같이 돌리면 합산이 한도를 넘을 수 있다.
- 한도 초과(`LIMITED_NUMBER`/요청제한) 응답 시 재시도하지 말고 다음 날로 미룬다.

## 3. 공개 저장소 점검 (커밋 전 스테이징 diff)

- 키·토큰(`COURT_API_KEY`, `MOLIT_API_KEY`, `ONBID_API_KEY`, `REFRESH_TOKEN`, `TELEGRAM_BOT_TOKEN`), `ALLOWED_USER_IDS` 값, Netlify siteId 등 식별자가 코드·문서·`TASK_TRACKER.md` 에 들어가지 않았는지.
- `VITE_` 접두사 변수는 클라이언트 번들에 노출된다. 서버 전용 키(`*_API_KEY`, `REFRESH_TOKEN`)에 `VITE_` 를 붙이거나 `src/` 에서 참조하지 않는다(카카오맵·Supabase anon 키는 예외적으로 공개 전제).
- `.env`, `.env.local`, `.env.production` 은 읽거나 커밋하지 않는다. 공통 절차는 `secrets-security-hardening` 스킬.

## 4. 로컬 실행 포트

- Streamlit 8501, FastAPI 8000, 텔레그램 봇 8080. 8000 은 commute 프록시와 충돌 — 동시 실행 시 commute 를 8001 로.

## 5. 금지

- 게이트 실패를 무시한 배포, 사용자 승인 없는 `--prod` 배포.
- 예약작업 `AuctionInsightDeploy` 를 임의로 다시 활성화(토큰 갱신 확인 전).
- 공공 API 한도 상한 완화.
