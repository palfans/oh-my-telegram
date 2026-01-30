# oh-my-telegram 실행 가이드 (clawdbot와 함께)

## ⚠️ 현재 상황

clawdbot가 백그라운드에서 실행 중이며 자동 재시작됩니다.

## 🎯 해결 방법

### 방법 1: 잠시 clawdbot 중지 (권장)

```bash
# clawdbot 중지
killall clawdbot clawdbot-gateway

# 10초 대기 (재시작 방지)
sleep 10

# oh-my-telegram 시작
cd /Users/eunoo/projects/oh-my-telegram
node dist/cli.js
```

### 방법 2: 새로운 텔레그램 봇 생성 (추천)

**이유:** clawdbot와 독립적으로 사용

1. **@BotFather**에서 새 봇 생성:
   ```
   /newbot
   이름: SisyphusBot (또는 원하는 이름)
   ```
   
2. 새 봇 토큰 받기

3. .env 업데이트:
   ```bash
   cd /Users/eunoo/projects/oh-my-telegram
   nano .env
   ```
   
   ```env
   TELEGRAM_BOT_TOKEN=새로운_봇_토큰
   ALLOWED_USERS=*
   ```

4. 봇 재시작:
   ```bash
   # 기존 봇 중지
   pkill -f "node dist/cli.js"
   
   # 새 설정으로 시작
   node dist/cli.js
   ```

## 💬 테스트

봇이 시작되면 텔레그램에서:

```
/start
/sisyphus 안녕!
```

## 🔄 clawdbot 재시작 방법

나중에 clawdbot를 다시 시작하려면:
```bash
clawdbot
```
