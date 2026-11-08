export const departments = [
  'ירקות ופירות',
  'מוצרי חלב וביצים',
  'לחם ומאפים',
  'בשר ודגים',
  'מזווה',
  'קפואים',
  'משקאות',
  'ניקיון וטיפוח',
  'אחר',
] as const;
export const units = ['יח׳', 'ק״ג', 'גרם', 'ליטר', 'חבילה', 'קופסה', 'בקבוק'] as const;
export type Department = (typeof departments)[number];
export type Unit = (typeof units)[number];
export interface ParsedItem {
  name: string;
  quantity: number;
  unit: Unit;
  department: Department;
  explicit: boolean;
}
const catalog: Array<[Department, string[]]> = [
  [
    'ירקות ופירות',
    [
      'עגבניות',
      'עגבניה',
      'עגבנייה',
      'מלפפונים',
      'מלפפון',
      'בננות',
      'בננה',
      'תפוחים',
      'תפוח',
      'תפוחי אדמה',
      'בצל',
      'שום',
      'גזר',
      'פלפל',
      'פלפלים',
      'חסה',
      'לימון',
      'לימונים',
      'אבוקדו',
      'פטריות',
      'קישואים',
      'תותים',
      'ענבים',
      'פטרוזיליה',
      'כוסברה',
      'בטטה',
      'בטטות',
      'ברוקולי',
    ],
  ],
  [
    'מוצרי חלב וביצים',
    [
      'חלב',
      'גבינה',
      'גבינה לבנה',
      'גבינה צהובה',
      'קוטג׳',
      'קוטג',
      "קוטג'",
      'יוגורט',
      'יוגורטים',
      'חמאה',
      'שמנת',
      'ביצים',
      'ביצה',
      'מעדן',
      'מעדנים',
      'לבנה',
    ],
  ],
  [
    'לחם ומאפים',
    [
      'לחם',
      'לחמניות',
      'לחמניה',
      'לחמנייה',
      'פיתות',
      'פיתה',
      'חלה',
      'חלות',
      'בייגל',
      'טורטיות',
      'קרואסון',
    ],
  ],
  ['בשר ודגים', ['עוף', 'חזה עוף', 'בשר', 'בשר טחון', 'שניצל', 'סלמון', 'דג', 'דגים', 'פרגיות']],
  [
    'מזווה',
    [
      'אורז',
      'פסטה',
      'פתיתים',
      'קוסקוס',
      'קמח',
      'סוכר',
      'מלח',
      'פלפל שחור',
      'שמן',
      'שמן זית',
      'טחינה',
      'טונה',
      'שימורים',
      'קטשופ',
      'מיונז',
      'עדשים',
      'שעועית',
      'חומוס',
      'דבש',
      'ריבה',
      'קורנפלקס',
      'שיבולת שועל',
      'קפה',
      'תה',
      'שוקולד',
      'ביסקוויטים',
      'חטיפים',
      'מלח ופלפל',
    ],
  ],
  ['קפואים', ['אפונה קפואה', 'ירקות קפואים', 'גלידה', 'פיצה קפואה', 'בורקס', 'צ׳יפס', 'ציפס']],
  ['משקאות', ['מים', 'סודה', 'מיץ', 'קולה', 'בירה', 'יין', 'משקה שיבולת שועל', 'חלב שיבולת שועל']],
  [
    'ניקיון וטיפוח',
    [
      'נייר טואלט',
      'נייר סופג',
      'סבון',
      'סבון כלים',
      'שמפו',
      'מרכך',
      'משחת שיניים',
      'שקיות אשפה',
      'אבקת כביסה',
      'נוזל כביסה',
      'מגבונים',
      'חיתולים',
    ],
  ],
];
export const normalize = (name: string) =>
  name
    .normalize('NFKC')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[״"׳']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const catalogMatches = catalog
  .flatMap(([department, names]) => names.map((n) => ({ department, key: normalize(n) })))
  .sort((a, b) => b.key.length - a.key.length);
export function departmentFor(name: string): Department {
  const key = normalize(name);
  if (/קפוא|קפואה|קפואים|קפואות/.test(key)) return 'קפואים';
  return (
    catalogMatches.find((x) => key === x.key || key.startsWith(x.key + ' '))?.department ?? 'אחר'
  );
}
const numbers: Record<string, number> = {
  אחד: 1,
  אחת: 1,
  שני: 2,
  שתי: 2,
  שניים: 2,
  שתיים: 2,
  שלוש: 3,
  שלושה: 3,
  ארבע: 4,
  ארבעה: 4,
  חמש: 5,
  חמישה: 5,
  שש: 6,
  שישה: 6,
  שבע: 7,
  שבעה: 7,
  שמונה: 8,
  תשע: 9,
  תשעה: 9,
  עשר: 10,
  עשרה: 10,
  חצי: 0.5,
  רבע: 0.25,
};
const unitAliases: Record<string, Unit> = {
  קילו: 'ק״ג',
  קילוגרם: 'ק״ג',
  קג: 'ק״ג',
  גרם: 'גרם',
  גרמים: 'גרם',
  ליטר: 'ליטר',
  ליטרים: 'ליטר',
  חבילה: 'חבילה',
  חבילות: 'חבילה',
  קופסה: 'קופסה',
  קופסא: 'קופסה',
  קופסאות: 'קופסה',
  בקבוק: 'בקבוק',
  בקבוקים: 'בקבוק',
  יחידה: 'יח׳',
  יחידות: 'יח׳',
  יח: 'יח׳',
};
const startWords = new Set(catalog.flatMap(([, ns]) => ns.map((n) => normalize(n).split(' ')[0])));
function splitConjunction(segment: string): string[] {
  // Split only recognizable grocery boundaries; keep an unfamiliar phrase intact.
  if (normalize(segment) === 'מלח ופלפל') return [segment];
  const words = segment.split(/\s+/);
  const result: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    const candidate = word.startsWith('ו') ? word.slice(1).replace(/^[-־]/, '') : '';
    if (
      current.length &&
      candidate &&
      (startWords.has(normalize(candidate)) ||
        numbers[candidate] !== undefined ||
        /^\d/.test(candidate))
    ) {
      result.push(current.join(' '));
      current = [candidate];
    } else current.push(word);
  }
  if (current.length) result.push(current.join(' '));
  return result;
}
export function parseGroceries(input: string): { items: ParsedItem[]; warnings: string[] } {
  if (typeof input !== 'string' || !input.trim() || input.length > 2000)
    throw new Error('אפשר להזין עד 2,000 תווים בכל פעם.');
  let text = input
    .trim()
    .replace(
      /^(?:תוסיף|תוסיפי|להוסיף|הוסף|הוסיפי|צריך|צריכים|צריכות|צריכה|לקנות)(?:\s+לי)?\s+/,
      '',
    );
  const segments = text
    .split(/[,;\n]+/)
    .flatMap((s) => splitConjunction(s.trim()))
    .filter(Boolean);
  if (segments.length > 40) throw new Error('אפשר להוסיף עד 40 מוצרים בכל פעם.');
  const items: ParsedItem[] = [];
  const warnings: string[] = [];
  for (let segment of segments) {
    segment = segment.replace(/^(?:תוסיף|תוסיפי|להוסיף|צריך|צריכה)\s+/, '').trim();
    if (/^(?:תמחק|תמחקי|מחק|למחוק|תעדכן|תעדכני|עדכן|אל\s|בלי\s|לא\s)/.test(segment)) {
      warnings.push('לשינוי או למחיקה השתמשו בכפתור העריכה ליד המוצר: ' + segment);
      continue;
    }
    let quantity = 1;
    let explicit = false;
    let unit: Unit = 'יח׳';
    const token = segment.match(
      /^(\d+(?:\.\d+)?|\d+\/\d+|אחד|אחת|שני|שתי|שניים|שתיים|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה|שבע|שבעה|שמונה|תשע|תשעה|עשר|עשרה|חצי|רבע)(?:\s+|[-־]\s*)/,
    );
    if (token) {
      const raw = token[1];
      quantity =
        numbers[raw] ??
        (raw.includes('/') ? Number(raw.split('/')[0]) / Number(raw.split('/')[1]) : Number(raw));
      explicit = true;
      segment = segment.slice(token[0].length).trim();
    }
    const unitMatch = segment.match(/^(\S+)\s+(.+)$/);
    if (unitMatch && unitAliases[normalize(unitMatch[1])]) {
      unit = unitAliases[normalize(unitMatch[1])];
      segment = unitMatch[2].trim();
    }
    const suffix = segment.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
    if (!explicit && suffix) {
      segment = suffix[1].trim();
      quantity = Number(suffix[2]);
      explicit = true;
    }
    const name = segment.replace(/^את\s+/, '').trim();
    if (
      !name ||
      name.length > 100 ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 10000
    ) {
      warnings.push('לא ניתן להוסיף: ' + segment);
      continue;
    }
    items.push({ name, quantity, unit, explicit, department: departmentFor(name) });
  }
  return { items, warnings };
}
