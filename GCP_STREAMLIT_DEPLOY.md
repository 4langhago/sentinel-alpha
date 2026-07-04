# 🚀 GCP Ubuntu 서버 — Streamlit 앱 24시간 무중단 배포 가이드

> **대상 서버**: GCP Compute Engine e2-micro / Ubuntu 22.04 LTS  
> **배포 앱**: `app.py` (Sentinel Alpha AI 경매 대시보드)  
> **접속 URL**: `http://[GCP_외부_IP]:8501`

---

## 📋 전체 흐름 요약

```
[로컬 PC] → (파일 업로드) → [GCP 서버]
                                  ↓
                          1단계: 서버 초기 환경 세팅
                                  ↓
                          2단계: Python 가상환경 + 패키지 설치
                                  ↓
                          3단계: systemd 서비스 등록 (무중단 실행)
                                  ↓
                          4단계: GCP 방화벽 포트 개방 (8501)
                                  ↓
                          5단계: 접속 확인 ✅
```

---

## 🔑 사전 준비 — GCP SSH 접속

GCP 콘솔 → Compute Engine → VM 인스턴스 → **[SSH 버튼 클릭]**  
또는 로컬 터미널에서:

```bash
gcloud compute ssh [인스턴스명] --zone=[영역명]
# 예시
gcloud compute ssh sentinel-alpha --zone=asia-northeast3-a
```

---

## 1단계: 서버 초기 환경 세팅

> ✅ GCP SSH 터미널에 아래 명령어를 **순서대로** 복사·붙여넣기하세요.

```bash
# 패키지 목록 최신화 및 필수 도구 설치
sudo apt update && sudo apt upgrade -y

# Python3, pip, venv 설치
sudo apt install -y python3 python3-pip python3-venv git

# 설치 확인 (버전이 출력되면 성공)
python3 --version
pip3 --version
```

---

## 2단계: 앱 파일 업로드 및 가상환경 설정

### 2-1. 프로젝트 폴더 생성

```bash
# 홈 디렉터리에 앱 폴더 생성
mkdir -p ~/sentinel-alpha
cd ~/sentinel-alpha
```

### 2-2. 파일 업로드 (두 가지 방법 중 선택)

**방법 A — Git으로 클론 (권장)**
```bash
git clone https://github.com/[내_계정]/[내_레포명].git .
```

**방법 B — gcloud로 직접 복사** (로컬 PC 터미널에서 실행)
```bash
# 로컬 PC에서 실행 — app.py 와 requirements.txt 업로드
gcloud compute scp app.py requirements.txt [인스턴스명]:~/sentinel-alpha/ --zone=[영역명]

# 예시
gcloud compute scp app.py requirements.txt sentinel-alpha:~/sentinel-alpha/ --zone=asia-northeast3-a
```

### 2-3. Python 가상환경 생성 및 패키지 설치

> 이후 모든 명령어는 **GCP SSH 터미널**에서 실행합니다.

```bash
# 프로젝트 폴더로 이동
cd ~/sentinel-alpha

# 가상환경 생성 (폴더명: venv)
python3 -m venv venv

# 가상환경 활성화
source venv/bin/activate

# 패키지 설치 (requirements.txt 기준)
pip install --upgrade pip
pip install -r requirements.txt

# 설치 확인
pip show streamlit

# ✅ 테스트 실행 (정상 동작 확인 후 Ctrl+C로 종료)
streamlit run app.py --server.port 8501 --server.address 0.0.0.0
```

> `You can now view your Streamlit app in your browser.` 메시지가 뜨면 성공.  
> **Ctrl + C** 로 종료 후 3단계로 이동합니다.

```bash
# 가상환경 비활성화
deactivate
```

---

## 3단계: systemd 서비스 등록 (무중단 백그라운드 실행)

> 터미널을 닫아도 앱이 꺼지지 않도록 **Linux 서비스**로 등록합니다.

### 3-1. 현재 사용자 이름 확인

```bash
whoami
# 출력 예시: ubuntu  또는  your_username
```

### 3-2. 서비스 파일 생성

> ⚠️ 아래에서 `[사용자명]` 두 곳을 위에서 확인한 실제 사용자명으로 교체하세요.

```bash
sudo nano /etc/systemd/system/auction.service
```

아래 내용을 **그대로 붙여넣기** 후 저장 (`Ctrl+O` → `Enter` → `Ctrl+X`):

```ini
[Unit]
Description=Sentinel Alpha - AI Auction Dashboard (Streamlit)
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=[사용자명]
WorkingDirectory=/home/[사용자명]/sentinel-alpha
ExecStart=/home/[사용자명]/sentinel-alpha/venv/bin/streamlit run app.py \
          --server.port 8501 \
          --server.address 0.0.0.0 \
          --server.headless true \
          --browser.gatherUsageStats false
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=auction

[Install]
WantedBy=multi-user.target
```

> **설정 값 설명**
> | 항목 | 의미 |
> |------|------|
> | `Restart=always` | 앱이 어떤 이유로 종료되어도 자동 재시작 |
> | `RestartSec=10` | 재시작 전 10초 대기 |
> | `--server.headless true` | 브라우저 자동 열기 비활성화 (서버 환경 필수) |
> | `--server.address 0.0.0.0` | 외부 접속 허용 |
> | `WantedBy=multi-user.target` | 서버 부팅 시 자동 실행 |

### 3-3. 서비스 등록 및 시작

```bash
# systemd 설정 다시 로드
sudo systemctl daemon-reload

# 서버 재부팅 시 자동 시작 등록
sudo systemctl enable auction

# 지금 즉시 서비스 시작
sudo systemctl start auction

# 상태 확인 (active (running) 이 보이면 성공 ✅)
sudo systemctl status auction
```

**정상 출력 예시:**
```
● auction.service - Sentinel Alpha - AI Auction Dashboard (Streamlit)
     Loaded: loaded (/etc/systemd/system/auction.service; enabled; ...)
     Active: active (running) since ...
```

### 3-4. 유용한 서비스 관리 명령어

```bash
# 실시간 로그 확인 (오류 추적)
sudo journalctl -u auction -f

# 서비스 재시작 (앱 코드 수정 후)
sudo systemctl restart auction

# 서비스 중단
sudo systemctl stop auction

# 자동시작 해제
sudo systemctl disable auction
```

---

## 4단계: GCP 방화벽 포트 8501 개방

> GCP 콘솔에서 설정하는 방법 **(클릭 방식)** 과 터미널 방식 두 가지를 모두 안내합니다.

### 방법 A — GCP 콘솔 클릭 방식 (권장, 초보자)

1. [GCP 콘솔](https://console.cloud.google.com) 접속
2. 좌측 메뉴 → **VPC 네트워크** → **방화벽**
3. 상단 **방화벽 규칙 만들기** 클릭
4. 아래 값 입력:

| 항목 | 입력값 |
|------|--------|
| 이름 | `allow-streamlit-8501` |
| 네트워크 | `default` |
| 우선순위 | `1000` |
| 트래픽 방향 | **수신** |
| 소스 IP 범위 | `0.0.0.0/0` |
| 프로토콜 및 포트 | **TCP** 체크 → `8501` 입력 |

5. **만들기** 클릭 ✅

### 방법 B — gcloud 터미널 한 줄 명령어 (로컬 PC에서 실행)

```bash
gcloud compute firewall-rules create allow-streamlit-8501 \
  --allow tcp:8501 \
  --source-ranges 0.0.0.0/0 \
  --description "Streamlit Sentinel Alpha Dashboard"
```

---

## 5단계: 외부 IP 확인 및 접속

### GCP 외부 IP 확인

```bash
# GCP SSH 터미널에서 실행
curl -s ifconfig.me
# 출력 예시: 34.64.123.45
```

또는 GCP 콘솔 → Compute Engine → VM 인스턴스 → **외부 IP** 열에서 확인

### 최종 접속 URL

```
http://[GCP_외부_IP]:8501

예시:
http://34.64.123.45:8501
```

> 🌐 위 URL을 브라우저에 입력하면 **Sentinel Alpha 대시보드**가 표시됩니다.

---

## 🔧 코드 수정 후 재배포 방법

앱 코드(`app.py`)를 수정했을 때의 업데이트 절차:

```bash
# 1. 수정된 파일 서버에 업로드 (로컬 PC에서)
gcloud compute scp app.py [인스턴스명]:~/sentinel-alpha/ --zone=[영역명]

# 2. 서비스 재시작 (GCP SSH에서)
sudo systemctl restart auction

# 3. 상태 확인
sudo systemctl status auction
```

---

## 🛡️ 보안 강화 옵션 (선택사항)

### IP 접근 제한 (특정 IP만 허용)

```bash
# 방화벽 규칙에서 0.0.0.0/0 대신 내 IP만 허용
gcloud compute firewall-rules update allow-streamlit-8501 \
  --source-ranges [내_공인_IP]/32
```

### Nginx 리버스 프록시 + HTTPS 설정 (도메인 있는 경우)

```bash
# Nginx 설치
sudo apt install -y nginx certbot python3-certbot-nginx

# Nginx 설정 파일 생성
sudo nano /etc/nginx/sites-available/auction
```

```nginx
server {
    listen 80;
    server_name [내_도메인.com];

    location / {
        proxy_pass         http://127.0.0.1:8501;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 86400;
    }
}
```

```bash
# Nginx 활성화 및 재시작
sudo ln -s /etc/nginx/sites-available/auction /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# HTTPS 인증서 자동 발급 (Let's Encrypt)
sudo certbot --nginx -d [내_도메인.com]
```

---

## ❗ 자주 발생하는 오류 해결

| 증상 | 원인 | 해결 방법 |
|------|------|-----------|
| 브라우저에서 접속 안 됨 | 방화벽 미개방 | 4단계 재확인 |
| `active (failed)` 상태 | 경로 오류 | `sudo journalctl -u auction -n 50` 로 로그 확인 |
| 패키지 설치 오류 | pip 버전 낮음 | `pip install --upgrade pip` 후 재시도 |
| `Permission denied` | 사용자명 불일치 | `whoami` 로 재확인 후 서비스 파일 수정 |
| 재부팅 후 미실행 | enable 미적용 | `sudo systemctl enable auction` 재실행 |

---

*가이드 작성일: 2024 · Sentinel Alpha v1.0 · GCP Ubuntu 22.04 LTS 기준*
