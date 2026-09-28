// Vietnamese Catholic Sunday titles (General Roman Calendar + Vietnam customs).
// Pure date math on UTC day numbers; no dependencies.

const DAY_MS = 86400000;

/** Days since 1970-01-01 (UTC) for a civil date. */
function dayNum(y: number, m: number, d: number): number {
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function parse(date: string): { y: number; m: number; d: number; n: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return { y, m, d, n: dayNum(y, m, d) };
}

function weekday(n: number): number {
  // 1970-01-01 was a Thursday (4). 0 = Sunday.
  return (((n + 4) % 7) + 7) % 7;
}

function fmt(n: number): string {
  const dt = new Date(n * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Easter Sunday day number (anonymous Gregorian / Meeus-Jones-Butcher). */
export function easterDayNum(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayNum(year, month, day);
}

export function getEaster(year: number): string {
  return fmt(easterDayNum(year));
}

/** First Sunday of Advent in civil year `year` (Sunday between Nov 27 and Dec 3). */
function adventIDayNum(year: number): number {
  const xmas = dayNum(year, 12, 25);
  const wd = weekday(xmas);
  const adventIV = xmas - (wd === 0 ? 7 : wd);
  return adventIV - 21;
}

export function getAdventStart(year: number): string {
  return fmt(adventIDayNum(year));
}

function toRoman(num: number): string {
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let rest = num;
  for (const [v, s] of table) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

export function getLiturgicalYearLetter(date: string): 'A' | 'B' | 'C' {
  const { y, n } = parse(date);
  const litYear = n >= adventIDayNum(y) ? y + 1 : y;
  const r = litYear % 3;
  return r === 1 ? 'A' : r === 2 ? 'B' : 'C';
}

// Fixed-date celebrations that replace an Ordinary Time Sunday.
const FIXED_FEASTS: Record<string, string> = {
  '02-02': 'LỄ DÂNG CHÚA GIÊSU TRONG ĐỀN THÁNH',
  '06-24': 'LỄ SINH NHẬT THÁNH GIOAN TẨY GIẢ',
  '06-29': 'LỄ THÁNH PHÊRÔ VÀ PHAOLÔ TÔNG ĐỒ',
  '08-06': 'LỄ CHÚA HIỂN DUNG',
  '08-15': 'LỄ ĐỨC MẸ LÊN TRỜI',
  '09-14': 'LỄ SUY TÔN THÁNH GIÁ',
  '11-01': 'LỄ CÁC THÁNH NAM NỮ',
  '11-02': 'LỄ CẦU CHO CÁC TÍN HỮU ĐÃ QUA ĐỜI',
  '11-09': 'LỄ CUNG HIẾN THÁNH ĐƯỜNG LATERANÔ',
  '11-24': 'LỄ CÁC THÁNH TỬ ĐẠO VIỆT NAM',
};

/**
 * Title of the Sunday `date` (YYYY-MM-DD). Callers are expected to pass Sundays.
 * Suffix " NĂM X" is added for celebrations using the Sunday reading cycle;
 * fixed-date feasts, Christmas, Mary Mother of God, Epiphany and Easter Sunday omit it.
 */
export function getSundayTitle(date: string): string {
  const { y, m, d, n } = parse(date);
  const suffix = ` NĂM ${getLiturgicalYearLetter(date)}`;
  const advent = adventIDayNum(y);

  // --- Advent & Christmas (end of civil year, new liturgical year) ---
  if (n >= advent) {
    const xmas = dayNum(y, 12, 25);
    if (n < xmas) {
      const week = Math.floor((n - advent) / 7) + 1;
      return `CHÚA NHẬT ${toRoman(week)} MÙA VỌNG${suffix}`;
    }
    if (n === xmas) return 'LỄ CHÚA GIÁNG SINH';
    return `LỄ THÁNH GIA THẤT${suffix}`; // Sunday Dec 26-31
  }

  // --- Christmas season (start of civil year) ---
  if (m === 1 && d === 1) return 'LỄ ĐỨC MARIA MẸ THIÊN CHÚA';
  const jan2 = dayNum(y, 1, 2);
  const epiphany = jan2 + ((7 - weekday(jan2)) % 7); // Sunday Jan 2-8
  const epiphanyDay = epiphany - dayNum(y, 1, 1) + 1;
  if (n < epiphany) {
    // Not reachable for Sundays (Jan 1 handled above); fall back sensibly.
    return 'LỄ ĐỨC MARIA MẸ THIÊN CHÚA';
  }
  if (n === epiphany) return 'LỄ CHÚA HIỂN LINH';
  const baptismOnSunday = epiphanyDay <= 6;
  if (baptismOnSunday && n === epiphany + 7) {
    return `LỄ CHÚA GIÊSU CHỊU PHÉP RỬA${suffix}`;
  }
  const otII = baptismOnSunday ? epiphany + 14 : epiphany + 7;

  const easter = easterDayNum(y);
  const lentI = easter - 42;
  const pentecost = easter + 49;
  const christKing = advent - 7;

  const fixed = FIXED_FEASTS[`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`];

  // --- Ordinary Time before Lent ---
  if (n < lentI) {
    if (fixed) return fixed;
    const week = 2 + Math.floor((n - otII) / 7);
    return `CHÚA NHẬT ${toRoman(week)} THƯỜNG NIÊN${suffix}`;
  }

  // --- Lent ---
  if (n < easter - 7) {
    const week = Math.floor((n - lentI) / 7) + 1;
    return `CHÚA NHẬT ${toRoman(week)} MÙA CHAY${suffix}`;
  }
  if (n < easter) return `CHÚA NHẬT LỄ LÁ${suffix}`;

  // --- Easter season ---
  if (n === easter) return 'CHÚA NHẬT PHỤC SINH';
  if (n < pentecost) {
    const week = Math.floor((n - easter) / 7) + 1;
    if (week === 2) return `CHÚA NHẬT II PHỤC SINH - LÒNG CHÚA THƯƠNG XÓT${suffix}`;
    if (week === 7) return `LỄ CHÚA THĂNG THIÊN${suffix}`;
    return `CHÚA NHẬT ${toRoman(week)} PHỤC SINH${suffix}`;
  }
  if (n < pentecost + 7) return `LỄ CHÚA THÁNH THẦN HIỆN XUỐNG${suffix}`;
  if (n < pentecost + 14) return `LỄ CHÚA BA NGÔI${suffix}`;
  if (n < pentecost + 21) return `LỄ MÌNH MÁU THÁNH CHÚA KITÔ${suffix}`;

  // --- Ordinary Time after Pentecost ---
  if (n >= christKing) return `LỄ CHÚA GIÊSU KITÔ VUA VŨ TRỤ${suffix}`;
  if (fixed) return fixed;
  const week = 34 - Math.ceil((christKing - n) / 7);
  return `CHÚA NHẬT ${toRoman(week)} THƯỜNG NIÊN${suffix}`;
}

export function getSundaysInRange(start: string, endInclusive: string): string[] {
  const s = parse(start).n;
  const e = parse(endInclusive).n;
  const out: string[] = [];
  for (let n = s + ((7 - weekday(s)) % 7); n <= e; n += 7) out.push(fmt(n));
  return out;
}

export function getSundaysOfMonths(year: number, month: number, count: number): string[] {
  if (count <= 0) return [];
  const startN = dayNum(year, month, 1);
  // Day 0 of the month after the last requested month = last day of the range.
  const endN = Math.round(Date.UTC(year, month - 1 + count, 0) / DAY_MS);
  return getSundaysInRange(fmt(startN), fmt(endN));
}
