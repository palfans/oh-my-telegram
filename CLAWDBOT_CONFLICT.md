# Clawdbot vs oh-my-telegram

## 🔍 문제 원인

두 프로세스가 **같은 텔레그램 봇 토큰**을 사용해서 충돌 발생:

```
clawdbot-gateway ←┐
├─ 같은 봇 (<REDACTED_BOT_TOKEN>)
oh-my-telegram    ←┘
```

**결과:** clawdbot가 먼저 응답을 가져갔습니다.

---

## ✅ 해결 방법

### 방법 1: clawdbot 종료 (추천)

```bash
# clawdbot 종료
killall clawdbot clawdbot-gateway

# 확인
ps aux | grep clawdbot
```

그 후 oh-my-telegram만 사용:

```bash
cd /Users/eunoo/projects/oh-my-telegram
node dist/cli.js
```

### 방법 2: 새로운 봇 토큰 발급 (clawdbot 유지)

1. **@BotFather**에서 새 봇 생성
   ```
   /newbot
   OhMyOpenCodeBot
   ```

2. 새 봇 토큰 받기

3. .env 파일 업데이트:
   ```env
   TELEGRAM_BOT_TOKEN=새로운_봇_토큰
   ALLOWED_USERS=*
   ```

4. oh-my-telegram 재시작:
   ```bash
   # 기존 봇 중지
   kill 85795
   
   # 새 설정으로 시작
   node dist/cli.js
   ```

---

## 🎯 추천: 방법 1

**이유:**
- clawdbot는 일반 AI 어시스턴트
- oh-my-telegram은 OpenCode 코딩 전용
- 목적이 다르니까 분리하는 것이 좋음

**clawdbot가 필요하면:**
- 나중에 재시작: `clawdbot`
- 또는 새 봇으로 oh-my-telegram 설치

---

## 📊 비교

| 기능 | clawdbot | oh-my-telegram |
|------|----------|----------------|
| 목적 | 일반 AI | 코딩 AI |
| 사용법 | 대화/질문 | 리팩토링/코딩 |
| OpenCode | ❌ | ✅ |
| sisyphus | ❌ | ✅ |

**결론:** 코딩 작업은 oh-my-telegram을 사용하세요!
