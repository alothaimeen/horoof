مهمة تطوير لعبة حروف: الشبكة 5×5 + زر السرعة + تصميم ثلاثي الأبعاد
أنت وكيل ذكاء اصطناعي مكلف بتنفيذ ثلاثة تعديلات متكاملة على مشروع "لعبة حروف". ابدأ بقراءة 
CONTEXT.md
 لفهم بنية المشروع الكاملة قبل أي تعديل.

التعديل الأول: تغيير الشبكة من 11×11 إلى 5×5 (نظام Odd-Q)
في 
lib/hexUtils.ts
:
غيّر القيم التالية:

ts
export const GRID_COLS = 5;
export const GRID_ROWS = 5;
export const TOTAL_CELLS = 25;
عدّل دالة 
getNeighborCoords
 لتستخدم نظام الإزاحة الفردية (Odd-Q Vertical). الأعمدة الفردية (1, 3) مُزاحة للأسفل بنصف خلية وهذا يغير حسابات الجيران:

ts
export function getNeighborCoords(col: number, row: number): Array<[number, number]> {
  // odd-q offset: أعمدة فردية مزاحة للأسفل
  const dirs: Array<[number, number]> = col % 2 === 0
    ? [[ 0,-1],[ 0, 1],[-1,-1],[-1, 0],[ 1,-1],[ 1, 0]]
    : [[ 0,-1],[ 0, 1],[-1, 0],[-1, 1],[ 1, 0],[ 1, 1]];
  return dirs
    .map(([dc, dr]) => [col + dc, row + dr] as [number, number])
    .filter(([nc, nr]) => nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS);
}
تأكد من تحديث 
checkWin
 و 
getWinningPath
: الأحمر يربط col=0 ↔ col=4 والأخضر يربط row=0 ↔ row=4.

التعديل الثاني: تصميم ثلاثي الأبعاد ومضيء (3D Neon Glass Design)
المطلوب: نفس توزيع الألوان (أحمر على اليمين/اليسار، أخضر فوق/أسفل) لكن بمظهر حديث ثلاثي الأبعاد عالي الجودة. لا تستخدم CSS خارجياً—كل شيء داخل SVG.

في 
app/components/HexGrid.tsx
:
أ. دالة حساب المركز
الدالة الحالية صحيحة للـ Odd-Q، حافظ عليها:

ts
function getHexCenter(col: number, row: number, size: number) {
  const x = size * 1.5 * col + size;
  const y = size * Math.sqrt(3) * (row + (col % 2) * 0.5) + size;
  return { x, y };
}
ب. SVG Filters (إضافة داخل <defs>)
أضف هذه الـ filters داخل <defs> لتعطي الأعماق والإضاءة:

xml
<defs>
  {/* فلتر الإضاءة الداخلية للخلايا المحايدة */}
  <radialGradient id="hexNeutralGrad" cx="40%" cy="30%" r="65%">
    <stop offset="0%" stopColor="#2a3f6f" />
    <stop offset="100%" stopColor="#0b1225" />
  </radialGradient>
  {/* فلتر خلايا الأحمر */}
  <radialGradient id="hexRedGrad" cx="35%" cy="25%" r="70%">
    <stop offset="0%" stopColor="#ff5555" />
    <stop offset="100%" stopColor="#8b0000" />
  </radialGradient>
  {/* فلتر خلايا الأخضر */}
  <radialGradient id="hexGreenGrad" cx="35%" cy="25%" r="70%">
    <stop offset="0%" stopColor="#00e676" />
    <stop offset="100%" stopColor="#004d20" />
  </radialGradient>
  {/* خلايا الإطار الأحمر (الحدود) */}
  <radialGradient id="hexBorderRedGrad" cx="35%" cy="25%" r="70%">
    <stop offset="0%" stopColor="#ff3333" />
    <stop offset="100%" stopColor="#7a0000" />
  </radialGradient>
  {/* خلايا الإطار الأخضر (الحدود) */}
  <radialGradient id="hexBorderGreenGrad" cx="35%" cy="25%" r="70%">
    <stop offset="0%" stopColor="#00c853" />
    <stop offset="100%" stopColor="#00401a" />
  </radialGradient>
  {/* توهج نيوني للخلايا المُختارة أو الفائزة */}
  <filter id="glowRed" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#ff2222" floodOpacity="0.9"/>
  </filter>
  <filter id="glowGreen" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00ff88" floodOpacity="0.9"/>
  </filter>
  <filter id="glowGold" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#FFD700" floodOpacity="1"/>
  </filter>
</defs>
ج. رسم خلايا الإطار (بديل الـ line markers)
بدلاً من خطوط تحديد الحدود، ارسم خلايا سداسية كاملة بالألوان الصحيحة خارج شبكة اللعب لتملأ الفراغات المتعرجة على الحواف. استخدم دالة 
getHexCenter
 نفسها لكن بقيم col/row خارج حدود اللعبة (مثل col=-1 أو col=5):

ts
{/* الإطار الأحمر - عمود يسار */}
{Array.from({ length: GRID_ROWS }, (_, row) => {
  const { x, y } = getHexCenter(-1, row - (0 % 2 === 0 ? 0 : 0.5), hexSize);
  return <polygon key={`RedL-${row}`} points={getHexPoints(x, y, hexSize)} fill="url(#hexBorderRedGrad)" stroke="#550000" strokeWidth={1} />;
})}
{/* وكذلك: عمود يمين (col=5)، صف أعلى (row=-1)، صف أسفل (row=5) بالألوان المناسبة */}
ملاحظة: احسب التفاصيل الدقيقة للإزاحات بحيث تملأ الفراغات بالضبط تماماً كما في الصورة المرفقة.

د. تحديث 
HexCell.tsx
 لعرض الخلايا بتأثير ثلاثي الأبعاد
بدل اللون المسطح، استخدم fill="url(#hexNeutralGrad)" وما شابهه، وأضف:

بريق داخلي علوي (وهم الإضاءة): مضلع صغير بشكل القوس العلوي للخلية بلون أبيض شفاف (opacity 0.15) لمحاكاة انعكاس الضوء.
ظل سفلي: شريط سفلي بلون داكن شفاف لإعطاء إحساس العمق.
حدّ مضيء: stroke بلون أفتح من لون الخلية، مع strokeWidth={1.5}.
توهج نيوني للخلايا المُمتلكة عبر filter="url(#glowRed)" أو #glowGreen.
خلايا الفوز: توهج ذهبي filter="url(#glowGold)".
tsx
// مثال على كيفية دمج الـ gradient مع البريق الداخلي:
<polygon points={points} fill={gradientFill} stroke={strokeColor} strokeWidth={1.5} />
{/* البريق الداخلي العلوي — محاكاة الإضاءة */}
<polygon points={topHighlightPoints} fill="white" opacity={0.12} />
لحساب topHighlightPoints، خذ نقاط الضلع العلوي فقط (زوايا 4,5,0,1 للسداسي flat-top) ثم اجعلها قوساً شفافاً.

التعديل الثالث: نظام "زر السرعة" (Buzzer Mechanic)
في 
lib/gameEngine.ts
:
أضف 'BUZZER' إلى نوع 
GamePhase
.
عند استقبال select_cell: غيّر الطور إلى BUZZER وابثّ السؤال لجميع أفراد الغرفة بدون تفعيل المؤقت.
أضف مستمعاً لحدث جديد buzz_in:
إذا كان الطور BUZZER وهذا أول ضغط → سجّل answeringTeam وحوّل الطور إلى ANSWERING وابدأ المؤقت.
إذا أجاب الفريق خطأ → أتح زر السرعة للفريق الآخر مرة واحدة فقط (حالة: BUZZER_SECOND_CHANCE). إذا أخطأ الثاني أيضاً → يُغلق الحرف (يبقى محايداً ومتاحاً مرة أخرى، لكن الدور ينتقل للفريق الآخر).
في 
app/components/QuestionModal.tsx
:
في طور BUZZER:
اعرض نص السؤال بشكل واضح وكبير.
اعرض زراً ضخماً ونابضاً (pulse animation) بلون فريق اللاعب: "⚡ أنا أعرف!".
الخيارات مخفية أو مُعطاة.
عند الضغط على الزر يُرسل socket.emit('buzz_in') ويُعطَّل الزر فوراً (لمنع النقر المتعدد).
في طور ANSWERING:
للفريق الذي ضغط: تظهر الخيارات وتفعّل + يبدأ العداد التنازلي.
للبقية (مشاهدة): نص "🎯 [اسم الفريق] يجيب..." + العداد التنازلي فقط.
ملاحظات إلزامية للتنفيذ
حافظ على React.memo في 
HexCell
 مع تحديث معادلة المقارنة إن احتجت.
تحقق من خوارزمية الفوز 
checkWin
 بعد تعديل أبعاد الشبكة.
preWarmNeighborsCache
 تحتاج تعديلاً ليتوافق مع 5×5.
لا تكسر basePath — لا تعدّل next.config.js أو Socket path.
بعد الانتهاء، حدّث 
CONTEXT.md
: رقم الجلسة + آخر إنجاز.