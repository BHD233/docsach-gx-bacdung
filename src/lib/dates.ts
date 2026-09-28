// Tiện ích ngày tháng — dùng chuỗi 'YYYY-MM-DD' và giờ Việt Nam.

export const VN_TZ = "Asia/Ho_Chi_Minh";

export function todayVN(): string {
  // en-CA cho định dạng YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = parseISO(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISO(x);
}

/** Chúa Nhật gần nhất tính từ ngày d trở đi (nếu d là CN thì trả về d). */
export function upcomingSunday(d: string): string {
  const dow = parseISO(d).getUTCDay();
  return addDays(d, dow === 0 ? 0 : 7 - dow);
}

/** Năm học bắt đầu 1/9: tháng 9/2026 → 2026, tháng 3/2027 → 2026. */
export function schoolYearOf(d: string): number {
  const [y, m] = d.split("-").map(Number);
  return m >= 9 ? y : y - 1;
}

export function formatDM(d: string): string {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export function formatDMY(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function monthKey(d: string): string {
  return d.slice(0, 7);
}

export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function isValidYM(ym: string | undefined): ym is string {
  return !!ym && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `Tháng ${m} năm ${y}`;
}

export function isSunday(d: string): boolean {
  return parseISO(d).getUTCDay() === 0;
}

const WEEKDAYS = ["Chúa Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export function weekdayVN(d: string): string {
  return WEEKDAYS[parseISO(d).getUTCDay()];
}

export function lastDayOfMonth(ym: string): string {
  return addDays(`${shiftMonth(ym, 1)}-01`, -1);
}
