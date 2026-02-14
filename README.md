# oh-my-telegram

> Telegram interface for OpenCode agents - Chat with Sisyphus, Oracle, and other AI agents via Telegram

## 🎯 Purpose

**oh-my-telegram** bridges Telegram and OpenCode, enabling:

- 💬 Chat with AI agents (Sisyphus, Oracle, Prometheus, etc.) via Telegram
- 🚀 Execute coding tasks remotely from your phone
- 📊 Monitor bot status and session information
- 🔄 Manage multiple sessions
- 🌐 View conversations in opencode web UI
- 🤖 Hold meetings with AI agents on-the-go

## 📦 Installation

```bash
# Clone repository
git clone https://github.com/your-org/oh-my-telegram.git
cd oh-my-telegram

# Install dependencies
npm install

# Build
npm run build
```

## ⚙️ Configuration

### 1. Create `.env` file

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_USER_ID=your_telegram_user_id

# Opencode Configuration (optional, has defaults)
OPENCODE_SERVER_URL=http://localhost:4096
OPENCODE_DEFAULT_AGENT=sisyphus

# OpenCode Web UI URL shown in Telegram (optional)
# Default: http://127.0.0.1:4096
OPENCODE_WEB_URL=http://127.0.0.1:4096
```

**Note:** Only `TELEGRAM_BOT_TOKEN` and `TELEGRAM_USER_ID` are required.

### 2. Start Opencode Server

```bash
# Start opencode server (required)
opencode serve --port 4096 > /tmp/opencode-server.log 2>&1 &

# Start opencode web (optional, for viewing conversations)
opencode web

# Verify servers are running
ps aux | grep "opencode" | grep -v grep
```

### 3. Setup Telegram Bot

1. **Create bot via [@BotFather](https://t.me/botfather):**
   ```
   /newbot
   ```

2. **Get your bot token** from BotFather

3. **Get your Telegram User ID** via [@userinfobot](https://t.me/userinfobot)

4. **Configure `.env`** with your token and user ID

### 3. Setup Telegram Bot

1. **Create bot via [@BotFather](https://t.me/botfather):**
   ```
   /newbot
   ```

2. **Get your bot token** from BotFather

3. **Get your Telegram User ID** via [@userinfobot](https://t.me/userinfobot)

4. **Configure `.env`** with your token and user ID

## 🚀 Usage

```bash
# Build
npm run build

# Run (foreground)
node dist/cli.js

# Run (background)
nohup node dist/cli.js > /tmp/oh-my-telegram/bot.log 2>&1 &

# Check logs
tail -f /tmp/oh-my-telegram/bot.log

# Check if running
ps aux | grep "node.*cli.js" | grep -v grep
```

## 💬 Commands

### Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start bot and show main menu |
| `/status` | Show bot status, session info, uptime |
| `/new` | Create new session |
| `/list` | List all sessions with numbers |
| `/switch <number>` | Switch to session by number (1, 2, 3...) |
| `/reset` | Clear conversation history |
| `/agent <name>` | Switch AI agent (sisyphus, oracle, etc.) |
| `/help` | Show help message |

### Menu Buttons

- 🤖 **Agents**: Choose AI agent (Sisyphus, Oracle, Prometheus, etc.)
- 🆕 **New**: Create new session
- 📋 **List**: View all sessions
- 📊 **Status**: Show current bot status
- 🔄 **Reset**: Clear conversation
- ℹ️ **Help**: Show help

### Usage Example

```
You: /start
Bot: [Shows menu]

You: /new
Bot: ✅ New session created
     Session ID: ses_xyz789...
     View in opencode web: http://127.0.0.1:55986/session/ses_xyz789...

You: /list
Bot: 📋 Sessions (3 total)

     1. ✅ Current ses_xyz789...
        Refactoring telegram bot
        Updated: 2:30 PM

     2. ses_abc123...
        Session confirmation greeting
        Updated: 11:16 PM

     3. ses_def456...
        Architecture discussion
        Updated: Yesterday

You: /switch 2
Bot: ✅ Switched to session
     Number: 2
     Title: Session confirmation greeting
     Session ID: ses_abc123...

You: /agent oracle
Bot: Switched to oracle agent

You: Explain this architecture
Bot: [Oracle provides detailed analysis]
```

## 🏗️ Architecture

### Current Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Telegram Bot   │─────▶│  Opencode       │─────▶│  AI Agents      │
│                 │      │  Gateway        │      │  (Sisyphus etc) │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                 │
                                 ↓
                         ┌─────────────────┐
                         │  Session Store  │
                         │  ~/.claude/     │
                         └─────────────────┘
                                 │
                                 ↓
                         ┌─────────────────┐
                         │  Opencode Web   │
                         │  Port 55986     │
                         └─────────────────┘
```

### How It Works

1. **Telegram Bot** receives messages and sends to opencode gateway
2. **Opencode Gateway** (SDK) communicates with opencode serve
3. **Sessions** are stored in `~/.claude/transcripts/`
4. **Opencode Web** displays conversations in browser UI

## 📋 Session Persistence

### Session Storage

**Session files are stored in:**
```
~/.claude/transcripts/
├── ses_3f0cd3312ffey9NFpb1PcrGGYF.jsonl  # Session 1
├── ses_abc123def456.jsonl                # Session 2
└── ...
```

**Session Lifecycle:**
- ✅ Bot restart → Sessions preserved
- ✅ Computer reboot → Sessions preserved (on disk)
- ✅ Server restart → Sessions preserved
- `/new` → Creates new session
- `/reset` → Deletes current session, creates new one
- `/switch <id>` → Switch to existing session

**Current Limitation:**
- All Telegram users share **one active session**
- Switching sessions affects **all users**
- No per-user isolation (yet)

### Session Commands

```bash
# Create new session
/new

# List all sessions (with numbers)
/list

# Switch to session by number
/switch 2

# Clear conversation and start fresh
/reset

# View current session info
/status
```

## 🌐 Opencode Web UI

### Viewing Conversations in Browser

**Start opencode web:**
```bash
opencode web
```

**Access in browser:**
- URL: `http://127.0.0.1:55986/`
- Or: `http://localhost:55986/`

**Features:**
- 📊 View all sessions
- 💬 Read full conversation history
- 🔄 Switch between sessions
- 📤 Export conversations
- 🎨 Better UI for long conversations

**Direct session links:**
```
http://127.0.0.1:55986/session/ses_abc123def456
```

### Starting Services

```bash
# Terminal 1: Opencode server (required)
opencode serve --port 4096

# Terminal 2: Opencode web (optional)
opencode web

# Terminal 3: Telegram bot
npm start
```

## 🔒 Security

- **User whitelist**: Only `TELEGRAM_USER_ID` can use the bot
- **Single user mode**: Currently supports one Telegram user ID
- **Get your ID**: Via [@userinfobot](https://t.me/userinfobot)

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Dev mode (watch)
npm run dev

# Run directly
ts-node src/cli.ts

# Run tests
npm test
```

## 📁 Project Structure

```
oh-my-telegram/
├── src/
│   ├── cli.ts               # CLI entry point
│   ├── telegram-bot.ts      # Main bot logic
│   └── opencode-gateway.ts  # Opencode gateway handler
├── dist/                    # Compiled JavaScript
├── package.json
├── tsconfig.json
├── .env                     # Configuration (create this)
└── README.md
```

## 🔧 Troubleshooting

### Bot not responding

```bash
# Check bot process
ps aux | grep "node.*cli.js" | grep -v grep

# Check logs
tail -f /tmp/oh-my-telegram/bot.log

# Restart bot
pkill -f "node.*cli.js"
nohup node dist/cli.js > /tmp/oh-my-telegram/bot.log 2>&1 &
```

### Opencode server issues

```bash
# Check server process
ps aux | grep "opencode serve" | grep -v grep

# Check server logs
tail -f /tmp/opencode-server.log

# Restart server
pkill -f "opencode serve"
opencode serve --port 4096 > /tmp/opencode-server.log 2>&1 &
```

### Can't see conversations in opencode web

1. Make sure opencode web is running:
   ```bash
   opencode web
   ```

2. Check if web is accessible:
   ```bash
   curl http://127.0.0.1:55986/
   ```

3. Use session ID from `/list` command to view specific session

### Session not switching

1. Verify session ID exists:
   ```bash
   /list
   ```

2. Use exact session ID:
   ```bash
   /switch ses_abc123def456
   ```

3. Check opencode server is running

## 📝 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | - | Bot token from @BotFather |
| `TELEGRAM_USER_ID` | ✅ | - | Allowed Telegram user ID |
| `OPENCODE_SERVER_URL` | ❌ | `http://localhost:4096` | Opencode server URL |
| `OPENCODE_DEFAULT_AGENT` | ❌ | `sisyphus` | Default AI agent |

## 🎯 Architecture Decisions

### 1. Single Shared Session

**Decision:** All users share one opencode session.

**Why:**
- Simpler implementation
- Faster development
- Good for single-user or small team use

**Trade-off:**
- All users see same conversation history
- `/reset` affects everyone

**Future:** Per-user session isolation

### 2. Gateway-Only Reset

**Decision:** `/reset` only works in gateway mode.

**Why:**
- CLI mode has no persistent session
- Clear separation of concerns

### 3. Synchronous API

**Decision:** Use `client.session.prompt()` instead of async streaming.

**Why:**
- Simpler, more reliable
- SSE events had issues in testing

## 📝 License

MIT

## 👤 Author

Eunoo Lee

## 🙏 Acknowledgments

- Built on [Telegraf](https://telegraf.js.org/)
- Uses [OpenCode](https://github.com/oh-my-opencode/opencode) framework
- Inspired by [clawdbot](https://github.com/clawdbot/clawdbot)
