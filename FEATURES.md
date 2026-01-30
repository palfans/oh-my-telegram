# oh-my-telegram 기능 상세 설명

## 🔧 핵심 기능

### 1. 텔레그램 인터페이스

**구현:**
- Telegraf 라이브러리 사용
- Telegram Bot API와 통신
- Polling 모드 (기본) 또는 Webhook 모드

**기능:**
- 실시간 메시지 수신
- 사용자 명령어 처리
- 메시지 전송
- 타이핑 인디케이터

**보안:**
- 사용자 화이트리스트
- `allowedUsers` 설정으로만 접근 제어

### 2. OpenCode CLI 브릿지

**구현:**
- `child_process.spawn`으로 OpenCode 실행
- stdout/stderr 캡처
- 비동기 실행

**기능:**
```
사용자 메시지
    ↓
OpenCodeBridge.run()
    ↓
opencode run "message" --agent <agent> --session <sessionId>
    ↓
stdout/stderr 캡처
    ↓
결과 반환
```

**특징:**
- 세션별 실행
- 에이전트 선택
- 에러 처리

### 3. 에이전트 라우팅

**지원 에이전트:**

1. **sisyphus** (기본)
   - 코딩 작업
   - 리팩토링
   - 버그 수정
   - 사용법: `/sisyphus refactor this function`

2. **oracle**
   - 디버깅
   - 아키텍처 상담
   - 코드 리뷰
   - 사용법: `/oracle explain this architecture`

3. **prometheus**
   - 작업 계획
   - 설계
   - 사용법: `/prometheus plan a new feature`

4. **librarian**
   - 문서 검색
   - 라이브러리 정보
   - 사용법: `/librarian find React hooks docs`

5. **metis**
   - 요구사항 분석
   - 사전 계획 상담
   - 사용법: `/metis analyze these requirements`

**명령어 파싱:**
```
메시지: "/oracle explain this"
  ↓
파싱: agent = "oracle"
  ↓
추출: message = "explain this"
  ↓
실행: opencode run "explain this" --agent oracle
```

### 4. 세션 관리

**세션 구조:**
```typescript
interface TelegramSession {
  chatId: number;           // 텔레그램 채팅 ID
  opencodeSessionId: string; // OpenCode 세션 ID
  currentAgent: string;     // 현재 에이전트
  createdAt: Date;          // 생성 시간
  lastActivity: Date;       // 마지막 활동 시간
}
```

**세션 라이프사이클:**
```
1. 첫 메시지 수신
   ↓
2. 세션 생성 (telegram-{chatId})
   ↓
3. OpenCode 실행
   ↓
4. 결과 전송
   ↓
5. 세션 업데이트 (lastActivity)
   ↓
6. 1시간 후 비활성 세션 자동 삭제
```

**특징:**
- 각 텔레그램 채팅마다 독립적
- 메모리 내 저장 (Map)
- 자동 정리

### 5. 메시지 처리

**메시지 분할:**
```typescript
chunkMessage(text: string, maxLength = 4000): string[]
```

Telegram 제한 (4096자)을 고려하여:
- 4000자로 분할
- 줄 단위로 끊기
- 순차적 전송

**명령어 처리:**
```
/start  → 도움말
/help   → 사용법
/agent  → 에이전트 전환
기타    → OpenCode 실행
```

### 6. 설정 관리

**JSON 설정 (`oh-my-telegram.json`):**
```json
{
  "telegram": { ... },
  "opencode": { ... }
}
```

**환경변수 (`.env`):**
```env
TELEGRAM_BOT_TOKEN=...
ALLOWED_USERS=...
DEFAULT_AGENT=...
WORKING_DIRECTORY=...
SESSION_PREFIX=...
OPENCODE_PATH=...
```

**우선순위:**
1. CLI 인자
2. 환경변수
3. JSON 파일
4. 기본값

### 7. CLI 인터페이스

**명령어:**
```bash
oh-my-telegram                    # 기본 설정 파일
oh-my-telegram /path/to/config    # 커스텀 설정
oh-my-telegram --config=...       # CLI 인자
```

**시작 절차:**
1. 설정 로드
2. 검증
3. Telegram 봇 생성
4. 핸들러 등록
5. 시작
6. 세션 정리 스케줄링

## 🏗️ 아키텍처 다이어그램

```
┌─────────────────────────────────────────┐
│         텔레그램 (사용자)                 │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│         Telegraf Bot                    │
│  - 메시지 수신                           │
│  - 사용자 인증                           │
│  - 명령어 파싱                          │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│      TelegramBot 클래스                  │
│  - 세션 관리                             │
│  - 에이전트 라우팅                      │
│  - 메시지 분할                           │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│     OpenCodeBridge 클래스                │
│  - child_process.spawn                  │
│  - stdout/stderr 캡처                   │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│       opencode run CLI                   │
│  - oh-my-opencode 로드                   │
│  - 에이전트 실행                         │
│  - 결과 반환                             │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   oh-my-opencode 에이전트들               │
│  - sisyphus, oracle, prometheus...      │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│         텔레그램 (사용자)                 │
└─────────────────────────────────────────┘
```

## 🔄 데이터 흐름 예시

**사용자:** `/oracle explain this code`

```
1. 텔레그램 메시지 수신
   "/oracle explain this code"

2. Telegraf 핸들러
   - 사용자 인증 (allowed_users)
   - 명령어 파싱

3. TelegramBot
   - agent = "oracle"
   - message = "explain this code"
   - session = getSession(chatId)

4. OpenCodeBridge
   spawn('opencode', [
     'run',
     'explain this code',
     '--agent', 'oracle',
     '--session', 'telegram-123456789'
   ])

5. OpenCode CLI
   - oh-my-opencode 로드
   - oracle 에이전트 실행
   - 결과 생성

6. stdout 캡처
   "This code does X by..."

7. 메시지 분할 및 전송
   - 청크 1: "This code does X..."
   - 청크 2: "...by using Y pattern..."

8. 텔레그램으로 전송
```

## 🛡️ 보안 고려사항

1. **사용자 인증**
   - 화이트리스트만 접근 허용
   - 텔레그램 User ID 검증

2. **Token 관리**
   - 환경변수 사용 권장
   - .gitignore에 추가

3. **OpenCode 권한**
   - working_directory 내에서만 실행
   - 기존 OpenCode 권한 따름

4. **세션 격리**
   - 각 채팅별 독립 세션
   - 타인의 세션 접근 불가

## 📈 성능 특성

- **동시 처리:** 텔레그램 당 하나의 활성 요청
- **세션:** 메모리 내 Map (빠른 접근)
- **메시지:** 즉시 전송 (큐 없음)
- **메모리:** 세션당 ~1KB
- **CPU:** OpenCode 실행에 의존

## 🐛 알려진 제한사항

1. **세션 지속성**
   - 재시작 시 세션 소멸
   - 디스크 저장 안 됨

2. **동시성**
   - 채팅당 직렬 처리
   - 여러 채팅은 병렬 가능

3. **긴 작업**
   - 타임아웃 없음
   - 진행 상황 없음

4. **미디어**
   - 텍스트만 지원
   - 파일 업로드 안 됨

5. **에러 복구**
   - 기본 에러 메시지만
   - 재시도 없음
