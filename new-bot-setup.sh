#!/bin/bash

echo "========================================="
echo "  🤖 새 텔레그램 봇 생성 가이드"
echo "========================================="
echo ""

echo "📱 Telegram 단계:"
echo "-----------------------------------"
echo "1. @BotFather 봇을 엽니다"
echo "2. /newbot을 보냅니다"
echo "3. 봇 이름을 입력합니다 (예: SisyphusBot)"
echo "4. 사용자 이름을 입력합니다 (예: my_sisyphus_bot)"
echo "5. 봇 토큰을 받습니다 (예: 123456789:ABC...)"
echo ""

read -p "🔑 새 봇 토큰을 입력하세요: " BOT_TOKEN

if [ -z "$BOT_TOKEN" ]; then
  echo "❌ 봇 토큰이 입력되지 않았습니다."
  exit 1
fi

echo ""
echo "📝 .env 파일 업데이트..."
sed -i.bak "s/TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=$BOT_TOKEN/" .env

echo ""
echo "✅ 설정 완료!"
echo ""
echo "-----------------------------------"
echo "업데이트된 .env:"
grep "TELEGRAM_BOT_TOKEN" .env
echo "-----------------------------------"
echo ""

echo "🚀 봇 재시작..."
pkill -f "node dist/cli.js"
sleep 2
node dist/cli.js &
BG_PID=$!
echo "봇 PID: $BG_PID"
echo ""

echo "💬 텔레그램에서 테스트:"
echo "1. 새 봇을 검색해서 /start를 보내세요"
echo "2. /sisyphus 안녕!"
echo "3. /oracle 설명해줘"
echo ""
