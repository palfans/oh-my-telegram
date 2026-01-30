# oh-my-telegram 사용 가이드

## 📋 구현된 기능 목록

### 1. 텔레그램 봇 인터페이스
- ✅ Telegraf 기반 텔레그램 봇
- ✅ 사용자 인증 (화이트리스트)
- ✅ 메시지 수신 및 처리

### 2. OpenCode 브릿지
- ✅ `opencode run` CLI 실행
- ✅ stdout/stderr 캡처
- ✅ 에러 처리

### 3. 에이전트 라우팅
- ✅ `/sisyphus` - 코딩 에이전트
- ✅ `/oracle` - 디버깅/아키텍처
- ✅ `/prometheus` - 계획
- ✅ `/librarian` - 문서
- ✅ `/metis` - 사전 계획
- ✅ 기본 에이전트 설정

### 4. 세션 관리
- ✅ 텔레그램 채팅별 OpenCode 세션
- ✅ `telegram-{chatId}` 형식
- ✅ 자동 세션 정리 (1시간 후)

### 5. 메시지 처리
- ✅ 긴 메시지 분할 (4000자)
- ✅ 타이핑 인디케이터
- ✅ 명령어 파싱

### 6. 설정
- ✅ JSON 파일 지원
- ✅ .env 파일 지원
- ✅ 커맨드라인 인자

### 7. 배포
- ✅ npm 패키지
- ✅ 전역 설치 가능
- ✅ npx 지원

## 🚀 설치 및 설정

### 1. 패키지 설치

```bash
cd /Users/eunoo/projects/oh-my-telegram
npm install
npm run build
npm link  # 전역 설치
```

### 2. 텔레그램 봇 생성

1. [@BotFather](https://t.me/botfather)에서 봇 생성:
   ```
   /newbot
   ```

2. 봇 이름 입력 (예: `MySisyphusBot`)

3. 봇 토큰 받기 (예: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

4. [@userinfobot](https://t.me/userinfobot)에서 텔레그램 User ID 받기

### 3. 설정 파일 생성

**방법 A: JSON 파일**
```bash
cp oh-my-telegram.example.json oh-my-telegram.json
```

`oh-my-telegram.json` 편집:
```json
{
  "telegram": {
    "botToken": "YOUR_BOT_TOKEN",
    "allowedUsers": ["YOUR_TELEGRAM_USER_ID"],
    "polling": true
  },
  "opencode": {
    "defaultAgent": "sisyphus",
    "workingDirectory": "/Users/eunoo/projects/daemons",
    "sessionPrefix": "telegram",
    "opencodePath": "opencode"
  }
}
```

**방법 B: .env 파일**
```bash
cat > .env << 'EOF'
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_USERS=your_telegram_user_id
DEFAULT_AGENT=sisyphus
WORKING_DIRECTORY=/Users/eunoo/projects/daemons
SESSION_PREFIX=telegram
EOF
```

### 4. 봇 시작

```bash
# 개발 모드
npm run dev

# 또는 직접 실행
node dist/cli.js

# 또는 전역 설치 후
oh-my-telegram
```

## 🧪 테스트 절차

### 1. 봇 시작 확인

```bash
cd /Users/eunoo/projects/oh-my-telegram
node dist/cli.js
```

예상 출력:
```
🚀 Starting oh-my-telegram...
📱 Default agent: sisyphus
📁 Working directory: /Users/eunoo/projects/daemons
✅ Bot started (polling mode)
```

### 2. 텔레그램에서 테스트

봇에게 메시지 보내기:

```
/start
```

예상 응답:
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

### 3. 간단한 작업 테스트

```
/sisyphus hello
```

예상 결과: sisyphus가 응답

### 4. 코드 작업 테스트

```
/oracle explain how this works
```

## 📊 clawdbot vs oh-my-telegram 비교

| 기능 | clawdbot | oh-my-telegram |
|------|----------|----------------|
| 목적 | 일반 AI 어시스턴트 | OpenCode 에이전트 인터페이스 |
| 텔레그램 | ✅ | ✅ |
| OpenCode 통합 | ❌ | ✅ (via CLI) |
| 에이전트 | 자체 에이전트 | oh-my-opencode 에이전트 |
| 세션 관리 | ✅ | ✅ |
| 채널 | Telegram + 다수 | Telegram 전용 |

## 🔄 통합 사용 방법

**시나리오**: clawdbot과 oh-my-telegram을 함께 사용

1. **clawdbot**: 일반 대화, 질문, 정보 검색
   ```
   (clawdbot 봇에게) 날씨 알려줘
   ```

2. **oh-my-telegram**: 코딩 작업, 리팩토링
   ```
   (oh-my-telegram 봇에게) /sisyphus 리팩토링해줘
   ```

두 봇을 동시에 실행할 수 있습니다!

## 🛠️ 문제 해결

### 봇이 응답하지 않음

1. OpenCode CLI 설치 확인:
   ```bash
   which opencode
   ```

2. oh-my-opencode 설치 확인:
   ```bash
   npm list -g oh-my-opencode
   ```

3. 권한 확인:
   ```bash
   ls -la ~/.config/opencode/
   ```

### 에이전트 오류

1. oh-my-opencode.json 설정 확인:
   ```bash
   cat ~/.config/opencode/oh-my-opencode.json
   ```

2. 에이전트 모델 확인

### 텔레그램 연결 오류

1. bot_token 확인
2. allowed_users 확인
3. 인터넷 연결 확인

## 📝 향후 개선사항

- [ ] Webhook 모드 지원
- [ ] 파일 업로드/다운로드
- [ ] 스트리밍 출력
- [ ] 세션 지속성 (디스크)
- [ ] 멀티 서버 지원
- [ ] 메트릭 및 모니터링

## 🎯 성공 기준

- ✅ 봇이 시작하고 텔레그램에 연결됨
- ✅ `/start` 명령어가 작동함
- ✅ 에이전트 명령어가 작동함
- ✅ OpenCode CLI가 실행됨
- ✅ 결과가 텔레그램으로 전송됨
- ✅ 세션이 유지됨

## ✅ 완료 체크리스트

- [x] 패키지 구조 설계
- [x] TypeScript 코드 작성
- [x] 컴파일 성공
- [x] Git 저장소 초기화
- [x] README 작성
- [x] 사용 가이드 작성
- [ ] 텔레그램 봇 테스트 (사용자 필요)
- [ ] 실제 작업 실행 테스트 (사용자 필요)
- [ ] npm 게시 (선택사항)

## 🚀 다음 단계

1. **테스트**: 위 테스트 절차 따라하기
2. **피드백**: 기능 추가 요청
3. **개선**: 버그 수정 및 기능 확장
4. **배포**: npm에 게시 (선택사항)
