# ⚠️ 텔레그램 봇 충돌 해결 가이드

## 🔍 문제

```
409 Conflict: terminated by other getUpdates request
```

**원인:** clawdbot와 oh-my-telegram이 **같은 봇 토큰**을 사용 중

## ✅ 해결 방법 2가지

### 방법 1: clawdbot 종료 (권장)

```bash
# clawdbot 서비스 중지
launchctl unload ~/Library/LaunchAgents/com.clawdbot.gateway.plist

# 프로세스 중지
killall clawdbot clawdbot-gateway

# oh-my-telegram 재시작
launchctl kickstart -k com.oh-my-telegram.bot
```

### 방법 2: 새로운 봇 토큰 사용

**이미 새 봇을 만드셨나요?** 그럼:

1. 텔레그램에서 새 봇이 작동하는지 확인
2. .env의 토큰이 맞는지 확인
3. clawdbot 중지

## 🚀 빠른 해결

```bash
# 1: clawdbot 종료
launchctl unload ~/Library/LaunchAgents/com.clawdbot.gateway.plist
killall clawdbot clawdbot-gateway

# 2: 확인
ps aux | grep clawdbot

# 3: oh-my-telegram 확인
launchctl list | grep oh-my-telegram
```

## 💡 해결 후 테스트

텔레그램에서:
```
/start
/sisyphus 테스트
```
