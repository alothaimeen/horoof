# النشر والبيئات (Deployment)

## الحالة
- ✅ محلي: جاهز (PostgreSQL 18، npm run dev)
- ✅ VPS: منشور ويعمل — http://158.220.112.12
- ✅ التطوير المحلي على Windows صار يفضّل IP شبكة WiFi الحقيقي في روابط الانضمام، و`npm run dev` يستخدم Webpack افتراضياً لتفادي `ChunkLoadError` مع `custom server + basePath`

---

## البيئتان

### المحلي (Fallback — عند ضعف الإنترنت)

| العنصر | القيمة |
|:---|:---|
| OS | Windows 11 |
| قاعدة البيانات | PostgreSQL 18 — `localhost:5432/eid_quiz` |
| المستخدم | `postgres` كلمة السر: `eid2026` |
| التشغيل | `npm run dev` |
| الوصول محلياً | `http://localhost:3000` |
| الوصول للشبكة | `http://[LOCAL_IP]:3000` (يظهر في terminal) |
| اللاعبون | أجهزة على نفس WiFi |

### VPS (الإنتاج)

| العنصر | القيمة |
|:---|:---|
| IP | `158.220.112.12` |
| OS | Ubuntu 20.04 LTS |
| قاعدة البيانات | PostgreSQL 16 داخل Docker |
| التشغيل | Docker Compose (v2.35) |
| الـ Proxy | Nginx 1.18 على الـ host (خارج Docker) |
| الوصول | `http://158.220.112.12` (port 80) |
| مسار المشروع | `/root/eid-qwiz/` |

---

## الملفات

| الملف | الوظيفة |
|:---|:---|
| `server.ts` | Custom server محلي/إنتاج + اختيار IP الشبكة المحلية الحقيقي + تفعيل Turbopack اختيارياً عبر `USE_TURBOPACK=1` |
| `Dockerfile` | Multi-stage build: base → builder → runner |
| `docker-compose.yml` | خدمتان: `db` (postgres) + `app` |
| `nginx.conf` | Nginx على host: proxy لـ localhost:3000 + WebSocket |
| `scripts/deploy.sh` | سكريبت النشر على VPS |
| `app/api/local-ip/route.ts` | يعيد IP الشبكة الحقيقي (محلي) أو NEXT_PUBLIC_APP_URL (إنتاج) |
| `.env` | **لا ترفعه لـ Git** — contains DB password |
| `.env.example` | Template بدون قيم حقيقية |

---

## إعدادات `.env`

### محلي
```env
DATABASE_URL="postgresql://postgres:eid2026@localhost:5432/eid_quiz"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
QUESTIONS_PER_SESSION=20
QUESTION_DURATION_SECONDS=30
NODE_ENV=development
```

### VPS (داخل Docker Compose — يُعيَّن في `environment:`)
```env
DATABASE_URL="postgresql://quiz_user:YOUR_SECURE_PASSWORD@db:5432/quiz_db"
DB_PASSWORD="YOUR_SECURE_PASSWORD"
NEXT_PUBLIC_APP_URL="http://158.220.112.12"
QUESTIONS_PER_SESSION=20
QUESTION_DURATION_SECONDS=30
NODE_ENV=production
```

> ⚠️ الـ `DATABASE_URL` في VPS يستخدم `db` (اسم service في Docker Compose) وليس `localhost`.

---

## أوامر النشر على VPS

### عبر Git (الطريقة الحالية)

```bash
# 1. على الجهاز المحلي (حفظ الكود)
git add .
git commit -m "تحديث"
git push origin main

# 2. على السيرفر (يُنفذ من جهازك)
ssh root@158.220.112.12 "cd /root/horoof && git pull origin main && docker compose build && docker compose down && docker compose up -d"
```

---

## هيكل Docker

```
VPS Host
├── Nginx (port 80/443) — يوجه لـ localhost:3000
└── Docker Compose
    ├── app (port 3000) — Next.js + Socket.io
    └── db  (port 5432) — PostgreSQL 16
```

---

## nginx.conf — نقاط حرجة

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 3600;
proxy_send_timeout 3600;
```
هذه الـ headers **ضرورية** لعمل Socket.io. لا تحذفها.

---

## القواعد

### ✅ مسموح
- تحديث كود بدون Docker (git pull + build محلياً)
- تغيير `QUESTION_DURATION_SECONDS` في `.env` بدون إعادة build

## قرارات مهمة

- في بيئة Windows المحلية مع `custom server` و`basePath: '/horoof'`، المسار الافتراضي للتطوير هو `npm run dev` باستخدام Webpack لأنه أكثر ثباتاً من Turbopack حالياً. إذا لزم الاختبار فقط، استخدم `npm run dev:turbo` بشكل تجريبي.

### ❌ ممنوع
- **لا Deploy أثناء جلسة نشطة** — يفقد `activeGames` من الذاكرة
- **لا ترفع `.env` لـ Git** — فيه كلمة سر PostgreSQL
- **لا تغير `proxy_pass` لـ `app:3000`** — Nginx خارج Docker لا يعرف اسم الـ service

---

## القرارات المهمة

| التاريخ | القرار | السبب |
|:---|:---|:---|
| مارس 2026 | Nginx على host (خارج Docker) | مثبّت مسبقاً على VPS، تجنب تعقيد إضافي |
| مارس 2026 | Seed منفصل عن startup الـ app | منع تكرار الزرع عند كل restart |
| مارس 2026 | `0.0.0.0` bind في server.ts | للسماح بالوصول من شبكة WiFi محلياً |
| مارس 2026 | عرض LOCAL_IP في terminal | سهولة مشاركة الرابط مع اللاعبين |
| ماي 2026 | `/api/local-ip` endpoint | تفادي استخدام `localhost` في URL المشاركة — يعيد IP حقيقي محلياً أو NEXT_PUBLIC_APP_URL إنتاجياً |
| ماي 2026 | Clipboard fallback بـ execCommand | Clipboard API تتطلب HTTPS — HTTP fallback لـ VPS |
| مارس 2026 | تضمين `next.config.js` في حاوية Docker | لتفادي مشكلة 404 ولضمان عمل `basePath` بالشكل الصحيح في الإنتاج |
---

## الحالة الراهنة
- [x] PostgreSQL محلي جاهز (eid_quiz)
- [x] Dockerfile
- [x] docker-compose.yml
- [x] nginx.conf
- [x] scripts/deploy.sh
- [x] نشر على VPS (158.220.112.12) — يعمل HTTP 200
- [x] Docker Engine v28 + Docker Compose v2.35
- [x] Nginx 1.18 منصّب ومضبوط
- [x] 100 سؤال عربي (seeded)
- [ ] SSL (Certbot)
