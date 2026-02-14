# 🔄 Telegram API 409 에러 해결 방법

## 문제

```
409 Conflict: terminated by other getUpdates request
```

이것은 Telegram API가 **이전 polling 세션을 아직 유지**하고 있어서 발생합니다.

## ✅ 해결 방법

### 방법 1: 기다리기 (가장 간단)

Telegram API가 세션을 정리하는 데 1-2분 정도 걸립니다:

```bash
# 1. 서비스 중지
launchctl stop com.oh-my-telegram.bot

# 2. 2분 정도 기다림...
sleep 120

# 3. 다시 시작
launchctl start com.oh-my-telegram.bot
```

### 방법 2: webhook 모드 사용 (권장)

Polling 대신 Webhook을 사용하면 충돌이 발생하지 않습니다:

1. **ngrok 또는 공개 IP 필요**

```bash
# ngrok 설치
brew install ngrok

# 터널링 시작
ngrok http 8080
```

2. .env 수정:
```env
TELEGRAM_BOT_TOKEN=<YOUR_BOT_TOKEN>
ALLOWED_USERS=*
WEBHOOK_URL=https://your-ngrok-url.ngrok.io/telegram-bot
POLLING=false
```

3. 서버 코드 수정 필요 (현재는 polling만 지원)

### 방법 3: bot 토큰 재발급

테스트용으로 새로운 봇을 만들어서 테스트:

1. @BotFather에게 `/revoke` 보내기
2. 새로운 봇 생성
3. .env 업데이트
4. 서비스 재시작

## 🎯 추천 순서

1. **방법 1** (기다리기) - 가장 간단
2. **방법 3** (새 봇) - 테스트용으로 좋음
3. **방법 2** (webhook) - 장기적으로 좋음

---

## 💬 테스트 확인

서비스가 정상적으로 시작되면:

```
🚀 Starting oh-my-telegram...
📱 Default agent: sisyphus
📁 Working directory: /Users/eunoo/projects/daemons
```

그리고 텔레그램에서:
```
/start
/sisyphus 안녕!
```
