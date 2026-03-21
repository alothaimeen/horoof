# قاعدة البيانات

## الحالة
- ✅ يعمل (محلي: PostgreSQL 18 على localhost:5432/eid_quiz)
- VPS: PostgreSQL 16 داخل Docker

---

## الملفات

| الملف | الوظيفة |
|:---|:---|
| `prisma/schema.prisma` | Schema كامل — 5 نماذج |
| `prisma/seed.ts` | 100 سؤال عربي، idempotent |
| `lib/prisma.ts` | Prisma singleton — لا تعدّله |

---

## النماذج (Models)

### QuestionBank
```
id, text, options (Json), correctIndex (0-3), category, isActive, createdAt
```
- `options` مخزّن كـ JSON array: `["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"]`
- التصفية بـ `isActive=true` — يمكن تعطيل أسئلة بدون حذفها

### GameSession
```
id (UUID), code (4 أرقام فريد), status (WAITING|PLAYING|ENDED), hostId, createdAt
```
- `hostId` = `Player.id` للكابتن — يتغير عند وراثة الكابتن

### SessionQuestion
```
id, orderIndex, sessionId, questionId
```
- 20 سؤال مسحوب عشوائياً من `QuestionBank` عند إنشاء الغرفة
- `@@index([sessionId])` للأداء

### Player
```
id (UUID, ثابت), socketId (مؤقت, غير فريد), name, score, joinOrder, isConnected, sessionId, createdAt
```
- `Player.id` يُحفظ في `localStorage` على الجوال
- `socketId` يتغير عند كل Reconnect (تم إزالة `@unique` لتفادي race condition)
- `@@index([sessionId])` للأداء

### Answer
```
id, playerId, sessionQuestionId, questionId, answerIndex, isCorrect, pointsEarned, timeTakenMs, createdAt
```
- `isCorrect` يُحسب في السيرفر فقط
- `@@unique([playerId, sessionQuestionId])` — لاعب لا يجيب مرتين على نفس السؤال
- `@@index([sessionQuestionId])` للأداء

---

## توزيع الأسئلة (100 سؤال)

| الفئة | العدد |
|:---|:---|
| تاريخ السعودية والخليج | 25 |
| إسلاميات | 25 |
| ثقافة عامة خليجية | 25 |
| ألغاز ذكاء | 15 |
| شخصيات عربية وإسلامية | 10 |

---

## القواعد

### ✅ مسموح
- `prisma.questionBank.count()` للتحقق قبل إنشاء جلسة
- `prisma.$queryRaw` لـ `ORDER BY RANDOM()` لسحب أسئلة عشوائية
- `prisma.$transaction([...])` لعمليات متعددة atomic

### ❌ ممنوع
- **لا تحذف أسئلة** — استخدم `isActive = false`
- **لا تعدّل `lib/prisma.ts`** — الـ singleton حساس لـ hot reload
- **لا تستخدم `prisma.player.create` عند Reconnect** — فقط `update { socketId }`

---

## الأوامر المهمة

```bash
npm run db:push      # مزامنة schema (آمن، لا migrations)
npm run db:seed      # زرع أسئلة (idempotent — آمن للتكرار)
npm run db:migrate   # إنشاء migration رسمي (للـ VPS)
npm run db:reset     # ⚠️ حذف كامل (محلي فقط)
```

---

## القرارات المهمة

| التاريخ | القرار | السبب |
|:---|:---|:---|
| مارس 2026 | إزالة `@unique` من `socketId` | حل مشكلة race condition مع React Strict Mode |
| مارس 2026 | `@@unique([playerId, sessionQuestionId])` | منع الإجابة المزدوجة |
| مارس 2026 | `onDelete: Cascade` على كل العلاقات | تنظيف تلقائي عند حذف Session |
| مارس 2026 | `isActive` بدل الحذف للأسئلة | الحفاظ على سلامة FK |
| مارس 2026 | أسئلة الجلسة تُسحب عند إنشاء الغرفة (لا عند البدء) | تأكيد وجود الأسئلة قبل انضمام اللاعبين |

---

## الحالة الراهنة
- [x] Schema كامل (5 نماذج)
- [x] 100 سؤال عربي
- [x] قاعدة بيانات محلية جاهزة (eid_quiz)
- [x] Migrations جاهزة للـ VPS
