# oh-my-telegram

> Telegram interface for oh-my-opencode - Enables sisyphus to chat via Telegram

## 🎯 Purpose

**oh-my-telegram** bridges Telegram and OpenCode, allowing you to:

- Chat with sisyphus/oracle/prometheus agents via Telegram
- Execute coding tasks remotely
- Hold meetings with AI agents
- Monitor long-running tasks from your phone

## 📦 Installation

```bash
# Install globally
npm install -g oh-my-telegram

# Or use with npx
npx oh-my-telegram
```

## ⚙️ Configuration

Create `oh-my-telegram.json`:

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

Or use `.env` file:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_USERS=123456789,987654321
DEFAULT_AGENT=sisyphus
WORKING_DIRECTORY=/Users/eunoo/projects/daemons
SESSION_PREFIX=telegram
OPENCODE_PATH=opencode
```

## 🤖 Telegram Bot Setup

1. Create bot via [@BotFather](https://t.me/botfather):
   ```
   /newbot
   ```

2. Get your bot token

3. Get your Telegram User ID via [@userinfobot](https://t.me/userinfobot)

4. Configure oh-my-telegram

## 🚀 Usage

```bash
# Start bot
oh-my-telegram

# Or with custom config
oh-my-telegram /path/to/config.json

# Or with npx
npx oh-my-telegram
```

## 💬 Commands

### Agent Commands

```
/sisyphus refactor this function
/oracle explain this code
/prometheus plan a new feature
/librarian find React docs
/metis analyze requirements
```

### General Commands

- `/start` - Start the bot
- `/help` - Show help

### Default Behavior

Just send a message without command to use the default agent:

```
refactor this function
```

## 🏗️ Architecture

```
Telegram (User)
    ↓
oh-my-telegram (Telegram Bot)
    ↓ opencode run
OpenCode CLI
    ↓
oh-my-opencode Agents (sisyphus, oracle, ...)
    ↓ result
oh-my-telegram
    ↓
Telegram (User)
```

## 📋 Session Management

- Each Telegram chat gets its own OpenCode session
- Session format: `telegram-{chatId}`
- Sessions persist during bot runtime
- Inactive sessions (>1 hour) are automatically cleared

## 🔒 Security

- **User whitelist**: Only allowed users can use the bot
- **Configure via**: `allowedUsers` in config or `ALLOWED_USERS` env var
- **Get your ID**: Via [@userinfobot](https://t.me/userinfobot)

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Dev mode (watch)
npm run dev

# Start
npm start
```

## 📁 Project Structure

```
oh-my-telegram/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── telegram-bot.ts     # Telegram bot logic
│   ├── opencode-bridge.ts  # OpenCode CLI bridge
│   └── index.ts            # Exports
├── package.json
├── tsconfig.json
├── oh-my-telegram.json     # Example config
└── README.md
```

## 🤝 Integration with clawdbot

If you're using clawdbot (now moltbot) for Telegram, oh-my-telegram complements it by:

- clawdbot: General AI assistant with Telegram interface
- oh-my-telegram: Specialized OpenCode agent interface

You can run both simultaneously on different bots!

## 📝 License

MIT

## 🙏 Acknowledgments

- Built on [Telegraf](https://telegraf.js.org/)
- Integrates with [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)
- Inspired by [clawdbot](https://github.com/clawdbot/clawdbot) Telegram extension
