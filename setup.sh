#!/bin/bash

echo "========================================="
echo "  🤖 oh-my-telegram 봇 설정 도우미"
echo "========================================="
echo ""
echo "📱 1단계: Telegram에서 새 봇 생성"
echo ""
echo "   1. Telegram에서 @BotFather 검색"
echo "   2. /newbot 보내기"
echo "   3. 봇 이름: OhMySisyphus (또는 원하는 이름)"
echo "   4. 사용자명: oh_my_sisyphus_bot"
echo "      (영문+숫자+_만 사용, 고유해야 함)"
echo "   5. 봇 토큰 받기"
echo ""
echo "⏸️  봇 토큰을 받으면 여기로 돌아오세요..."
echo ""
read -p "Press Enter to continue..."
echo ""

echo "💻 2단계: 봇 토큰 입력"
echo "-----------------------------------"
read -p "🔑 봇 토큰을 붙여넣으세요 (예: 123456789:ABCdefGHI): " BOT_TOKEN

if [ -z "$BOT_TOKEN" ]; then
  echo "❌ 봇 토큰이 입력되지 않았습니다."
  exit 1
fi

if [[ ! $BOT_TOKEN =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
  echo "❌ 봇 토큰 형식이 올바르지 않습니다."
  echo "   형식: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
  exit 1
fi

echo ""
echo "📝 .env 파일 업데이트..."
sed -i.bak "s|TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$BOT_TOKEN|" .env

echo ""
echo "✅ 설정 완료!"
echo ""
echo "-----------------------------------"
echo "현재 .env 설정:"
cat .env | grep -v "^#" | grep -E "TELEGRAM_BOT_TOKEN|ALLOWED_USERS|DEFAULT_AGENT"
echo "-----------------------------------"
echo ""

echo "🚀 3단계: 봇 시작"
echo "-----------------------------------"
echo "봇을 시작하겠습니다..."
echo ""

pkill -f "node dist/cli.js" 2>/dev/null
sleep 1

nohup node dist/cli.js > bot.log 2>&1 &
NEW_PID=$!

echo "✅ 봇이 시작되었습니다! (PID: $NEW_PID)"
echo ""
echo "📝 로그 보기:"
echo "   tail -f bot.log"
echo ""
echo "🛑 중지方法:"
echo "   kill $NEW_PID"
echo "   또는 Ctrl+C (포그라운드)"
echo ""

echo "💬 4단계: 텔레그램에서 테스트"
echo "-----------------------------------"
echo "1. 텔레그램에서 새로 만든 봇을 검색하세요"
echo "2. /start 를 보내세요"
echo "3. /sisyphus 안녕! 이라고 보내보세요"
echo "4. /oracle 너는 뭐야? 라고 보내보세요"
echo ""

sleep 2
echo "📊 현재 봇 상태:"
ps -p $NEW_PID 2>/dev/null && echo "   ✅ 봇이 실행 중입니다" || echo "   ❌ 봇이 실행되지 않았습니다"
echo ""

echo "🎉 완료! 텔레그램에서 봇과 대화해보세요!"
echo "========================================="
