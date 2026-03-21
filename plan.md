
# مشروع مسابقة العيد — وثيقة المتطلبات v3.0

**التاريخ:** 2026-03-18
**الحالة:** جاهزة للتنفيذ

---

## الهدف

تطبيق مسابقة MCQ تفاعلية للتجمع العائلي في العيد، يعمل بالكامل عبر جوالات اللاعبين بدون شاشة مضيف، بمحتوى عربي سعودي مناسب للرجال 20-60 سنة.

---

## الجمهور المستهدف

| المعيار | الوصف |
|---|---|
| الفئة | رجال (عائلة ممتدة) |
| العمر | 20 – 60 سنة |
| الثقافة | سعودية / خليجية |
| المكان | مجلس واحد |
| اللغة | العربية |

---

## حزمة التقنيات

```
Next.js 14+ (App Router + Custom Server)
TypeScript
Tailwind CSS
Prisma ORM
PostgreSQL
Socket.io
Docker + Docker Compose
Nginx (Reverse Proxy)
```

---

## متطلبات اللعبة (صارمة)

| المتطلب | الحالة | السبب |
|---|---|---|
| MCQ فقط | ✅ إلزامي | تجنب تفاوت سرعة الطباعة |
| بدون شاشة مضيف | ✅ إلزامي | الجميع على الجوال |
| Real-time مزامنة | ✅ إلزامي | نفس السؤال للجميع بنفس الوقت |
| مؤقت يديره السيرفر | ✅ إلزامي | لا تحكم للعميل في التوقيت |
| غرف لعب بكود | ✅ مطلوب | كود 4 أرقام + QR Code |
| 20 سؤالاً لكل جلسة | ✅ محدد | ~16 دقيقة، مناسب للمجلس |

---

## المحظورات

| المحظور | السبب |
|---|---|
| إدخال نصي من اللاعبين | تفاوت سرعة الطباعة |
| شاشة مضيف منفصلة | التعقيد والحاجة لشاشة إضافية |
| Supabase | نستخدم PostgreSQL مباشر على VPS |
| APIs خارجية للأسئلة | خطر التوقف أو البطء |
| Auth معقد | وقت التطوير ضيق |
| Deploy تلقائي أثناء اللعب | يقطع الجلسة |

---

## بيئة النشر

```
IP: 158.220.112.12
OS: Linux
Database: PostgreSQL داخل Docker
Runtime: Docker + Docker Compose
Reverse Proxy: Nginx
```

```
VPS
├── Docker Compose
│   ├── Next.js App (Port 3000)  ← Custom Server (server.ts)
│   └── PostgreSQL (Port 5432)
└── Nginx (Port 80/443)
```

---

## Prisma Schema النهائي

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// بنك الأسئلة — مستقل وقابل لإعادة الاستخدام
model QuestionBank {
  id           Int               @id @default(autoincrement())
  text         String
  options      Json              // ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"]
  correctIndex Int               // 0-3
  category     String            // "تاريخ" | "إسلاميات" | "ثقافة" | "ألغاز"
  isActive     Boolean           @default(true)
  createdAt    DateTime          @default(now())

  sessionQuestions SessionQuestion[]
  answers          Answer[]
}

// جلسة اللعب
model GameSession {
  id        String   @id @default(uuid())
  code      String   @unique   // 4 أرقام عشوائية
  status    String   @default("WAITING") // WAITING | PLAYING | ENDED
  hostId    String?            // playerId للكابتن الحالي (يتغير عند وراثة الكابتن)
  createdAt DateTime @default(now())

  players   Player[]
  questions SessionQuestion[]
}

// أسئلة الجلسة (20 سؤال مسحوب من QuestionBank)
model SessionQuestion {
  id         Int          @id @default(autoincrement())
  orderIndex Int          // ترتيب السؤال في الجلسة
  sessionId  String
  questionId Int

  session  GameSession  @relation(fields: [sessionId], references: [id])
  question QuestionBank @relation(fields: [questionId], references: [id])
  answers  Answer[]
}

// اللاعب — هوية مستقلة عن Socket
model Player {
  id        String   @id @default(uuid())  // ثابت، يُحفظ في localStorage
  socketId  String?  @unique               // مؤقت، يتغير عند Reconnect
  name      String
  score     Int      @default(0)
  joinOrder Int                            // 1 = الكابتن الأصلي
  sessionId String
  createdAt DateTime @default(now())

  session GameSession @relation(fields: [sessionId], references: [id])
  answers Answer[]
}

// إجابات اللاعبين
model Answer {
  id                Int      @id @default(autoincrement())
  playerId          String
  sessionQuestionId Int
  questionId        Int
  answerIndex       Int
  isCorrect         Boolean  // يحسبها السيرفر فقط، لا العميل
  pointsEarned      Int      @default(0)
  timeTakenMs       Int      // وقت الإجابة بالمللي ثانية
  createdAt         DateTime @default(now())

  player          Player          @relation(fields: [playerId], references: [id])
  sessionQuestion SessionQuestion @relation(fields: [sessionQuestionId], references: [id])
  question        QuestionBank    @relation(fields: [questionId], references: [id])
}
```

---

## هيكل المشروع

```
quiz-app/
├── server.ts                    # Custom Server — Socket.io + Next.js
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── app/
│   ├── layout.tsx               # dir="rtl" lang="ar"
│   ├── page.tsx                 # الصفحة الرئيسية (إنشاء/انضمام)
│   ├── room/[code]/page.tsx     # صفحة الغرفة والانتظار
│   ├── play/[code]/page.tsx     # صفحة اللعب
│   └── api/
│       └── rooms/
│           ├── create/route.ts  # POST: ينشئ غرفة + يسحب 20 سؤال
│           └── [code]/route.ts  # GET: التحقق من وجود الغرفة
├── lib/
│   ├── prisma.ts
│   ├── gameEngine.ts            # منطق Socket.io كله هنا
│   └── roomCode.ts              # توليد كود 4 أرقام
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                  # 100 سؤال عربي
└── scripts/
    └── deploy.sh
```

---

## server.ts (الهيكل الأساسي)

```typescript
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import { initGameEngine } from './lib/gameEngine';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: '/api/socket',
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  initGameEngine(io);

  httpServer.listen(3000, () => {
    console.log('> Ready on http://localhost:3000');
  });
});
```

---

## gameEngine.ts — المنطق الأساسي

### مبادئ التصميم

```
1. Player.id = UUID ثابت (يُحفظ في localStorage على الجوال)
2. socket.id = مؤقت، يتغير عند Reconnect
3. sessionId = UUID من قاعدة البيانات (وليس roomCode)
4. السيرفر يحسب isCorrect، لا العميل أبداً
5. السيرفر يرسل endTime (Timestamp)، العميل يحسب المتبقي محلياً
```

### منطق الكابتن

```
- أول لاعب ينضم (joinOrder === 1) هو الكابتن
- الكابتن وحده يرى زر "ابدأ اللعبة"
- إذا انقطع اتصال الكابتن: ينتقل اللقب تلقائياً لـ joinOrder === 2
- يُرسل حدث update_host للاعب الجديد لإظهار زر البدء
```

### أحداث Socket.io

```typescript
// العميل → السيرفر
'create_room'     // { playerName } → ينشئ غرفة ويعود بـ { roomCode, playerId }
'join_room'       // { roomCode, playerName, savedPlayerId? }
'rejoin_room'     // { roomCode, playerId } ← عند Reconnect
'start_game'      // { roomCode } ← الكابتن فقط
'submit_answer'   // { roomCode, playerId, questionId, answerIndex, timeTakenMs }

// السيرفر → العميل
'room_joined'     // { playerId, isHost, players[] }
'player_joined'   // { players[] } ← للجميع عند دخول لاعب
'update_host'     // { newHostId } ← عند وراثة الكابتن
'question_start'  // { question, questionIndex, total, endTime }
'answer_result'   // { isCorrect, pointsEarned, correctIndex } ← للاعب فقط
'question_end'    // { correctIndex, scores[] } ← للجميع
'game_over'       // { finalScores[] }
```

### نظام النقاط

```typescript
// نقاط متناقصة حسب السرعة
const MAX_POINTS = 1000;
const MIN_POINTS = 200;
const QUESTION_DURATION_MS = parseInt(process.env.QUESTION_DURATION_SECONDS || '30') * 1000;

const points = isCorrect
  ? Math.max(MIN_POINTS, Math.round(MAX_POINTS - (timeTakenMs / QUESTION_DURATION_MS) * (MAX_POINTS - MIN_POINTS)))
  : 0;
```

### منطق Reconnect

```typescript
socket.on('rejoin_room', async ({ roomCode, playerId }) => {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return socket.emit('error', { message: 'لاعب غير موجود' });

  // تحديث socketId الجديد
  await prisma.player.update({
    where: { id: playerId },
    data: { socketId: socket.id },
  });

  socket.data.playerId = playerId;
  socket.join(roomCode);

  // أرسل له الحالة الحالية
  const session = await prisma.gameSession.findUnique({ where: { code: roomCode } });
  socket.emit('reconnected', {
    status: session?.status,
    isHost: session?.hostId === playerId,
    // إذا اللعبة نشطة: أرسل السؤال الحالي مع الوقت المتبقي
  });
});
```

---

## api/rooms/create/route.ts

```typescript
import { prisma } from '@/lib/prisma';
import { generateRoomCode } from '@/lib/roomCode';

export async function POST(req: Request) {
  const QUESTIONS_PER_SESSION = parseInt(process.env.QUESTIONS_PER_SESSION || '20');

  // سحب أسئلة عشوائية من البنك
  const questions = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM "QuestionBank"
    WHERE "isActive" = true
    ORDER BY RANDOM()
    LIMIT ${QUESTIONS_PER_SESSION}
  `;

  const code = generateRoomCode(); // 4 أرقام

  const session = await prisma.gameSession.create({
    data: {
      code,
      questions: {
        create: questions.map((q, i) => ({
          questionId: q.id,
          orderIndex: i,
        })),
      },
    },
  });

  return Response.json({ code, sessionId: session.id });
}
```

---

## Dockerfile

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

---

## docker-compose.yml

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: quiz_db
      POSTGRES_USER: quiz_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U quiz_user"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .
    restart: always
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    command: >
      sh -c "npx prisma migrate deploy &&
             npx prisma db seed &&
             node dist/server.js"

volumes:
  pgdata:
```

---

## nginx.conf

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;

        # ضروري للـ WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
```

---

## package.json (السكريبتات)

```json
{
  "scripts": {
    "dev": "tsx server.ts",
    "build": "next build && tsc server.ts --outDir dist --esModuleInterop --skipLibCheck",
    "start": "node dist/server.js",
    "db:seed": "ts-node prisma/seed.ts"
  }
}
```

> **ملاحظة:** نستخدم `tsx` بدل `ts-node` في وضع التطوير لأنه أسرع وأكثر توافقاً مع ESM.

---

## .env.example

```env
DATABASE_URL=postgresql://quiz_user:yourpassword@db:5432/quiz_db
NEXT_PUBLIC_APP_URL=http://your-domain.com
DB_PASSWORD=yourpassword
QUESTIONS_PER_SESSION=20
QUESTION_DURATION_SECONDS=30
NODE_ENV=production
```

---

## الواجهة — متطلبات UX

```
✅ RTL كامل (dir="rtl" على <html>)
✅ خط Cairo أو Tajawal (Google Fonts)
✅ ألوان عيد: أخضر سعودي + ذهبي + رمل
✅ Responsive للجوالات فقط (max-w-md)
✅ QR Code على شاشة الانتظار لسهولة الانضمام
✅ كود الغرفة: 4 أرقام كبيرة وواضحة
✅ زر نسخ الرابط
✅ اهتزاز (Vibration API) عند الإجابة الصحيحة/الخاطئة
✅ لون الخيار يتغير فور الضغط (رمادي = في الانتظار)
✅ بعد انتهاء الوقت: أخضر للصحيح، أحمر للخاطئ
```

**ألوان Tailwind:**
```js
'eid-green':     '#1B5E3F',
'eid-gold':      '#D4AF37',
'eid-sand':      '#F5E6D3',
'eid-brown':     '#8B5A2B',
```

---

## مصادر الأسئلة

**الطريقة المعتمدة:** توليد بالذكاء الاصطناعي ← أسرع وأكثر تحكماً

```
التوزيع (100 سؤال):
├── 25 تاريخ السعودية والخليج
├── 25 إسلاميات (قرآن، حديث، فقه مبسط)
├── 25 ثقافة عامة خليجية
├── 15 ألغاز ذكاء
└── 10 شخصيات عربية وإسلامية

الصيغة المطلوبة (JSON جاهز لـ seed.ts):
{
  "text": "...",
  "options": ["أ", "ب", "ج", "د"],
  "correctIndex": 0,
  "category": "تاريخ"
}
```

---

## خطة التنفيذ (3 أيام)

### اليوم الأول — الأساس (8 ساعات)
```
1. إعداد المشروع من الصفر (Next.js + TypeScript + Tailwind)
2. كتابة server.ts + التحقق من تشغيله
3. Prisma Schema + migrate
4. api/rooms/create + api/rooms/[code]
5. توليد 100 سؤال بالذكاء الاصطناعي + seed.ts
```

### اليوم الثاني — المنطق والواجهة (8 ساعات)
```
1. gameEngine.ts كامل (join, start, question, answer, end)
2. منطق الكابتن + وراثة عند الانقطاع
3. منطق Reconnect + localStorage
4. صفحة الرئيسية + الانتظار + اللعب + النتائج
5. RTL + ألوان العيد + QR Code
6. اختبار محلي بـ 3 نوافذ متصفح
```

### اليوم الثالث — النشر والاختبار (4 ساعات)
```
1. Dockerfile + docker-compose.yml
2. nginx.conf + SSL (Certbot)
3. رفع على VPS + تشغيل deploy.sh
4. اختبار من جوالات حقيقية
```

**الإجمالي: 20 ساعة** (مع 4 ساعات buffer)

---

## قائمة التحقق قبل يوم العيد

```
- [ ] QR Code يعمل ويفتح الرابط الصحيح
- [ ] كود الغرفة: 4 أرقام واضحة
- [ ] Reconnect يعيد اللاعب لنفس جلسته
- [ ] وراثة الكابتن تعمل عند انقطاع الاتصال
- [ ] النقاط تُحسب بالسيرفر (لا العميل)
- [ ] RTL يعمل بشكل صحيح
- [ ] الأسئلة العربية تظهر صحيحة
- [ ] المؤقت متزامن بين الجوالات
- [ ] Docker Compose يقوم بدون تدخل
- [ ] اختبار بـ 5 جوالات حقيقية قبل العيد بيوم
```

---

## ملاحظات للوكيل المنفذ

```
1. الأولوية: الاستقرار أولاً، الجماليات ثانياً
2. Player.id يُنشأ بـ UUID ويُحفظ في localStorage — لا تتجاوز هذا
3. sessionId في كل استعلام Prisma = session.id (UUID) وليس roomCode
4. isCorrect يُحسب في السيرفر فقط — لا تقبله من العميل
5. عند Reconnect: حدّث socketId فقط، لا تنشئ لاعباً جديداً
6. الكابتن = hostId في GameSession، يتحدث عند انقطاع الاتصال
7. لا Deploy تلقائي أثناء وقت اللعب
8. اختبر محلياً بـ 3 نوافذ قبل الرفع على VPS
```

