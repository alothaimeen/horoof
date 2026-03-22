# محرك اللعبة (Game Engine)

## الحالة
- ✅ يعمل (مستقر)
- النظام: Real-time، server-authoritative

---

## الملفات

| الملف | الوظيفة |
|:---|:---|
| `server.ts` | Custom HTTP server — يدمج Next.js + Socket.io، يعرض الـ IP المحلي |
| `lib/gameEngine.ts` | **كل منطق اللعبة** — Socket events, in-memory state, timer, captain |
| `lib/socket.ts` | Client-side Socket.io singleton مع auto-reconnect |
| `lib/roomCode.ts` | توليد كود 4 أرقام مع فحص التكرار |

---

## الـ In-Memory State

```typescript
// Map<roomCode, GameState> — في ذاكرة Node.js
Map<string, {
  sessionId: string           // UUID من قاعدة البيانات
  currentQuestionIndex: number
  questionTimer: Timeout | null
  questionStartTime: number   // Date.now() عند بدء السؤال
  answeredPlayers: Set<string>  // playerIds اللي أجابوا
  questions: Question[]       // محمّلة مسبقاً من DB عند بدء اللعبة
  players: Map<playerId, PlayerState>
  hostPlayerId: string        // ID الكابتن (مدير المسابقة — لا يلعب)
  waitingForHost: boolean     // true بعد question_end — لا يتقدم حتى يضغط الكابتن
}>
  players: Map<playerId, PlayerState>
}>
```

> ⚠️ **حرج:** `activeGames` تُفقد عند إعادة تشغيل السيرفر. الجلسات النشطة تنتهي. لا تعتمد على القيم المحفوظة في الـ Map بعد restart.

---

## Socket Events

### العميل → السيرفر

| الحدث | البيانات | الوظيفة |
|:---|:---|:---|
| `join_room` | `{ roomCode, playerName, savedPlayerId? }` | انضمام أو Reconnect |
| `start_game` | `{ roomCode }` | بدء اللعبة (الكابتن فقط) |
| `submit_answer` | `{ roomCode, questionId, sessionQuestionId, answerIndex, timeTakenMs }` | إرسال إجابة (اللاعبون فقط — الكابتن محجوب) |
| `next_question` | `{ roomCode }` | الكابتن: الانتقال للسؤال التالي |
| `skip_question` | `{ roomCode }` | الكابتن: تخطي السؤال الحالي أثناء التايمر |
| `end_game_early` | `{ roomCode }` | الكابتن: إنهاء اللعبة فوراً بالنتائج الحالية |
| `play_again` | `{ roomCode }` | إعادة اللعب (الكابتن) |

### السيرفر → العميل

| الحدث | البيانات | المستقبل |
|:---|:---|:---|
| `room_joined` | `{ playerId, isHost, players[], gameStatus }` | اللاعب فقط |
| `player_update` | `{ players[] }` | الغرفة كلها |
| `update_host` | `{ newHostId }` | الكابتن الجديد فقط |
| `question_start` | `{ sessionQuestionId, questionId, text, options[], questionIndex, total, endTime }` | الغرفة كلها |
| `answer_result` | `{ isCorrect, pointsEarned, correctIndex }` | اللاعب المجيب فقط |
| `question_end` | `{ correctIndex, scores[] }` | الغرفة كلها |
| `game_over` | `{ finalScores[] }` | الغرفة كلها |
| `game_reset` | `{ message }` | الغرفة كلها (عند play_again) |
| `error` | `{ message }` | اللاعب فقط |

---

## القواعد

### ✅ مسموح
- `isCorrect` يُحسب في `gameEngine.ts` من `currentQ.correctIndex` فقط
- `Player.id` يُرسل من العميل كـ `savedPlayerId` للـ Reconnect
- التايمر يعمل بـ `setTimeout` من السيرفر، العميل يستخدم `endTime` للعرض فقط

### ❌ ممنوع
- **لا تقبل `isCorrect` من العميل أبداً**
- **لا تستخدم `socket.id` كمعرف دائم للاعب** — يتغير عند Reconnect
- **لا تُعدّل `activeGames` خارج `gameEngine.ts`**

---

## منطق حرج

### حساب النقاط
```typescript
const MAX_POINTS = 1000;
const MIN_POINTS = 200;
const points = isCorrect
  ? Math.max(MIN_POINTS, Math.round(MAX_POINTS - (timeTakenMs / QUESTION_DURATION_MS) * (MAX_POINTS - MIN_POINTS)))
  : 0;
```

### وراثة الكابتن (عند disconnect)
```
إذا انقطع الكابتن:
  → استعلم Players WHERE isConnected=true ORDER BY joinOrder
  → أول لاعب = الكابتن الجديد
  → emit 'update_host' للكابتن الجديد فقط
  → emit 'player_update' للغرفة كلها
```

### Reconnect
```
join_room + savedPlayerId → Player موجود في session؟
  نعم → update socketId + isConnected=true
        + أرسل الحالة الحالية (question_start مع endTime المتبقي)
  لا  → لاعب جديد (لو WAITING فقط)
```

### انتهاء السؤال (التلقائي أو بأمر الكابتن)
```
setTimeout(QUESTION_DURATION_MS) → advanceQuestion()
  أو
كل اللاعبين المتصلين (غير الكابتن) أجابوا → setTimeout(800ms) → advanceQuestion()
  أو
skip_question من الكابتن → advanceQuestion() فوراً

لاحظة:
advanceQuestion() توقف عند question_end + waitingForHost = true
لا تتقدم تلقائياً. يجب أن يضغط الكابتن next_question للانتقال.
```

---



## القرارات المهمة

| التاريخ | القرار | السبب |
|:---|:---|:---|
| مارس 2026 | In-memory state بدل DB queries أثناء اللعب | السرعة والاستجابة الفورية |
| مارس 2026 | `create_room` كـ HTTP API فقط (لا Socket) | فصل المسؤوليات — Socket للعبة فقط |
| مارس 2026 | عند إجابة الجميع: تأخير 800ms قبل انتهاء السؤال | منح وقت لاستقبال آخر إجابة قبل `question_end` |
| مارس 2026 | إزالة `@unique` من `socketId` وإضافة قفل الذاكرة `joinLocks` | حل مشكلة Race Condition مع React Strict Mode |
| ماي 2026 | الكابتن مدير مسابقة لا لاعب | طلب المستخدم — الكابتن يتحكم بالتوقيت ولا يؤثر على النقاط |
| ماي 2026 | إلغاء التقدم التلقائي بين الأسئلة | الكابتن يتحكم بالخطى — `BETWEEN_QUESTIONS_MS` لم يعد مستخدماً |
| مارس 2026 | منع نقل المقدم أثناء PLAYING + 3 طبقات حماية | نقل المقدم لفريق يُخرجه من اللعب ويُظهر شاشة المقدم على جواله |

---

## الحالة الراهنة
- [x] join_room (جديد + Reconnect)
- [x] start_game (الكابتن فقط، ≤ 1 لاعب غير الكابتن)
- [x] submit_answer (server-side scoring — الكابتن محجوب)
- [x] next_question (الكابتن يتحكم بالخطى)
- [x] skip_question (تخطي السؤال الحالي)
- [x] end_game_early (إنهاء فوري)
- [x] Timer تلقائي + انتهاء مبكر
- [x] وراثة الكابتن عند disconnect
- [x] play_again (تصفير نقاط + أسئلة جديدة)
- [x] question_end → waitingForHost → next_question → سؤال جديد
- [x] getLeaderboard() يستثني الكابتن
- [x] game_over → نتائج نهائية
