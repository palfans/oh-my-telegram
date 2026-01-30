# oh-my-telegram 시스템 서비스 관리

## 🚀 설치

```bash
./install-service.sh
```

이 스크립트는 다음을 자동으로 수행합니다:
1. plist 파일을 ~/Library/LaunchAgents/에 복사
2. launchd에 서비스 등록
3. 서비스 시작
4. 상태 확인

## 📋 수동 설치 (선택사항)

### 1단계: plist 파일 설치

```bash
cp com.oh-my-telegram.bot.plist ~/Library/LaunchAgents/
```

### 2단계: 서비스 등록

```bash
launchctl load ~/Library/LaunchAgents/com.oh-my-telegram.bot.plist
```

### 3단계: 서비스 시작

```bash
launchctl start com.oh-my-telegram.bot
```

## 🛠️ 서비스 관리

### 서비스 시작
```bash
launchctl start com.oh-my-telegram.bot
```

### 서비스 중지
```bash
launchctl stop com.oh-my-telegram.bot
```

### 서비스 재시작
```bash
launchctl kickstart -k com.oh-my-telegram.bot
```

### 서비스 제거
```bash
launchctl unload ~/Library/LaunchAgents/com.oh-my-telegram.bot.plist
rm ~/Library/LaunchAgents/com.oh-my-telegram.bot.plist
```

### 상태 확인
```bash
launchctl list | grep oh-my-telegram
```

### 로그 확인
```bash
# 실시간 로그
tail -f /Users/eunoo/projects/oh-my-telegram/bot.log

# 에러 로그
tail -f /Users/eunoo/projects/oh-my-telegram/bot-error.log
```

## 🔧 plist 파일 설정

### 자동 시작 (RunAtLoad)
```xml
<key>RunAtLoad</key>
<true/>
```
→ 부팅 시 자동으로 시작됩니다

### 항상 실행 (KeepAlive)
```xml
<key>KeepAlive</key>
<true/>
```
→ 크래시되면 자동으로 재시작됩니다

### 재시작 지연 (RestartDelay)
```xml
<key>RestartDelay</key>
<integer>5</integer>
```
→ 크래시 후 5초 뒤에 재시작

### 종료 타임아웃 (ExitTimeOut)
```xml
<key>ExitTimeOut</key>
<integer>300</integer>
```
→ 정상 종료 아닌 크래시 시 300초 대기

## 🎯 기능

✅ **부팅 시 자동 시작**
✅ **크래시 시 자동 재시작**
✅ **로그 파일 자동 관리**
✅ **프로세스 우선순위 (Nice: 1)**
✅ **파일 디스크립터 제한 (1024)**

## 🔄 개발 중 서비스 사용

개발 중에는 서비스 대신 수동으로 실행하는 것이 좋습니다:

```bash
# 서비스 중지
launchctl stop com.oh-my-telegram.bot

# 수동 실행 (개발 모드)
node dist/cli.js

# 또는 watch 모드
npm run dev

# 완료 후 다시 서비스 시작
launchctl start com.oh-my-telegram.bot
```

## 📊 모니터링

```bash
# 서비스 상태
launchctl list | grep oh-my-telegram

# PID 확인
pgrep -fl oh-my-telegram

# CPU/메모리 사용량
ps aux | grep oh-my-telegram

# 로그 실시간 모니터링
tail -f bot.log
```

## 🐛 문제 해결

### 서비스가 시작되지 않음

1. plist 파일 경로 확인:
   ```bash
   cat ~/Library/LaunchAgents/com.oh-my-telegram.bot.plist
   ```

2. 권한 확인:
   ```bash
   ls -la ~/Library/LaunchAgents/com.oh-my-telegram.bot.plist
   ```

3. 로그 확인:
   ```bash
   cat /Users/eunoo/projects/oh-my-telegram/bot-error.log
   ```

### 서비스가 계속 재시작됨

1. 로그에서 에러 확인:
   ```bash
   tail -50 bot-error.log
   ```

2. OpenCode CLI 확인:
   ```bash
   which opencode
   ```

3. .env 파일 확인:
   ```bash
   cat .env | grep TELEGRAM_BOT_TOKEN
   ```

## ⚙️ plist 설정 수정

설정을 변경하려면:

1. plist 파일 수정
2. 서비스 재로드:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.oh-my-telegram.bot.plist
   launchctl load ~/Library/LaunchAgents/com.oh-my-telegram.bot.plist
   launchctl start com.oh-my-telegram.bot
   ```
