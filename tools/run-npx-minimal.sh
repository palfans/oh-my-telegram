#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="$PROJECT_ROOT/oh-my-telegram.json"
OPENCODE_LOG="${OPENCODE_LOG:-$PROJECT_ROOT/opencode-server.log}"
BOT_LOG="${BOT_LOG:-$PROJECT_ROOT/bot.log}"
WATCHDOG_LOG="${WATCHDOG_LOG:-$PROJECT_ROOT/watchdog.log}"
OPENCODE_PORT="${OPENCODE_PORT:-4096}"
WORKING_DIRECTORY="${WORKING_DIRECTORY:-$PROJECT_ROOT}"

MODE="tmux"
if [[ "${1:-}" == "--foreground" ]]; then
  MODE="foreground"
  shift
fi

TMUX_SESSION_NAME="${TMUX_SESSION_NAME:-omo-telegram}"
VERIFY_TIMEOUT_SECONDS="${VERIFY_TIMEOUT_SECONDS:-20}"

is_json_like() {
  local s="$1"
  s="${s//$'\n'/}"
  [[ -z "$s" ]] && return 1
  [[ "$s" == \{* || "$s" == \[* ]]
}

opencode_healthcheck() {
  local base="http://127.0.0.1:$OPENCODE_PORT"

  local health_resp
  health_resp="$(curl -fsS -m 2 "$base/global/health" 2>/dev/null || true)"
  if ! is_json_like "$health_resp"; then
    return 1
  fi
  if [[ "$health_resp" != *'\"healthy\"'* ]]; then
    return 1
  fi
  if [[ "$health_resp" != *'\"version\"'* ]]; then
    return 1
  fi

  local path_resp
  path_resp="$(curl -fsS -m 2 "$base/path" 2>/dev/null || true)"
  if ! is_json_like "$path_resp"; then
    return 1
  fi
  if [[ "$path_resp" != *'\"directory\"'* ]]; then
    return 1
  fi
  if [[ "${STRICT_OPENCODE_DIRECTORY:-}" == "1" ]]; then
    if [[ "$path_resp" != *"\\\"directory\\\":\\\"$PROJECT_ROOT\\\""* && "$path_resp" != *"\\\"directory\\\": \\\"$PROJECT_ROOT\\\""* ]]; then
      return 1
    fi
  fi

  local agent_resp
  agent_resp="$(curl -fsS -m 2 "$base/agent" 2>/dev/null || true)"
  if ! is_json_like "$agent_resp"; then
    return 1
  fi
  if [[ "$agent_resp" != *'\"name\"'* ]]; then
    return 1
  fi

  return 0
}

wait_for_opencode_ready() {
  local max_seconds="$1"
  local start_ts
  start_ts="$(date +%s)"

  while true; do
    if opencode_healthcheck; then
      return 0
    fi

    if [[ -n "${OPENCODE_PID:-}" ]]; then
      if ! kill -0 "$OPENCODE_PID" 2>/dev/null; then
        echo "Error: opencode serve exited unexpectedly (PID: $OPENCODE_PID)." >&2
        echo "---- $OPENCODE_LOG (last 80 lines) ----" >&2
        tail -n 80 "$OPENCODE_LOG" >&2 || true
        return 1
      fi
    fi

    local now_ts
    now_ts="$(date +%s)"
    if (( now_ts - start_ts >= max_seconds )); then
      echo "Error: opencode serve not ready within ${max_seconds}s." >&2
      echo "---- $OPENCODE_LOG (last 80 lines) ----" >&2
      tail -n 80 "$OPENCODE_LOG" >&2 || true
      return 1
    fi

    sleep 1
  done
}

if ! command -v opencode >/dev/null 2>&1; then
  echo "Error: opencode is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx is not available. Please install Node.js/npm." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not available. Please install Node.js/npm." >&2
  exit 1
fi

run_foreground() {
  local BOT_TOKEN=""
  local USER_ID=""

  if [[ -f "$CONFIG_PATH" ]]; then
    echo "Using existing config: $CONFIG_PATH"
    BOT_TOKEN=$(grep -oP '"botToken":\s*"\K[^"]+' "$CONFIG_PATH" 2>/dev/null || echo "")
    USER_ID=$(grep -oP '"allowedUsers":\s*\["\K[^"]+' "$CONFIG_PATH" 2>/dev/null || echo "")
  else
    BOT_TOKEN="${BOT_TOKEN:-}"
    USER_ID="${USER_ID:-}"
  fi

  if [[ -z "$BOT_TOKEN" ]]; then
    if [[ "${OC_NO_PROMPT:-}" == "1" ]]; then
      echo "Error: Telegram bot token missing (no prompt mode)." >&2
      exit 1
    fi
    read -r -p "Telegram bot token: " BOT_TOKEN
  fi

  if [[ -z "$USER_ID" ]]; then
    if [[ "${OC_NO_PROMPT:-}" == "1" ]]; then
      echo "Error: Telegram user id missing (no prompt mode)." >&2
      exit 1
    fi
    read -r -p "Telegram user id: " USER_ID
  fi

  if [[ ! -f "$CONFIG_PATH" || -n "${FORCE_CONFIG:-}" ]]; then
    cat > "$CONFIG_PATH" << EOF
{
  "telegram": {
    "botToken": "$BOT_TOKEN",
    "allowedUsers": ["$USER_ID"],
    "polling": true
  },
  "opencode": {
    "defaultAgent": "sisyphus",
    "workingDirectory": "$WORKING_DIRECTORY",
    "sessionPrefix": "telegram",
    "opencodePath": "opencode"
  }
}
EOF
    echo "Config written to: $CONFIG_PATH"
  fi

  echo "Starting opencode serve on port $OPENCODE_PORT..."
  mkdir -p "$(dirname "$OPENCODE_LOG")"
  touch "$OPENCODE_LOG"
  echo "[run_foreground] starting opencode serve (port=$OPENCODE_PORT pid=?)" >> "$OPENCODE_LOG"
  if opencode serve --port "$OPENCODE_PORT" >> "$OPENCODE_LOG" 2>&1 & then
    OPENCODE_PID=$!
    echo "opencode serve PID: $OPENCODE_PID"
    echo "[run_foreground] opencode serve PID=$OPENCODE_PID" >> "$OPENCODE_LOG"
  else
    echo "Failed to start opencode serve. See log: $OPENCODE_LOG" >&2
    exit 1
  fi

  echo "Waiting for opencode serve to be ready..."
  if ! wait_for_opencode_ready 30; then
    kill "$OPENCODE_PID" 2>/dev/null || true
    exit 1
  fi
  echo "opencode serve is ready!"

  cleanup() {
    if [[ -n "${OPENCODE_PID:-}" ]]; then
      echo "Stopping opencode serve (PID: $OPENCODE_PID)..."
      kill "$OPENCODE_PID" 2>/dev/null || true
    fi
  }

  trap cleanup EXIT

  if [[ -n "${HTTP_PROXY:-}" || -n "${HTTPS_PROXY:-}" || -n "${http_proxy:-}" || -n "${https_proxy:-}" ]]; then
    echo "Proxy configuration detected:"
    [[ -n "${HTTP_PROXY:-}" ]] && echo "  HTTP_PROXY=$HTTP_PROXY"
    [[ -n "${HTTPS_PROXY:-}" ]] && echo "  HTTPS_PROXY=$HTTPS_PROXY"
    [[ -n "${http_proxy:-}" ]] && echo "  http_proxy=$http_proxy"
    [[ -n "${https_proxy:-}" ]] && echo "  https_proxy=$https_proxy"
  else
    echo "Warning: No proxy configuration found. If you need proxy to access Telegram API,"
    echo "         please set HTTP_PROXY and HTTPS_PROXY environment variables."
  fi

  echo "Starting oh-my-telegram from local build..."
  cd "$PROJECT_ROOT"

  export HTTP_PROXY="${HTTP_PROXY:-${http_proxy:-}}"
  export HTTPS_PROXY="${HTTPS_PROXY:-${https_proxy:-}}"
  export NO_PROXY="${NO_PROXY:-${no_proxy:-localhost,127.0.0.1}}"

  mkdir -p "$(dirname "$BOT_LOG")"
  touch "$BOT_LOG"
  node "$PROJECT_ROOT/src-repo/dist/cli.js" "$CONFIG_PATH" 2>&1 | tee -a "$BOT_LOG"
}

run_tmux() {
  if ! command -v tmux >/dev/null 2>&1; then
    echo "Error: 未找到 tmux。要前台运行请使用：./run-npx-minimal.sh --foreground" >&2
    exit 1
  fi

  echo "[1/3] build (tsc)..."
  (cd "$PROJECT_ROOT/src-repo" && npm run build)

  echo "[2/3] restart tmux session: $TMUX_SESSION_NAME"
  if tmux has-session -t "$TMUX_SESSION_NAME" 2>/dev/null; then
    tmux kill-session -t "$TMUX_SESSION_NAME"
  fi

  mkdir -p "$(dirname "$WATCHDOG_LOG")" "$(dirname "$BOT_LOG")" "$(dirname "$OPENCODE_LOG")"
  touch "$WATCHDOG_LOG" "$BOT_LOG" "$OPENCODE_LOG"

  PORT_WAIT_START="$(date +%s)"
  PORT_WAIT_SECONDS="${PORT_WAIT_SECONDS:-5}"
  while ss -ltn 2>/dev/null | grep -q ":$OPENCODE_PORT"; do
    NOW_TS="$(date +%s)"
    if (( NOW_TS - PORT_WAIT_START >= PORT_WAIT_SECONDS )); then
      echo "Error: 端口 $OPENCODE_PORT 已被占用，无法启动新的 opencode serve。" >&2
      ss -ltnp 2>/dev/null | grep ":$OPENCODE_PORT" >&2 || true
      exit 1
    fi
    sleep 1
  done

  OC_NO_PROMPT=1 tmux new-session -d -s "$TMUX_SESSION_NAME" -c "$PROJECT_ROOT" \
    "bash" "-lc" \
    "set -euo pipefail; \
     while true; do \
       echo '[watchdog] starting opencode serve' | tee -a '$WATCHDOG_LOG' >> '$OPENCODE_LOG'; \
       opencode serve --port '$OPENCODE_PORT' >> '$OPENCODE_LOG' 2>&1; \
       rc=\$?; \
       echo '[watchdog] opencode serve exited with code' \$rc | tee -a '$WATCHDOG_LOG' >> '$OPENCODE_LOG'; \
       sleep 1; \
     done"

  tmux split-window -t "$TMUX_SESSION_NAME":0 -v -c "$PROJECT_ROOT" \
    "bash" "-lc" \
    "set -euo pipefail; \
     export HTTP_PROXY='${HTTP_PROXY:-${http_proxy:-}}'; \
     export HTTPS_PROXY='${HTTPS_PROXY:-${https_proxy:-}}'; \
     export NO_PROXY='${NO_PROXY:-${no_proxy:-localhost,127.0.0.1}}'; \
     while true; do \
       if [[ ! -f '$CONFIG_PATH' ]]; then \
         echo '[watchdog] missing config, cannot start bot:' '$CONFIG_PATH' | tee -a '$WATCHDOG_LOG' >> '$BOT_LOG'; \
         sleep 2; \
         continue; \
       fi; \
        until curl -fsS -m 2 \"http://127.0.0.1:$OPENCODE_PORT/path\" >/dev/null 2>&1 && curl -fsS -m 2 \"http://127.0.0.1:$OPENCODE_PORT/agent\" >/dev/null 2>&1; do \
          echo '[watchdog] waiting for opencode on port $OPENCODE_PORT' | tee -a '$WATCHDOG_LOG' >> '$BOT_LOG'; \
          sleep 1; \
        done; \
       echo '[watchdog] starting bot' | tee -a '$WATCHDOG_LOG' >> '$BOT_LOG'; \
       node '$PROJECT_ROOT/src-repo/dist/cli.js' '$CONFIG_PATH' 2>&1 | tee -a '$BOT_LOG'; \
       rc=\${PIPESTATUS[0]}; \
       echo '[watchdog] bot exited with code' \$rc | tee -a '$WATCHDOG_LOG' >> '$BOT_LOG'; \
       sleep 1; \
     done"

  echo "[3/3] verify bot started..."
  START_TS="$(date +%s)"
  while true; do
    NOW_TS="$(date +%s)"
    ELAPSED="$((NOW_TS - START_TS))"

    if (( ELAPSED > VERIFY_TIMEOUT_SECONDS )); then
      echo "Error: 超时（${VERIFY_TIMEOUT_SECONDS}s）仍未检测到 bot 正常运行。" >&2
      echo "---- tmux capture pane 0 (last 200 lines) ----" >&2
      tmux capture-pane -pt "$TMUX_SESSION_NAME":0.0 -S -200 >&2 || true
      echo "---- tmux capture pane 1 (last 200 lines) ----" >&2
      tmux capture-pane -pt "$TMUX_SESSION_NAME":0.1 -S -200 >&2 || true
      echo "---- $WATCHDOG_LOG (last 120 lines) ----" >&2
      tail -n 120 "$WATCHDOG_LOG" >&2 || true
      echo "---- $OPENCODE_LOG (last 120 lines) ----" >&2
      tail -n 120 "$OPENCODE_LOG" >&2 || true
      echo "---- $BOT_LOG (last 120 lines) ----" >&2
      tail -n 120 "$BOT_LOG" >&2 || true
      exit 1
    fi

    if ! tmux has-session -t "$TMUX_SESSION_NAME" 2>/dev/null; then
      echo "Error: tmux session 不存在（可能进程已退出）：$TMUX_SESSION_NAME" >&2
      exit 1
    fi

    if tmux list-panes -t "$TMUX_SESSION_NAME" -F '#{pane_dead}' | grep -q '^1$'; then
      echo "Error: tmux pane 已退出（bot 未能启动）。" >&2
      echo "---- tmux capture (last 200 lines) ----" >&2
      tmux capture-pane -pt "$TMUX_SESSION_NAME":0.0 -S -200 >&2 || true
      exit 1
    fi

    if opencode_healthcheck && pgrep -af "node .*src-repo/dist/cli\\.js" >/dev/null 2>&1; then
      echo "OK: bot 已重启成功（检测到 node dist/cli.js 进程）。"
      echo "tmux:  tmux attach -t $TMUX_SESSION_NAME"
      echo "logs:  $BOT_LOG"
      echo "       $OPENCODE_LOG"
      echo "       $WATCHDOG_LOG"
      exit 0
    fi

    sleep 1
  done
}

if [[ "$MODE" == "foreground" ]]; then
  run_foreground
else
  run_tmux
fi
