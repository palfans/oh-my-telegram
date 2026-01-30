#!/bin/bash

echo "========================================="
echo "  oh-my-telegram 시스템 서비스 설치"
echo "========================================="
echo ""

PLIST_FILE="$HOME/Library/LaunchAgents/com.oh-my-telegram.bot.plist"
SERVICE_NAME="com.oh-my-telegram.bot"
PROJECT_DIR="/Users/eunoo/projects/oh-my-telegram"

echo "📋 설치 정보:"
echo "  plist 파일: $PLIST_FILE"
echo "  서비스 이름: $SERVICE_NAME"
echo "  프로젝트 경로: $PROJECT_DIR"
echo ""

echo "📝 1단계: plist 파일 설치..."
cp "$PROJECT_DIR/com.oh-my-telegram.bot.plist" "$PLIST_FILE"

if [ $? -ne 0 ]; then
  echo "❌ plist 파일 복사 실패"
  exit 1
fi

echo "✅ plist 파일 설치됨: $PLIST_FILE"
echo ""

echo "📝 2단계: launchd 서비스 등록..."
launchctl unload "$PLIST_FILE" 2>/dev/null
launchctl load "$PLIST_FILE"

if [ $? -ne 0 ]; then
  echo "❌ 서비스 등록 실패"
  exit 1
fi

echo "✅ 서비스 등록 성공"
echo ""

echo "🚀 3단계: 서비스 시작..."
launchctl start "$SERVICE_NAME"

sleep 2

echo ""
echo "📊 4단계: 서비스 상태 확인..."
if launchctl list | grep -q "$SERVICE_NAME"; then
  echo "✅ 서비스가 실행 중입니다"
  echo ""
  echo "로그 확인:"
  echo "  tail -f $PROJECT_DIR/bot.log"
  echo ""
  echo "서비스 관리:"
  echo "  시작: launchctl start $SERVICE_NAME"
  echo "  중지: launchctl stop $SERVICE_NAME"
  echo "  재시작: launchctl kickstart -k $SERVICE_NAME"
  echo "  제거: launchctl unload $PLIST_FILE && rm $PLIST_FILE"
else
  echo "❌ 서비스 시작 실패"
  echo ""
  echo "로그 확인:"
  echo "  cat $PROJECT_DIR/bot-error.log"
  exit 1
fi

echo ""
echo "========================================="
echo "  ✅ 설치 완료!"
echo "========================================="
echo ""
echo "텔레그램에서 @oh_my_sisyphus_bot에게 메시지를 보내보세요:"
echo "  /start"
echo "  /sisyphus 안녕!"
echo ""
