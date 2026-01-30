# 🎉 oh-my-telegram 설치 완료 및 테스트 가이드

## ✅ 설치 완료 상태

- ✅ plist 파일 설치됨: `~/Library/LaunchAgents/com.oh-my-telegram.bot.plist`
- ✅ launchd 서비스 등록됨
- ✅ 서비스 시작됨
- ✅ 자동 시작 설정 완료
- ✅ 크래시 시 자동 재시작 설정 완료

---

## 🚀 바로 테스트하기

### 1. 텔레그램에서 봇 검색

**봇 이름:** `@oh_my_sisyphus_bot`

또는 검색: `oh_my_sisyphus_bot`

### 2. 첫 메시지 보내기

```
/start
```

**예상 응답:**
```
🤖 oh-my-telegram - OpenCode Sisyphus on Telegram

Commands:
/sisyphus [message] - Use sisyphus agent
/oracle [message] - Use oracle agent
/prometheus [message] - Use prometheus agent
/librarian [message] - Use librarian agent
/metis [message] - Use metis agent

Or just send a message to use the default agent.
```

### 3. Sisyphus 테스트

```
/sisyphus 안녕! 너는 누구야?
```

### 4. Oracle 테스트

```
/oracle oh-my-opencode가 뭐야?
```

### 5. 코딩 작업 테스트

```
/sisyphus telegram 봇 만드는 방법 설명해줘
```

---

## 🛠️ 서비스 관리 명령어

```bash
# 서비스 상태 확인
launchctl list | grep oh-my-telegram

# 서비스 중지
launchctl stop com.oh-my-telegram.bot

# 서비스 시작
launchctl start com.oh-my-telegram.bot

# 서비스 재시작
launchctl kickstart -k com.oh-my-telegram.bot

# 로그 확인
tail -f /Users/eunoo/projects/oh-my-telegram/bot.log
```

---

## 🔄 시스템 재부팅 후

### 재부팅 후 자동으로 시작됩니다! ✅

서비스가 등록되어 있으므로:
- 컴퓨터 켜진 후 자동으로 시작
- 크래시 시 자동으로 재시작
- 백그라운드에서 계속 실행

---

## 📊 모니터링

### 실시간 로그
```bash
tail -f /Users/eunoo/projects/oh-my-telegram/bot.log
```

### CPU/메모리 사용량
```bash
ps aux | grep oh-my-telegram
```

### 에러 로그
```bash
tail -f /Users/eunoo/projects/oh-my-telegram/bot-error.log
```

---

## 🎯 성공 확인

다음을 확인했는지 체크리스트:

- [x] plist 파일 설치됨
- [x] launchd 서비스 등록됨
- [x] 서비스 실행 중
- [ ] 텔레그램에서 /start 테스트 (사용자 필요)
- [ ] Sisyphus 에이전트 테스트 (사용자 필요)
- [ ] 코딩 작업 테스트 (사용자 필요)

---

## 🐛 문제 해결

### 봇이 응답하지 않음

1. 서비스 상태 확인:
   ```bash
   launchctl list | grep oh-my-telegram
   ```

2. 로그 확인:
   ```bash
   tail -50 /Users/eunoo/projects/oh-my-telegram/bot-error.log
   ```

3. 수동 재시작:
   ```bash
   launchctl kickstart -k com.oh-my-telegram.bot
   ```

### 서비스를 제거하고 싶을 때

```bash
launchctl unload ~/Library/LaunchAgents/com.oh-my-telegram.bot.plist
rm ~/Library/LaunchAgents/com.oh-my-telegram.bot.plist
```

---

**지금 바로 텔레그램에서 @oh_my_sisyphus_bot에게 메시지를 보내보세요!** 🚀

첫 메시지: `/start`
