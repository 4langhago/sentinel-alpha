# ☁️ GCP 배포 가이드 — Project Sentinel Alpha

## 📁 전체 프로젝트 구조

```
my auction/
├── src/                    ← React 웹앱 (Firebase Hosting)
├── bot/                    ← Telegram 봇 (Cloud Run: sentinel-bot)
│   ├── bot_main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── api/                    ← FastAPI 백엔드 (Cloud Run: sentinel-api)
│   ├── api_server.py
│   ├── scraper.py
│   ├── risk_engine.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── cloudbuild.yaml         ← 전체 CI/CD 파이프라인 (8단계)
└── firebase.json
```

---

## 🔑 Step 1: GCP 프로젝트 초기 설정 (1회만)

```bash
# 프로젝트 ID 확인
gcloud config get-value project

# 필요 API 활성화
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com \
  firebase.googleapis.com
```

---

## 🔐 Step 2: Secret Manager 설정 (1회만)

```bash
# 텔레그램 봇 토큰 (@BotFather에서 발급)
echo -n "YOUR_BOT_TOKEN_HERE" | \
  gcloud secrets create TELEGRAM_BOT_TOKEN --data-file=-

# 허용 사용자 ID (@userinfobot으로 확인)
echo -n "123456789" | \
  gcloud secrets create ALLOWED_USER_IDS --data-file=-

# Cloud Build 서비스 계정에 Secret 접근 권한 부여
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 🚀 Step 3: 전체 배포 (cloudbuild.yaml 실행)

```bash
# 전체 파이프라인 실행 (웹앱 + API 서버 + 텔레그램 봇)
gcloud builds submit --config cloudbuild.yaml .
```

**배포 순서 (cloudbuild.yaml):**
1. React 웹앱 빌드 (`npm run build`)
2. Firebase Hosting 배포 (React 웹앱)
3. FastAPI 이미지 빌드 + 푸시
4. FastAPI Cloud Run 배포 (`sentinel-api`)
5. Telegram Bot 이미지 빌드 + 푸시
6. Telegram Bot Cloud Run 배포 (`sentinel-bot`, API URL 자동 주입)

---

## 📡 Step 4: Webhook 등록 (봇 배포 후 1회)

```bash
# sentinel-bot의 Cloud Run URL 확인
BOT_URL=$(gcloud run services describe sentinel-bot \
  --region=asia-northeast3 --format='value(status.url)')

echo "Bot URL: $BOT_URL"

# Webhook 등록
BOT_TOKEN="YOUR_BOT_TOKEN"
curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${BOT_URL}/webhook"

# Webhook 등록 확인
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

---

## 🔧 Step 5: React 웹앱 API URL 설정

Firebase 배포 전에 `.env.local` 파일 생성:

```bash
# .env.local (Git에 커밋하지 말 것)
VITE_API_BASE_URL=https://sentinel-api-XXXXX.a.run.app
```

또는 `cloudbuild.yaml`의 `npm run build` 전에 환경변수 주입:

```yaml
- name: 'node:18'
  entrypoint: 'bash'
  args:
    - '-c'
    - |
      API_URL=$(gcloud run services describe sentinel-api \
        --region=asia-northeast3 --format='value(status.url)')
      echo "VITE_API_BASE_URL=$$API_URL" > .env.local
      npm run build
```

---

## 🌐 배포 완료 후 접속 URL

| 서비스 | URL |
|---|---|
| React 웹앱 | `https://your-project.web.app` |
| FastAPI 문서 | `https://sentinel-api-XXXXX.a.run.app/docs` |
| API Health | `https://sentinel-api-XXXXX.a.run.app/health` |
| Telegram Bot | 텔레그램에서 `@YourBotName` 검색 |

---

## 🔄 개별 서비스 재배포

```bash
# API 서버만 재배포
docker build -t gcr.io/$PROJECT_ID/sentinel-api ./api
docker push gcr.io/$PROJECT_ID/sentinel-api
gcloud run deploy sentinel-api --image gcr.io/$PROJECT_ID/sentinel-api --region asia-northeast3

# 봇만 재배포
docker build -t gcr.io/$PROJECT_ID/sentinel-bot ./bot
docker push gcr.io/$PROJECT_ID/sentinel-bot
gcloud run deploy sentinel-bot --image gcr.io/$PROJECT_ID/sentinel-bot --region asia-northeast3
```

---

## 🐛 로컬 개발 환경

### React 웹앱
```bash
npm run dev   # http://localhost:5173
```

### FastAPI 서버
```bash
cd api
pip install -r requirements.txt
python api_server.py   # http://localhost:8000
# Swagger UI: http://localhost:8000/docs
```

### Telegram Bot
```bash
cd bot
# bot/.env 파일 생성 (.env.example 복사 후 값 입력)
pip install -r requirements.txt
python bot_main.py   # WEBHOOK_URL 없으면 Polling 모드 자동 실행
```

---

## ⚠️ 비용 주의사항

| 서비스 | 무료 한도 | 예상 월 비용 |
|---|---|---|
| Cloud Run | 200만 요청/월 | $0 (소규모 사용 시) |
| Firebase Hosting | 10GB/월 | $0 |
| Secret Manager | 10,000 접근/월 | $0 |
| Cloud Build | 120분/일 | $0 |

> **min-instances=0** 설정으로 트래픽 없을 때 비용 0원 유지
