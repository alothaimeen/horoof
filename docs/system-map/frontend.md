# الواجهة الأمامية (Frontend)

## الحالة
- ✅ يعمل
- نمط: Client Components فقط (Socket.io يتطلب `'use client'`)
- RTL كامل + Cairo font + ألوان العيد

---

## الملفات

| الملف | الوظيفة |
|:---|:---|
| `app/layout.tsx` | Root layout: `dir="rtl"`, Cairo, metadata |
| `app/globals.css` | Design system: ألوان، أزرار، animations |
| `app/page.tsx` | الرئيسية: إنشاء/انضمام لغرفة |
| `app/room/[code]/page.tsx` | غرفة الانتظار: QR، قائمة اللاعبين، بدء اللعبة |
| `app/play/[code]/page.tsx` | اللعب: تايمر، خيارات، نتائج، لوحة قيادة |
| `lib/socket.ts` | Client singleton — استخدم `getSocket()` فقط |

---

## الصفحات

### `/` (الرئيسية)
- مدخل اسم اللاعب
- **إذا كان URL يحتوي `?join=CODE`** → يعرض نموذج الانضمام فوراً بدون خيار إنشاء غرفة
- زر إنشاء غرفة → POST `/api/rooms/create` → توجيه لـ `/room/[code]`
- زر انضم بكود → مدخل 4 أرقام → GET `/api/rooms/[code]` → توجيه لـ `/room/[code]`
- يحفظ `playerName` ويمحو `playerId` (لدورة جديدة) من `localStorage`
- **لفتك:** يستخدم `useSearchParams` ويحتاج `<Suspense>` wrapper

### `/room/[code]` (غرفة الانتظار)
- يُرسل `join_room` socket event عند التحميل
- `joinUrl` يُحسب في `useEffect` (عميل فقط) لتجنب hydration mismatch
- يعرض QR Code (`<QRCodeSVG>`) مع placeholder رمادي أثناء التحميل
- الكابتن: يرى أسماء اللاعبين + زر "ابدأ اللعبة" (يُفعّل عند ≥ 2 لاعبين)
- غير الكابتن: "في انتظار الكابتن..."
- التحويل لـ `/play/[code]` يحدث عند استقبال `question_start`
- **لفتك:** لا `joined.current` — الفيكت يسجّل listeners أولاً ثم يُرسل emit

### `/play/[code]` (اللعب)
**4 حالات (phase):**
1. `loading` — جاري التحميل
2. `question` — السؤال + 4 خيارات + شريط التايمر
3. `result` — بعد السؤال: هل أجبت صح/غلط + النقاط + الترتيب الحالي
4. `gameover` — الترتيب النهائي + "العب مرة أخرى" (للكابتن فقط)

---

## نظام الألوان (Tailwind)

```js
'eid-green':       '#1B5E3F'  // خلفية داكنة
'eid-green-light': '#2E8B57'
'eid-gold':        '#D4AF37'  // الأرقام، الكودات، العناوين
'eid-gold-light':  '#F0D060'
'eid-sand':        '#F5E6D3'  // النصوص الأساسية
'eid-brown':       '#8B5A2B'
'eid-dark':        '#0D2E1C'  // خلفية أعمق
```

---

## CSS Classes المخصصة

| الكلاس | الاستخدام |
|:---|:---|
| `.card` | بطاقة زجاجية glassmorphism |
| `.btn-primary` | زر ذهبي رئيسي |
| `.option-btn` | زر خيار MCQ |
| `.option-btn.selected` | الخيار المحدد |
| `.option-btn.correct` | الإجابة الصحيحة (أخضر) |
| `.option-btn.wrong` | الإجابة الخاطئة (أحمر) |

---

## القواعد

### ✅ مسموح
- استخدم `getSocket()` من `lib/socket.ts` (singleton)
- استخدم `localStorage` لـ `playerId` و `playerName`
- استخدم Vibration API: `navigator.vibrate([50,30,50])` للصح، `[200]` للخطأ

### ❌ ممنوع
- **لا Server Components** في صفحات اللعب — Socket.io يتطلب Client
- **لا تنشئ socket instance جديد** — استخدم `getSocket()` دائماً
- **لا تحسب `isCorrect` في العميل** — انتظر `answer_result`

---

## القرارات المهمة

| التاريخ | القرار | السبب |
|:---|:---|:---|
| مارس 2026 | `qrcode.react` → مكوّن `<QRCodeSVG>` | أخف من الـ canvas version |
| مارس 2026 | `joinUrl` في `useState`+`useEffect` (عميل فقط) | تجنب hydration mismatch بسبب `window.location.origin` |
| مارس 2026 | Timer بـ `setInterval(100ms)` يحسب من `endTime` | تجنب desync بين الأجهزة |
| مارس 2026 | 4 states في play page (loading/question/result/gameover) | تبسيط منطق الانتقال |
| مارس 2026 | الرابط المنسوخ: `?join=CODE` يفتح واجهة انضمام مباشرة | سهولة الانضمام من QR Code |
| مارس 2026 | Listeners دائماً قبل emit | تجنب race condition حيث يصل `room_joined` قبل تسجيل listener |

---

## الحالة الراهنة
- [x] الرئيسية (إنشاء + انضمام)
- [x] غرفة الانتظار (QR + قائمة لحظية + كابتن)
- [x] اللعب (تايمر + 4 خيارات + feedback)
- [x] النتائج المؤقتة بين الأسئلة
- [x] النتائج النهائية + العب مرة أخرى
- [x] Vibration API
- [x] RTL + Cairo + ألوان العيد
