# oh-my-telegram

> oh-my-opencode를 위한 텔레그램 인터페이스 - sisyphus가 텔레그램으로 대화합니다

## 🎯 목적

**oh-my-telegram**은 텔레그램과 OpenCode를 연결하여 다음을 가능하게 합니다:

- 텔레그램으로 sisyphus/oracle/prometheus 에이전트와 대화
- 원격 코딩 작업 실행
- AI 에이전트와 회의 진행
- 휴대폰으로 장기 실행 작업 모니터링

## 📦 설치

```bash
# 전역 설치
npm install -g oh-my-telegram

# 또는 npx 사용
npx oh-my-telegram
```

## ⚙️ 설정

`oh-my-telegram.json` 생성:

```json
{
  "telegram": {
    "botToken": "YOUR_BOT_TOKEN",
    "allowedUsers": ["123456789", "987654321"],
    "polling": true
  },
  "opencode": {
    "defaultAgent": "sisyphus",
    "workingDirectory": "/path/to/your/project",
    "sessionPrefix": "telegram",
    "opencodePath": "opencode"
  }
}
```

또는 `.env` 파일 사용:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_USERS=123456789,987654321
DEFAULT_AGENT=sisyphus
WORKING_DIRECTORY=/Users/eunoo/projects/daemons
SESSION_PREFIX=telegram
OPENCODE_PATH=opencode
```

## 🤖 텔레그램 봇 설정

1. [@BotFather](https://t.me/botfather)에서 봇 생성:
   ```
   /newbot
   ```

2. 봇 토큰 받기

3. [@userinfobot](https://t.me/userinfobot)에서 텔레그램 User ID 받기

4. oh-my-telegram 설정

## 🚀 사용법

```bash
# 봇 시작
oh-my-telegram

# 또는 커스텀 설정으로
oh-my-telegram /path/to/config.json

# 또는 npx로
npx oh-my-telegram
```

## 💬 명령어

### 에이전트 명령어

```
/sisyphus 함수 리팩토링해줘
/oracle 이 코드 설명해줘
/prometheus 새 기능 계획해줘
/librarian React 문서 찾아줘
/metis 요구사항 분석해줘
```

### 일반 명령어

- `/start` - 봇 시작
- `/help` - 도움말 표시

### 기본 동작

명령어 없이 메시지를 보내면 기본 에이전트가 사용됩니다:

```
함수 리팩토링해줘
```

## 🏗️ 아키텍처

```
텔레그램 (사용자)
    ↓
oh-my-telegram (텔레그램 봇)
    ↓ opencode run
OpenCode CLI
    ↓
oh-my-opencode 에이전트 (sisyphus, oracle, ...)
    ↓ 결과
oh-my-telegram
    ↓
텔레그램 (사용자)
```

## 📋 세션 관리

- 각 텔레그램 채팅마다 독립적인 OpenCode 세션
- 세션 형식: `telegram-{chatId}`
- 세션은 봇 실행 중 유지
- 비활성 세션 (>1시간)은 자동 삭제

## 🔒 보안

- **사용자 화이트리스트**: 허용된 사용자만 봇 사용 가능
- **설정 방법**: config의 `allowedUsers` 또는 `ALLOWED_USERS` env var
- **ID 확인**: [@userinfobot](https://t.me/userinfobot)에서 ID 받기

## 🛠️ 개발

```bash
# 의존성 설치
npm install

# 빌드
npm run build

# 개발 모드 (watch)
npm run dev

# 시작
npm start
```

## 📁 프로젝트 구조

```
oh-my-telegram/
├── src/
│   ├── cli.ts              # CLI 진입점
│   ├── telegram-bot.ts     # 텔레그램 봇 로직
│   ├── opencode-bridge.ts  # OpenCode CLI 브릿지
│   └── index.ts            # 내보내기
├── package.json
├── tsconfig.json
├── oh-my-telegram.json     # 예제 설정
└── README.md
```

## 🤝 clawdbot과의 통합

clawdbot (현재 moltbot)으로 텔레그램을 이미 사용 중이라면, oh-my-telegram은 이를 보완합니다:

- clawdbot: 텔레그램 인터페이스를 갖춘 일반 AI 어시스턴트
- oh-my-telegram: 전문 OpenCode 에이전트 인터페이스

두 봇을 동시에 다른 계정으로 실행할 수 있습니다!

## 📝 라이선스

MIT

## 🙏 감사의 말

- [Telegraf](https://telegraf.js.org/) 기반
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) 통합
- [clawdbot](https://github.com/clawdbot/clawdbot) 텔레그램 확장에서 영감
