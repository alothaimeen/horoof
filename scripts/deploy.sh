#!/bin/bash
# Deploy script for VPS
set -e

echo "🚀 بدء النشر..."

git pull origin main

echo "🔨 البناء..."
docker compose build --no-cache

echo "▶️ التشغيل..."
docker compose up -d

echo "⏳ انتظار جاهزية قاعدة البيانات..."
sleep 10

echo "🌱 زرع الأسئلة (مرة واحدة فقط)..."
docker compose exec app npx prisma db seed || echo "تم الزرع مسبقاً، تخطي..."

echo "✅ اكتمل النشر!"
