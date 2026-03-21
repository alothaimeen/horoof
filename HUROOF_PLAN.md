# خطة تحويل المشروع إلى لعبة حروف
**تاريخ الكتابة:** 19 مارس 2026  
**المطلوب من القارئ (نموذج لغوي):** قراءة هذا الملف كاملاً ثم الإجابة بآرائك ومقترحاتك

---

## 1. السياق — ما يوجد الآن

### المشروع الحالي
تطبيق ويب لمسابقات MCQ (اختيار من متعدد) للتجمع العائلي.  
**Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS + Prisma (PostgreSQL) + Socket.io + Docker + Nginx

**يعمل على:** VPS — http://158.220.112.12  
**Local dev:** `npm run dev` (tsx server.ts)

### هيكل الملفات الكامل
```
horoof/
├── server.ts                     # Custom HTTP Server — Next.js + Socket.io
├── lib/
│   ├── gameEngine.ts             # ⚡ كل منطق اللعبة + Socket events (500 سطر)
│   ├── prisma.ts                 # Prisma singleton
│   ├── roomCode.ts               # توليد كود 4 أرقام
│   └── socket.ts                 # Client-side Socket.io singleton
├── app/
│   ├── layout.tsx                # dir="rtl" lang="ar" + Cairo font
│   ├── globals.css               # Design system (ألوان + CSS classes)
│   ├── page.tsx                  # الصفحة الرئيسية (إنشاء/انضمام)
│   ├── room/[code]/page.tsx      # غرفة الانتظار + QR Code
│   ├── play/[code]/page.tsx      # صفحة اللعب الكاملة (600+ سطر)
│   └── api/
│       ├── rooms/create/route.ts  # POST: إنشاء غرفة
│       ├── rooms/[code]/route.ts  # GET: التحقق من الغرفة
│       └── local-ip/route.ts      # GET: IP الشبكة المحلية
├── prisma/
│   ├── schema.prisma             # الـ Schema
│   └── seed.ts                   # 100 سؤال عربي موجود حالياً
├── مسابقة الحروف.txt             # ← ملف الأسئلة الجديد (480 سؤال)
├── Dockerfile
├── docker-compose.yml
└── nginx.conf
```

### Schema قاعدة البيانات الحالي (Prisma)
```prisma
model QuestionBank {
  id           Int      @id @default(autoincrement())
  text         String
  options      Json     // ["خيار أ", "خيار ب", "خيار ج", "خيار د"]
  correctIndex Int      // 0-3
  category     String
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())

  sessionQuestions SessionQuestion[]
  answers          Answer[]
}

model GameSession {
  id        String   @id @default(uuid())
  code      String   @unique
  status    String   @default("WAITING") // WAITING | PLAYING | ENDED
  hostId    String?
  createdAt DateTime @default(now())

  players   Player[]
  questions SessionQuestion[]
}

model SessionQuestion {
  id         Int    @id @default(autoincrement())
  orderIndex Int
  sessionId  String
  questionId Int

  session  GameSession  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  question QuestionBank @relation(fields: [questionId], references: [id])
  answers  Answer[]
}

model Player {
  id          String   @id @default(uuid())  // ثابت في localStorage
  socketId    String?
  name        String
  score       Int      @default(0)
  joinOrder   Int
  sessionId   String
  isConnected Boolean  @default(true)
  createdAt   DateTime @default(now())

  session GameSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  answers Answer[]
}

model Answer {
  id                Int      @id @default(autoincrement())
  playerId          String
  sessionQuestionId Int
  questionId        Int
  answerIndex       Int
  isCorrect         Boolean  // يحسبها السيرفر فقط
  pointsEarned      Int      @default(0)
  timeTakenMs       Int
  createdAt         DateTime @default(now())

  player          Player          @relation(fields: [playerId], references: [id])
  sessionQuestion SessionQuestion @relation(fields: [sessionQuestionId], references: [id])
  question        QuestionBank    @relation(fields: [questionId], references: [id])
}
```

### آلية اللعبة الحالية (MCQ)
1. الكابتن ينشئ غرفة → يحصل على كود 4 أرقام
2. اللاعبون ينضمون عبر الكود أو QR
3. الكابتن يبدأ → 20 سؤال MCQ متسلسل للجميع
4. كل لاعب يجيب بنفسه، النقاط تُحسب بالسرعة (1000-200 نقطة)
5. الكابتن يتحكم بالانتقال بين الأسئلة (لا يلعب هو)
6. في النهاية: ترتيب النقاط

### قواعد حرجة في الكود الحالي
- `isCorrect` يُحسب في السيرفر فقط — لا يُقبل من العميل أبداً
- `Player.id` = UUID ثابت محفوظ في localStorage (يُستخدم للـ Reconnect)
- `activeGames` = Map في ذاكرة Node.js — **تُفقد عند إعادة تشغيل السيرفر**
- Timer يعمل بـ setTimeout من السيرفر؛ العميل يستخدم `endTime` للعرض فقط
- `getSocket()` singleton — لا تنشئ instance جديد في العميل
- الكابتن (hostId) لا يُجيب على الأسئلة ولا تُحتسب له نقاط

### نظام الألوان (Tailwind)
```js
'eid-green':       '#1B5E3F'
'eid-green-light': '#2E8B57'
'eid-gold':        '#D4AF37'
'eid-gold-light':  '#F0D060'
'eid-sand':        '#F5E6D3'
'eid-brown':       '#8B5A2B'
'eid-dark':        '#0D2E1C'
```

### CSS Classes الجاهزة
- `.card` — بطاقة glassmorphism
- `.btn-primary` — زر ذهبي رئيسي
- `.option-btn` — زر خيار MCQ
- `.option-btn.correct` — الإجابة الصحيحة (أخضر)
- `.option-btn.wrong` — الإجابة الخاطئة (أحمر)

---

## 2. الهدف — لعبة حروف

### ما هي لعبة حروف؟
برنامج مسابقات سعودي شهير على القناة السعودية الأولى (بدأ 1989م). جوهره:
- **لوحة سداسية (Honeycomb)** مقسمة إلى خلايا، كل خلية تحمل **حرفاً** يمثل سؤالاً
- **فريقان** يتنافسان: الأحمر والأخضر
- الفريق الأحمر يسعى لتوصيل خط من **اليمين إلى اليسار**
- الفريق الأخضر يسعى لتوصيل خط من **الأعلى إلى الأسفل**
- الفريق الذي يُكمل المسار المتصل يفوز بالجولة
- الفائز بـ **3 جولات من 5** يفوز باللعبة
- الفائز يدخل **"دائرة الضوء"** (60 ثانية من الأسئلة السريعة)

### الخاصية الرياضية المهمة
هذه اللعبة مشتقة من لعبة **Hex** الرياضية. **مستحيل حدوث تعادل** — بسبب خصائصها الرياضية الصارمة، لا بد أن يفوز أحد الفريقين.

---

## 3. بيانات الأسئلة الجديدة

### الملف: `مسابقة الحروف.txt`
- **480 سؤال** مقسمة على **28+ حرف عربي** (أ، ب، ت، ث، ج، ح، خ، د، ذ، ر، ز، س، ش، ص، ض، ف، ق، ك، ل، م، ن، هـ، و، ي...)
- كل سؤال جاهز بصيغة **MCQ**: 4 خيارات، واحد منها الصحيح
- محتوى ديني وثقافي وتاريخي مناسب للعائلة السعودية

### صيغة الأسئلة في الملف (Markdown)
```markdown
## مسابقة حرف ( أ )

**س1: سورة في القرآن الكريم يطلق عليها أخت الطويلتين ؟**
* الأنعام
* الأعراف (الإجابة الصحيحة)
* الأنفال
* الأحزاب

**س2: غزوة جرح فيها رسول الله...**
* الأحزاب
* أحد (الإجابة الصحيحة)
* أوطاس
* أجنادين
```

### قراءة البيانات برمجياً
```typescript
// قراءة الملف وتحليله إلى هذا الهيكل:
interface HuroofQuestion {
  letter: string;      // "أ"
  text: string;        // نص السؤال
  options: string[];   // 4 خيارات (بدون علامة الإجابة)
  correctIndex: number; // 0-3
}
```

**خوارزمية التحليل (Parsing):**
```
للملف سطراً بسطر:
  - سطر "## مسابقة حرف ( X )" → currentLetter = X
  - سطر "**س\d+: ..."  → currentQuestion = { letter, text, options: [], correctIndex: -1 }
  - سطر "* نص (الإجابة الصحيحة)" → options.push(clean(text)), correctIndex = options.length - 1
  - سطر "* نص"  → options.push(text)
  - بعد 4 خيارات → أضف السؤال للقائمة النهائية
```

### الربط مع آلية اللعبة
في لعبة حروف الأصلية، كل خلية تحمل **حرفاً** والسؤال عنه يبدأ بذلك الحرف. في تطبيقنا سنُعيّن لكل خلية سداسية حرفاً من حروف الشبكة، وعند اختيار الخلية يُسحب سؤال **عشوائي من أسئلة ذلك الحرف**.

---

## 4. اللعبة المطلوبة — التصميم التفصيلي

### 4.1 اللوحة السداسية

**الحجم:** 11 × 11 = 121 خلية سداسية (كما في البرنامج الأصلي)

**الإحداثيات:** نظام Offset (col, row) حيث col من 0 إلى 10، row من 0 إلى 10

**توزيع الحروف على اللوحة:**
- 121 خلية، لكن لدينا ~28 حرفاً → كل حرف يُعيَّن لعدة خلايا
- التوزيع يكون عشوائياً (shuffle) عند بدء كل جولة جديدة
- الخلية تعرض الحرف (أ، ب، ت...) لا رقماً

**الجيران الستة لكل خلية (Offset Coordinates):**
```typescript
// للأعمدة الزوجية (col % 2 === 0):
const EVEN_DIRS = [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]];

// للأعمدة الفردية (col % 2 === 1):
const ODD_DIRS  = [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]];
```

### 4.2 الفريقان وقواعد الفوز

| الفريق | اللون | هدف الفوز بالجولة |
|:---|:---|:---|
| أحمر | #dc2626 | خط متصل من **col=0** (يمين) إلى **col=10** (يسار) |
| أخضر | #16a34a | خط متصل من **row=0** (أعلى) إلى **row=10** (أسفل) |

**ملاحظة:** الـ RTL في عرض البرنامج الأصلي يجعل الأحمر من يمين إلى يسار.

### 4.3 آلية الدور (Turn)

```
دور الفريق:
  1. أي لاعب من الفريق الحالي يختار خلية محايدة على اللوحة
  2. يُسحب سؤال عشوائي من أسئلة حرف تلك الخلية
  3. يظهر السؤال لجميع الحاضرين
  4. لاعبو الفريق الحالي يجيبون (MCQ) — الجميع يرى الأزرار
  5. أول إجابة صحيحة تصل للسيرفر تقفل السؤال فوراً:
     → answerLocked = true (اللاعبون الآخرون يُتجاهلون)
     → الخلية تُلوّن بلون الفريق
     → emit 'answer_locked' للغرفة (تُعطَّل أزرار الجميع)
     → يُتحقق من checkWin() — هل اكتمل المسار؟
       - اكتمل → round_over
       - لم يكتمل → الدور ينتقل للفريق الآخر
  6. إذا أجاب الجميع خطأ أو انتهى الوقت:
     → الخلية تبقى محايدة
     → الدور ينتقل للفريق الآخر
```

> **لماذا "أسرع إجابة صحيحة"؟** يُبقي الجميع متفاعلين ولا أحد ينتظر، ويضيف توتراً داخلياً إيجابياً ("من سيضغط أولاً؟"). النظام الحالي في gameEngine يدعم هذا بشكل طبيعي.

### 4.4 هيكل الجولات

```
اللعبة = 5 جولات
كل جولة = لوحة 11×11 تبدأ فارغة
الفائز بالجولة = من يُكمل المسار المتصل
الفائز باللعبة = من يفوز بـ 3 جولات أولاً (best of 5)
```

### 4.5 دائرة الضوء (مرحلة نهائية اختيارية)

```
بعد تحديد الفريق الفائز باللعبة:
  - الكابتن يضغط "ابدأ دائرة الضوء"
  - يظهر مؤقت عكسي من 60 ثانية
  - الكابتن يقرأ أسئلة متتالية بصوت عالٍ
  - الكابتن يضغط ✅ أو ❌ لكل إجابة
  - في النهاية: النتيجة (عدد الإجابات الصحيحة)
```

---

## 5. التغييرات المطلوبة في الكود

### 5.1 ما يبقى بلا تغيير
- `server.ts` — كاملاً
- `lib/prisma.ts` — كاملاً
- `lib/roomCode.ts` — كاملاً
- `lib/socket.ts` — كاملاً
- `app/layout.tsx` — كاملاً
- `app/api/` — كل الملفات
- `docker-compose.yml`, `nginx.conf`, `Dockerfile`
- `tailwind.config.ts`, `postcss.config.js`, `next.config.js`

### 5.2 تعديلات قاعدة البيانات

**`prisma/schema.prisma` — إضافات فقط:**
```prisma
model Player {
  // ... الحقول الموجودة بلا تعديل ...
  team  String?  // "RED" | "GREEN" | null (الكابتن)
}

model GameSession {
  // ... الحقول الموجودة بلا تعديل ...
  gameType String @default("HUROOF") // للتوسع المستقبلي
}
```

**`prisma/seed.ts` — استبدال كامل:**
- حذف الـ 100 سؤال الحالي
- استيراد الـ 480 سؤال من `مسابقة الحروف.txt`
- إضافة حقل `letter` لـ `QuestionBank` (أو استخدام `category` لحفظ الحرف)

**`prisma/schema.prisma` — `QuestionBank`:**
```prisma
model QuestionBank {
  // ... الحقول الموجودة ...
  category String  // ← يُستخدم لحفظ الحرف مثلاً "أ" أو "ب"
}
```
> **ملاحظة:** حقل `category` موجود بالفعل — يمكن استخدامه لتخزين الحرف مباشرة.

### 5.3 ملف جديد: `lib/hexUtils.ts`

```typescript
export const GRID_COLS = 11;
export const GRID_ROWS = 11;

export type TeamColor = 'RED' | 'GREEN';

export interface HexCell {
  id: number;         // 0-120 (col * GRID_ROWS + row) — مفيد كـ React key
  col: number;
  row: number;
  letter: string;     // الحرف المُعيَّن لهذه الخلية
  owner: TeamColor | null;
}

// ⚠️ تنبيه JSON: Map لا تتسلسل بـ JSON.stringify تلقائياً:
// JSON.stringify(new Map()) === "{}" — لذلك:
// - السيرفر: يحتفظ بـ Map للبحث السريع (O(1))
// - عند الإرسال عبر Socket: [...grid.values()] → HexCell[]
// - العميل: يخزن HexCell[] وليس Map

// تهيئة اللوحة الفارغة مع توزيع الحروف
export function initGrid(letters: string[]): Map<string, HexCell>

// مفتاح الخلية: "col-row"
export function cellKey(col: number, row: number): string

// Cache دائم للجيران — يُحسب مرة واحدة لكل موضع (لا يتغير مع اللعبة)
// مخزن خارج الدوال لتفادي إعادة الحساب
const NEIGHBORS_CACHE = new Map<string, Array<[number, number]>>();
export function getNeighborCoords(col: number, row: number): Array<[number, number]>

// الجيران الستة لخلية معينة (تُرجع الخلايا الموجودة فقط — 0≤col≤10, 0≤row≤10)
export function getNeighbors(col: number, row: number, grid: Map<string, HexCell>): HexCell[]

// BFS — هل فاز الفريق؟
export function checkWin(grid: Map<string, HexCell>, team: TeamColor): boolean

// إرجاع مسار الفوز للتمييز البصري
export function getWinningPath(grid: Map<string, HexCell>, team: TeamColor): string[]
```

**تفاصيل checkWin:**
```typescript
function checkWin(grid: Map<string, HexCell>, team: TeamColor): boolean {
  const startCells = [...grid.values()].filter(c =>
    c.owner === team &&
    (team === 'RED' ? c.col === 0 : c.row === 0)
  );

  const isTarget = (c: HexCell) =>
    team === 'RED' ? c.col === GRID_COLS - 1 : c.row === GRID_ROWS - 1;

  // BFS — 121 خلية كحد أقصى، أداء لحظي (< 1ms)
  const visited = new Set<string>();
  const queue = [...startCells];
  let head = 0; // نستخدم pointer بدلاً من shift() لتجنب O(n) لكل عملية

  while (head < queue.length) {
    const current = queue[head++];
    const key = cellKey(current.col, current.row);
    if (visited.has(key)) continue;
    visited.add(key);
    if (isTarget(current)) return true;

    getNeighbors(current.col, current.row, grid)
      .filter(n => n.owner === team && !visited.has(cellKey(n.col, n.row)))
      .forEach(n => queue.push(n));
  }
  return false;
}
// ملاحظة: BFS يكفي حالياً ولا يحتاج Union-Find، 121 خلية بسيطة جداً
```

**اختبار وحدة سريع (قبل المتابعة للـ gameEngine):**
```typescript
// lib/__tests__/hexUtils.test.ts
test('RED wins with horizontal path', () => {
  const grid = initGrid(letters);
  for (let c = 0; c < 11; c++)
    grid.set(`${c}-5`, { ...grid.get(`${c}-5`)!, owner: 'RED' });
  expect(checkWin(grid, 'RED')).toBe(true);
  expect(checkWin(grid, 'GREEN')).toBe(false);
});

test('no winner with partial path', () => {
  const grid = initGrid(letters);
  for (let c = 0; c < 5; c++) // نصف المسار فقط
    grid.set(`${c}-5`, { ...grid.get(`${c}-5`)!, owner: 'RED' });
  expect(checkWin(grid, 'RED')).toBe(false);
});
```

### 5.4 `lib/gameEngine.ts` — إعادة كتابة كاملة

**أنواع الحالة:**
```typescript
type GamePhase =
  | 'WAITING_TEAMS'   // اختيار الفرق قبل بدء اللعبة
  | 'CELL_SELECTION'  // الفريق الحالي يختار خلية
  | 'ANSWERING'       // سؤال مطروح — اللاعبون يجيبون
  | 'ANSWER_REVEAL'   // عرض النتيجة (2-3 ثواني)
  | 'ROUND_OVER'      // جولة انتهت — ينتظر الكابتن
  | 'DAIRAT_AL_DAW'   // دائرة الضوء
  | 'GAME_OVER';      // انتهت اللعبة

interface HexGameState {
  sessionId: string;
  hostPlayerId: string;
  phase: GamePhase;
  currentRound: number;        // 1-5
  roundWins: { RED: number; GREEN: number };
  currentTeam: TeamColor;      // من دوره الآن
  grid: Map<string, HexCell>;  // اللوحة الحالية (في الذاكرة — Map للبحث السريع)
  gridVersion: number;         // يزيد مع كل تغيير — يساعد العميل على كشف desyncs
  redTeam: Set<string>;        // player IDs
  greenTeam: Set<string>;
  selectedCell: { col: number; row: number } | null;
  activeQuestion: {
    letter: string;
    text: string;
    options: string[];
    correctIndex: number;
    endTime: number;
  } | null;
  answerLocked: boolean;       // true بعد أول إجابة صحيحة — يُتجاهل ما يليها
  questionTimer: NodeJS.Timeout | null;
  questionsByLetter: Map<string, QuestionData[]>; // letter → questions (محمّلة مسبقاً)
  usedQuestions: Set<number>;  // questionIds المستخدمة
  players: Map<string, PlayerState>;
  winningPath: string[] | null; // مسار الفوز للعرض البصري
  dawState: {                  // حالة دائرة الضوء
    winnerTeam: TeamColor;
    timer: NodeJS.Timeout | null;
    endTime: number;
    score: number;
  } | null;
}
```

**Socket Events الجديدة:**

| الحدث (Client → Server) | البيانات | التحقق |
|:---|:---|:---|
| `join_room` | موجود — لا تغيير | — |
| `set_team` | `{ roomCode, team: 'RED'\|'GREEN' }` | phase === WAITING_TEAMS |
| `start_game` | `{ roomCode }` | الكابتن + كل فريق لاعب واحد+ |
| `select_cell` | `{ roomCode, col, row }` | phase === CELL_SELECTION + المُرسِل في currentTeam |
| `submit_answer` | `{ roomCode, answerIndex }` | phase === ANSWERING + المُرسِل في currentTeam |
| `next_round` | `{ roomCode }` | الكابتن + phase === ROUND_OVER |
| `start_daw` | `{ roomCode }` | الكابتن + phase === GAME_OVER |
| `daw_judge` | `{ roomCode, correct: boolean }` | الكابتن + phase === DAIRAT_AL_DAW |

| الحدث (Server → Client) | البيانات | المستقبل | متى |
|:---|:---|:---|:---|
| `room_joined` | `{ playerId, isHost, players[], team?, gameStatus }` | اللاعب | عند الانضمام |
| `player_update` | `{ players[] }` بهم حقل `team` | الغرفة | عند تغيير الفريق |
| `team_updated` | `{ redTeam: string[], greenTeam: string[] }` | الغرفة | عند set_team |
| `game_start` | `{ phase, grid: HexCell[], currentTeam, round, roundWins, gridVersion }` | الغرفة | **Full grid** |
| `cell_selected` | `{ col, row, letter, team }` | الغرفة | بعد select_cell |
| `question_for_cell` | `{ letter, text, options[], endTime, col, row }` | الغرفة | سؤال جديد |
| `answer_locked` | `{ correctPlayerId, playerName, col, row }` | الغرفة | أول صحيحة |
| `cell_claimed` | `{ col, row, owner: TeamColor, gridVersion }` | الغرفة | **Delta — خفيف** |
| `answer_timeout` | `{ correctIndex, col, row, currentTeam }` | الغرفة | انتهاء الوقت |
| `round_over` | `{ winner: TeamColor, roundWins, winningPath: string[] }` | الغرفة | — |
| `round_start` | `{ round, grid: HexCell[], currentTeam, roundWins, gridVersion }` | الغرفة | **Full grid** |
| `game_over` | `{ winner: TeamColor, roundWins }` | الغرفة | — |
| `grid_sync` | `{ grid: HexCell[], gridVersion }` | اللاعب | **عند Reconnect فقط** |
| `daw_start` | `{ winnerTeam, endTime }` | الغرفة | — |
| `daw_question` | `{ text, options[] }` | الغرفة | — |
| `daw_result` | `{ correct }` | الغرفة | — |
| `daw_end` | `{ score, total }` | الغرفة | — |
| `error` | `{ message }` | اللاعب | — |

> **استراتيجية المزامنة:** إرسال Grid كامل (121 خلية) فقط ثلاث مرات: `game_start`، `round_start`، `reconnect`. أثناء اللعب يُرسل حدث `cell_claimed` خفيف (3 حقول فقط). هذا يقلل البيانات بـ ~90%.

**تسلسل المنطق:**

```
select_cell:
  ← تحقق phase === CELL_SELECTION
  ← تحقق المُرسِل في redTeam أو greenTeam حسب currentTeam
  ← تحقق الخلية grid[key].owner === null (محايدة)
  ← اسحب سؤالاً من questionsByLetter[cell.letter] (لم يُستخدم مسبقاً)
  ← phase = ANSWERING, selectedCell, activeQuestion
  ← answerLocked = false
  ← emit 'cell_selected' + 'question_for_cell' للغرفة
  ← شغّل Timer (30 ثانية)

submit_answer:
  ← تحقق phase === ANSWERING
  ← تحقق المُرسِل في currentTeam
  ← تحقق !answerLocked (إذا كان true → تجاهل الإجابة)
  ← حساب isCorrect في السيرفر (activeQuestion.correctIndex)
  ← صحيح:
      → answerLocked = true  ← يحمي من race conditions
      → إلغاء Timer
      → emit 'answer_locked' { correctPlayerId, playerName, col, row } للغرفة
      → grid[selectedCell].owner = currentTeam
      → gridVersion++
      → emit 'cell_claimed' { col, row, owner, gridVersion } للغرفة  ← Delta خفيف
      → pause 1500ms
      → checkWin():
          - فاز → roundWins[team]++
                  winningPath = getWinningPath()
                  if roundWins[team] >= 3 → phase = GAME_OVER → emit 'game_over'
                  else → phase = ROUND_OVER → emit 'round_over'
          - لم يفز → currentTeam = الفريق الآخر
                      phase = CELL_SELECTION
  ← خطأ (أو timeout):
      → grid[selectedCell] لا يتغير
      → currentTeam = الفريق الآخر
      → phase = CELL_SELECTION
      → emit 'answer_timeout' للغرفة

disconnect (اللاعب أثناء ANSWERING):
  ← تحقق هل بقي لاعبون متصلون في currentTeam
  ← نعم → استمر، Timer يعمل بشكل طبيعي
  ← لا (آخر لاعب في الفريق انقطع):
      → clearTimeout(questionTimer)
      → currentTeam = الفريق الآخر
      → phase = CELL_SELECTION
      → emit 'answer_timeout' للغرفة

next_round (الكابتن):
  ← تهيئة grid جديد (initGrid)
  ← gridVersion = 0 للجولة الجديدة
  ← currentRound++
  ← currentTeam = الفريق الذي خسر الجولة الأخيرة
  ← phase = CELL_SELECTION
  ← emit 'round_start' { round, grid: [...grid.values()], currentTeam, roundWins, gridVersion }  ← Full grid

reconnect (لاعب عائد):
  ← بعد join_room الناجح:
  ← emit 'grid_sync' { grid: [...grid.values()], gridVersion }  ← Full grid للعائد فقط
```

### 5.5 تحديث `app/room/[code]/page.tsx`

**إضافة مرحلة اختيار الفريق:**
```
بعد join_room → إذا phase === WAITING_TEAMS:
  يظهر: [🔴 الفريق الأحمر] [🟢 الفريق الأخضر]
  كل زر يرسل emit('set_team', { roomCode, team: 'RED'|'GREEN' })
  يُعرض عدد اللاعبين في كل فريق (real-time)
  الكابتن: يرى زر "ابدأ اللعبة" (يُفعَّل عند ≥ 1 في كل فريق)
```

### 5.6 تحديث `app/play/[code]/page.tsx` — إعادة كتابة

**مشاهد اللاعب:**
```
CELL_SELECTION:
  → دور فريقه: يرى اللوحة + يستطيع الضغط على خلية محايدة
  → دور الخصم: يرى اللوحة فقط (read-only)

ANSWERING:
  → فريقه: يرى السؤال + 4 أزرار MCQ (30 ثانية)
  → الآخرون: يرون السؤال + الخيارات (disabled) يشاهدون

ANSWER_REVEAL:
  → الجميع يرون اللوحة المحدّثة + اللون الجديد

ROUND_OVER:
  → المسار الفائز يضيء على اللوحة
  → الكابتن: زر "الجولة التالية"

GAME_OVER:
  → الفريق الفائز + النقاط
  → الكابتن: زر "دائرة الضوء"

DAIRAT_AL_DAW:
  → مؤقت 60 ثانية ضخم
  → سؤال مطروح
  → الكابتن: ✅ صحيح / ❌ خطأ
```

**مشاهد الكابتن:**
```
CELL_SELECTION: يرى اللوحة + أي الفريق دوره (بدون تحكم بالخلايا)
ANSWERING: يرى السؤال + ينتظر (أو يتخطى)
ROUND_OVER: يرى المسار + زر "الجولة التالية"
GAME_OVER: النتيجة + زر "دائرة الضوء"
DAIRAT_AL_DAW: يتحكم كاملاً (✅/❌)
```

### 5.7 المكونات الجديدة المطلوبة

#### `app/components/HexGrid.tsx`
```tsx
// SVG شبكة 11×11 سداسية
// HEX_SIZE ديناميكي — لا تستخدم قيمة ثابتة
// viewBox متكيف مع الحجم المحسوب

interface HexGridProps {
  cells: HexCell[];                 // مصفوفة — وليس Map (سهل render مباشر)
  currentTeam: TeamColor | null;
  myTeam: TeamColor | null;
  onCellClick?: (col: number, row: number) => void;
  selectedCell?: { col: number; row: number } | null;
  winningPath?: string[];
  phase: GamePhase;
}
```

**حساب HEX_SIZE ديناميكياً (للموبايل):**
```typescript
// احسب الحجم بناءً على عرض الحاوية — الموبايل 375px
const HEX_SIZE = Math.min(35, (containerWidth - 32) / 20);
// عرض 11 عمود = 11 * 1.5 * size + size ≈ 17.5 * size → نقسم على ~20 مع هوامش
```

**حساب مواضع الخلايا:**
```typescript
function getHexCenter(col: number, row: number, size: number) {
  const x = size * 1.5 * col + size;
  const y = size * Math.sqrt(3) * (row + (col % 2) * 0.5) + size;
  return { x, y };
}

function getHexPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(' ');
}
```

**قواعد CSS للموبايل (مهمة):**
```css
.hex-grid-container {
  width: 100%;
  overflow-x: auto;          /* إذا ضاق العرض، scroll أفضل من تصغير مفرط */
  touch-action: manipulation; /* يمنع التكبير العرضي عند اللمس */
  user-select: none;         /* يمنع تحديد النص عند اللمس السريع */
}
```

**نقاط الحواف للمناطق الملونة:**
```
حدود منطقة الأحمر: يمين اللوحة (col=0) وشريط أيسر (col=10) بلون أحمر شفاف
حدود منطقة الأخضر: أعلى اللوحة (row=0) وشريط أسفل (row=10) بلون أخضر شفاف
```

#### `app/components/HexCell.tsx`
```tsx
// ⚡ ضروري: React.memo لتجنب إعادة رسم 120 خلية عند تغيير خلية واحدة
export const HexCell = React.memo(function HexCell({ cell, isSelected, isWinPath, isHoverable, onClick }) {
  // ...
}, (prev, next) =>
  prev.cell.owner === next.cell.owner &&
  prev.isSelected === next.isSelected &&
  prev.isWinPath === next.isWinPath &&
  prev.isHoverable === next.isHoverable
);
```

```
حالات الخلية:
  neutral   → #374151 (رمادي) + الحرف بلون فاتح
  red       → #dc2626 + الحرف أبيض
  green     → #16a34a + الحرف أبيض
  selected  → ذهبي + animation نبض (pulse-gold)
  answer_locked → تأثير تلاشي سريع (200ms)
  winPath   → يومض بلون الفريق الفائز
  hoverable → shimmer overlay عند Hover (دور فريقهم فقط)
```

#### `app/components/QuestionModal.tsx`
```
drawer من الأسفل (أو modal في المنتصف):
  - عنوان: "سؤال حرف [الحرف]"
  - نص السؤال (عربي، خط كبير)
  - شريط وقت متناقص (30 ثانية → يتحول أحمر عند 10 ثواني)
  - 4 أزرار MCQ:
      → clickable فقط لفريق currentTeam
      → الآخرون: يرون نفس الأزرار لكن disabled
  - بعد الإجابة أو انتهاء الوقت: اضاءة الصحيح أخضر / الخطأ أحمر
```

#### `app/components/RoundTracker.tsx`
```
عرض: ●●●●● (5 دوائر)
مملوءة بالأحمر أو الأخضر حسب الفائز بكل جولة
الجولة الحالية تومض
```

#### `app/components/DairataAlDaw.tsx`
```
مؤقت 60 ثانية (يعتمد على endTime من السيرفر)
سؤال يُعرض نصياً
زر ✅ + زر ❌ (للكابتن فقط)
الآخرون: مشاهدة فقط
عداد النتيجة: X/Y
```

---

## 6. `prisma/seed.ts` الجديد — استيراد الأسئلة

```typescript
// الخوارزمية:
// 1. قراءة مسابقة الحروف.txt
// 2. تحليله (parsing) إلى مصفوفة HuroofQuestion[]
// 3. إدراجها في QuestionBank مع category = الحرف

const fs = require('fs');
const content = fs.readFileSync('./مسابقة الحروف.txt', 'utf8');

function parse(content: string): HuroofQuestion[] {
  const questions: HuroofQuestion[] = [];
  const lines = content.split('\n');
  let currentLetter = '';
  let currentQ: Partial<HuroofQuestion> | null = null;
  let options: string[] = [];
  let correctIndex = -1;

  for (const line of lines) {
    const trimmed = line.trim();

    // اكتشاف الحرف
    const letterMatch = trimmed.match(/^## مسابقة حرف \(\s*(.+?)\s*\)/);
    if (letterMatch) {
      currentLetter = letterMatch[1].trim();
      continue;
    }

    // اكتشاف سؤال جديد
    const qMatch = trimmed.match(/^\*\*س\d+:\s*(.+)/);
    if (qMatch) {
      if (currentQ && options.length === 4) {
        questions.push({
          letter: currentQ.letter!,
          text: currentQ.text!,
          options,
          correctIndex,
        });
      }
      currentQ = { letter: currentLetter, text: qMatch[1].replace(/\s*\?\s*\*\*$/, '?').trim() };
      options = [];
      correctIndex = -1;
      continue;
    }

    // اكتشاف خيار
    const optMatch = trimmed.match(/^\*\s+(.+)/);
    if (optMatch && currentQ) {
      const optText = optMatch[1];
      if (optText.includes('(الإجابة الصحيحة)')) {
        correctIndex = options.length;
        options.push(optText.replace(/\s*\(الإجابة الصحيحة\)\s*/, '').trim());
      } else {
        options.push(optText.trim());
      }
    }
  }

  // آخر سؤال
  if (currentQ && options.length === 4) {
    questions.push({ letter: currentQ.letter!, text: currentQ.text!, options, correctIndex });
  }

  return questions;
}

// ثم seed إلى قاعدة البيانات:
async function main() {
  await prisma.questionBank.deleteMany();
  const parsed = parse(content);
  await prisma.questionBank.createMany({
    data: parsed.map(q => ({
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      category: q.letter,  // حقل category يحمل الحرف
      isActive: true,
    }))
  });
  console.log(`✅ تم استيراد ${parsed.length} سؤال`);
}
```

---

## 7. آلية تحميل الأسئلة أثناء اللعبة

عند `start_game` في `gameEngine.ts`:
```typescript
// سحب كل الأسئلة النشطة مرة واحدة من DB
const allQuestions = await prisma.questionBank.findMany({
  where: { isActive: true },
  select: { id: true, text: true, options: true, correctIndex: true, category: true }
});

// تنظيمها حسب الحرف في Map
const questionsByLetter = new Map<string, QuestionData[]>();
for (const q of allQuestions) {
  const letter = q.category; // الحرف
  if (!questionsByLetter.has(letter)) questionsByLetter.set(letter, []);
  questionsByLetter.get(letter)!.push(q);
}
// تخزينها في game state في الذاكرة
```

عند `select_cell`:
```typescript
const letter = grid.get(cellKey)!.letter;
const pool = questionsByLetter.get(letter) || [];
const unused = pool.filter(q => !usedQuestions.has(q.id));

// إذا نفدت أسئلة هذا الحرف → أعد استخدام الكل
const source = unused.length > 0 ? unused : pool;
const question = source[Math.floor(Math.random() * source.length)];
usedQuestions.add(question.id);
```

---

## 8. توزيع الحروف على اللوحة

عند بدء كل جولة — توزيع **متوازن** ثم خلط عشوائي:
```typescript
function assignLettersToGrid(availableLetters: string[]): string[] {
  // 28 حرف × ~4 تكرارات = 112، نملأ المتبقية (9 خلايا) بحروف عشوائية
  const pool: string[] = [];
  const baseCount = Math.floor(121 / availableLetters.length); // ~4
  const remainder = 121 % availableLetters.length;             // ~9

  for (const letter of availableLetters) {
    for (let i = 0; i < baseCount; i++) pool.push(letter);
  }
  // الـ remainder: خذ أول N حروف
  for (let i = 0; i < remainder; i++) pool.push(availableLetters[i]);

  return shuffle(pool); // 121 عنصر، كل حرف يظهر baseCount أو baseCount+1 مرات
}
// النتيجة: كل حرف يظهر 4-5 مرات على اللوحة — توزيع عادل
// يضمن وجود حروف كافية في كل مساحة اللوحة
```

---

## 8.5 تقسيم الملفات المحدَّث

بناءً على توصية المراجعين لتجنب ملف gameEngine ضخم (500+ سطر):

```
lib/
├── gameEngine.ts           # منطق Socket فقط — يستدعي الدوال من الملفات الأخرى
├── hexUtils.ts             # شبكة + BFS + توزيع الحروف + neighbors cache
├── questionLoader.ts       # جديد: سحب الأسئلة من DB وتنظيمها حسب الحرف
└── dawEngine.ts            # جديد: منطق دائرة الضوء (timer + judge + end)
```

**لماذا هذا التقسيم؟**
- `hexUtils.ts`: ثابت رياضياً، يُختبر بشكل مستقل
- `questionLoader.ts`: خاص بـ DB، يُغيَّر بدون لمس منطق اللعبة
- `dawEngine.ts`: منطق مستقل تماماً عن اللوحة
- `gameEngine.ts`: يُركّز على Socket events فقط، أسهل للقراءة

---

## 8.6 إدارة الذاكرة وتنظيف الجلسات

```typescript
// تنظيف مؤقتات عند انتهاء اللعبة (يمنع memory leaks)
function cleanupGame(roomCode: string) {
  const game = activeGames.get(roomCode);
  if (game) {
    if (game.questionTimer) clearTimeout(game.questionTimer);
    if (game.dawState?.timer) clearTimeout(game.dawState.timer);
    activeGames.delete(roomCode);
  }
}

// تنظيف دوري للغرف الفارغة (الجميع انقطع ولم يعودوا)
setInterval(() => {
  for (const [code, game] of activeGames) {
    const connectedPlayers = [
      ...game.redTeam,
      ...game.greenTeam,
      game.hostPlayerId
    ].filter(id => game.players.get(id)?.isConnected).length;

    if (connectedPlayers === 0) {
      cleanupGame(code);
      console.log(`🧹 تنظيف غرفة فارغة: ${code}`);
    }
  }
}, 5 * 60 * 1000); // كل 5 دقائق
```

---

## 9. الأولويات والترتيب المقترح للتطوير

```
المرحلة 1 (الأساس الرياضي):
  ↳ lib/hexUtils.ts
  ↳ اختبر checkWin() بحالات بسيطة قبل المتابعة

المرحلة 2 (البيانات):
  ↳ تعديل prisma/schema.prisma (إضافة team في Player)
  ↳ npm run db:push
  ↳ كتابة prisma/seed.ts الجديد
  ↳ npm run db:seed (تأكد من 480 سؤال في DB)

المرحلة 3 (محرك اللعبة):
  ↳ lib/gameEngine.ts — إعادة كتابة كاملة
  ↳ أطول مرحلة وأعقدها

المرحلة 4 (مكونات الواجهة):
  ↳ app/components/HexGrid.tsx
  ↳ app/components/HexCell.tsx
  ↳ app/components/RoundTracker.tsx
  ↳ يمكن تطويرها بالتوازي مع المرحلة 3

المرحلة 5 (صفحة اللعب):
  ↳ app/play/[code]/page.tsx — إعادة كتابة
  ↳ app/components/QuestionModal.tsx

المرحلة 6 (غرفة الانتظار):
  ↳ app/room/[code]/page.tsx — إضافة team selection

المرحلة 7 (المرحلة النهائية):
  ↳ app/components/DairataAlDaw.tsx
  ↳ إضافة daw logic في gameEngine.ts
```

---

## 10. القرارات المعتمدة (بعد مراجعة 5 نماذج لغوية)

| السؤال | القرار المعتمد | السبب |
|:---|:---|:---|
| Map vs Array | Map في السيرفر + Array للعميل | Map لا تتسلسل بـ JSON تلقائياً |
| إرسال Grid | Delta (`cell_claimed`) أثناء اللعب + Full عند start/reconnect | تقليل البيانات ~90% |
| آلية الإجابة | كل الفريق يجيب — أسرع صحيحة تقفل السؤال | تفاعل أعلى، لا أحد ينتظر |
| رسم الشبكة | SVG مخصص — لا مكتبة خارجية | react-hexgrid قديمة، مشاكل RTL |
| BFS | الكود المقترح صحيح + تحسين pointer بدل shift() | أداء أفضل |
| `gridVersion` | مضاف للمزامنة | يكشف desyncs |
| انقطاع أثناء ANSWERING | إذا آخر لاعب في الفريق → timeout | لا تعقيد إضافي |
| `React.memo` | على `HexCell` — يقارن owner فقط | 120 من 121 خلية لا تتغير في كل دور |
| Neighbors Cache | ثابت لكل موضع، يُحسب مرة واحدة | O(1) بدل O(1) مع allocations |
| تقسيم الملفات | hexUtils + questionLoader + dawEngine | تقليل ضخامة gameEngine |
| تنظيف الذاكرة | cleanupGame + interval كل 5 دقائق | منع memory leaks |

---

## 11. ملاحظات تقنية حرجة

1. **لا تستخدم Supabase أو Firebase** — البنية التحتية موجودة (PostgreSQL على VPS)
2. **لا تُغيّر `server.ts`** — يعمل وهو نقطة دخول Socket.io
3. **`isCorrect` تُحسب في السيرفر دائماً** — قاعدة غير قابلة للتفاوض
4. **`activeGames` Map** تُفقد عند restart — لا تعتمد على استمرارها
5. **الكابتن** = أول من ينضم — لا يلعب، يدير فقط
6. **Mobile-first** — الشبكة السداسية يجب أن تعمل على شاشات صغيرة (375px+)
7. **RTL** — واجهة عربية كاملة، `dir="rtl"` موجود في layout
8. **`Map` لا تُرسَل بـ JSON** — `JSON.stringify(new Map())` يُعطي `"{}"`. دائماً حوّل: `[...grid.values()]` قبل الإرسال
9. **لا تستخدم `react-hexgrid`** — قديمة، مشاكل RTL، أقل مرونة من SVG مخصص
10. **`answerLocked`** يجب يُعاد ضبطه إلى `false` عند كل `select_cell` جديد

---

## 12. ما تجاهلناه من المراجعات وسببه

| الاقتراح | المصدر | سبب التجاهل |
|:---|:---|:---|
| Union-Find بدل BFS | مراجع 1 | 121 خلية لا تحتاج هذا التعقيد — BFS كافٍ تماماً |
| وضع التدريب (Practice Mode) | مراجع 4+5 | خارج نطاق المرحلة الحالية — يُضاف لاحقاً |
| تسجيل أحداث اللعبة للتحليل | مراجع 4 | اختياري — بعد التأكد من الاستقرار |
| Captain Answer Mode | مراجع 1 | يعقّد الواجهة — الوضع الحالي يكفي |
| وضع العرض الجماعي TV Mode | مراجع 1 | تحسين مستقبلي ممتاز — ليس الآن |
| تخزين حالة اللعبة في DB | مراجع 3 | تعقيد غير ضروري — activeGames كافٍ |
| Smart Hint System | مراجع 1 | يغيّر توازن اللعبة |
| المراجع السادس (كاملاً) | — | يتحدث عن مشروع مختلف تماماً (نظام مدرسي) |

---

*نهاية الخطة — نسخة مُحدَّثة بعد مراجعة 5 نماذج لغوية*

---

## 13. ملحق — حالة التنفيذ (19 مارس 2026)

### ✅ منجز

| الملف | الحالة | ملاحظات |
|:---|:---|:---|
| `lib/hexUtils.ts` | مُنشأ (175 سطر، بلا أخطاء) | HexCell، cellKey، initGrid، checkWin (BFS)، getWinningPath، NEIGHBORS_CACHE، preWarmNeighborsCache |
| `prisma/schema.prisma` | مُعدَّل | أُضيف `team String?` إلى Player، وأُضيف `gameType String @default("HUROOF")` إلى GameSession |
| `prisma/seed.ts` | مُعاد كتابته | دالة parseQuestionsFile() تُحلّل مسابقة الحروف.txt، تحذف القديم وتدرج الجديد بـ createMany، تطبع توزيع الحروف |
| `lib/questionLoader.ts` | مُنشأ (بلا أخطاء) | loadQuestionsByLetter()، pickQuestion()، getAvailableLetters() |
| `lib/dawEngine.ts` | مُنشأ (بلا أخطاء) | DawState، createDawState()، getCurrentDawQuestion()، advanceDaw()، clearDawTimeout() |
| `lib/gameEngine.ts` | مُعاد كتابته كليًا (406 سطر، بلا أخطاء) | كل أحداث Socket، answerLocked، gridVersion، delta events، cleanupGame + setInterval |
| `app/components/HexCell.tsx` | مُنشأ (بلا أخطاء) | SVG polygon، React.memo مع مقارنة مخصصة، ألوان حسب الحالة |
| `app/components/QuestionModal.tsx` | مُنشأ (بلا أخطاء) | عداد تنازلي بـ endTime، أزرار MCQ، canAnswer للفريق الحالي فقط |
| `app/components/RoundTracker.tsx` | مُنشأ (بلا أخطاء) | 5 نقاط تُلوَّن بأحمر/أخضر حسب الفائز بكل جولة |
| `app/components/DairataAlDaw.tsx` | مُنشأ (بلا أخطاء) | عداد 60 ثانية، أزرار الحكم للكابتن، عرض النتيجة النهائية |

### ✅ مُنجز (الجلسة الثانية)

| الملف | الحالة | ملاحظات |
|:---|:---|:---|
| `app/components/HexGrid.tsx` | مُنشأ (~180 سطر) | SVG grid ديناميكي + ResizeObserver + edge markers لتمييز اتجاه كل فريق |
| `app/room/[code]/page.tsx` | أُعيد كتابته | واجهة اختيار الفرق (أحمر/أخضر) + QR + نسخ رابط + زر بدء |
| `app/play/[code]/page.tsx` | أُعيد كتابته كليًا | 18 حدث Socket، جميع مراحل اللعبة، HexGrid + QuestionModal + RoundTracker + DairataAlDaw |
| `lib/gameEngine.ts` | إصلاح | next_round يُعطي الجولة للفريق الخاسر بدلاً من RED دائمًا |
| `prisma/seed.ts` | تنظيف | حُذفت ~110 أسطر dead code (مصفوفة أسئلة قديمة) |

### ⏳ يحتاج تشغيل يدوي

| الأمر | الملاحظات |
|:---|:---|
| `npx prisma db push` | تطبيق تغييرات الـ Schema على DB |
| `npx prisma db seed` | استيراد الـ 480 سؤال |

### أخطاء جرى إصلاحها أثناء التنفيذ

| الخطأ | الملف | الحل |
|:---|:---|:---|
| `import prisma from './prisma'` | questionLoader.ts | صُحّح إلى `import { prisma } from './prisma'` |
| خاصية `onClick` مكررة | HexCell.tsx | حُذفت الخاصية الزائدة |
| `next_round` يعطي RED دائمًا | gameEngine.ts | صُحّح إلى `otherTeam(game.currentTeam)` |
| Room page يستمع لأحداث قديمة | room/[code]/page.tsx | استُبدل `question_start` بـ `game_start` و `update_host` بـ `host_changed` |
| Dead code في seed.ts | seed.ts | حُذفت مصفوفة `questions: never[]` غير المستخدمة |

## 14. تحليل المراجعات الخارجية

### ملاحظات تم تأكيد معالجتها مسبقًا
- **Race condition على answerLocked**: ليست مشكلة حقيقية — Node.js أحادي الخيط ضمن event loop
- **React.memo comparison في HexCell**: المقارنة المخصصة شاملة (owner, letter, isSelected, isWinPath, isHoverable, answerLocked, cx, cy, size)
- **إعادة الاتصال**: `grid_sync` يُرسل الحالة الكاملة (grid, phase, currentTeam, roundWins, activeQuestion)
- **توزيع الحروف عشوائيًا**: `initGrid()` يستخدم Fisher-Yates shuffle
- **Touch handling**: `touch-action: manipulation` و `user-select: none` موجودان
- **Memory cleanup**: `setInterval` كل 30 ثانية + `cleanupGame()` عند انتهاء اللعبة

### ملاحظات تم إصلاحها
- **next_round يعطي RED دائمًا** → أُصلح ليكون الخاسر: `otherTeam(game.currentTeam)`
- **Room page بدون اختيار فرق** → أُعيد كتابته بواجهة فريقين
- **Play page لا زال MCQ** → أُعيد كتابته كليًا للعبة Hex
- **أحداث Socket غير متطابقة** → وُحّدت الأسماء بين server و client
