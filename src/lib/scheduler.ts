// Pure scheduling logic for the Sunday reading rota.
// No dependencies, no Node APIs: safe to run inside a Next.js server action.

export type Gender = 'M' | 'F';
export type Role = 'reading1' | 'reading2' | 'prayer';
export interface SchedMember { id: number; gender: Gender; baseCount: number }
export interface WeekAssignment { date: string; reading1: number | null; reading2: number | null; prayer: number | null }
export interface GenerateInput {
  members: SchedMember[];
  history: WeekAssignment[];
  dates: string[];
  seed?: number;
}
export interface GenerateResult {
  weeks: { date: string; reading1: number; reading2: number; prayer: number }[];
  warnings: string[];
  relaxed: { gender: boolean; consecutive: boolean; prayer: boolean };
}
export interface Violation { date: string; kind: 'duplicate' | 'gender' | 'consecutive' | 'fairness' | 'missing' | 'prayer'; message: string; memberIds: number[]; /** chỉ với 'fairness': các bạn còn chờ tới lượt */ waitingIds?: number[] }
export interface MemberStat { id: number; total: number; effective: number; reading1: number; reading2: number; prayer: number; lastDate: string | null }

const ROLES: Role[] = ['reading1', 'reading2', 'prayer'];
const ROLE_LABEL: Record<Role, string> = { reading1: 'Bài đọc 1', reading2: 'Bài đọc 2', prayer: 'Lời nguyện' };

// ---------------------------------------------------------------- helpers

const DAY_MS = 86400000;
function toDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / DAY_MS);
}
function fmt(date: string): string {
  const p = date.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : date;
}
function dayToDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dedupeMembers(members: SchedMember[]): SchedMember[] {
  const seen = new Set<number>();
  const out: SchedMember[] = [];
  for (const m of members || []) {
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({ id: m.id, gender: m.gender, baseCount: Number.isFinite(m.baseCount) ? m.baseCount : 0 });
  }
  return out;
}
// ---------------------------------------------------------------- generator
//
// Fairness = strict waiting queue (LRU). Each active member's lastRead is the date of
// their most recent reading; the queue is never-read first, then oldest lastRead.
// Each date takes the feasible triple whose sorted queue-rank vector is
// lexicographically smallest: the front kid is always taken unless the hard rules
// make it impossible (then they stay at the front for next time). Ties (same
// lastRead) are broken randomly - the main source of randomness between clicks.

interface Mode { genderHard: boolean; consecHard: boolean; prayerHard: boolean }
interface WeekIssues { gender: boolean; consec: boolean; prayer: boolean }
interface Assign { r1: number; r2: number; p: number; viol: number; issues: WeekIssues }

const WINDOW = 7; // a kid may not read at two events whose dates are <= 7 days apart
// Relaxation order, tried per date (fairness is never relaxed): strict -> gender soft ->
// "within 7 days" soft -> both -> everything soft (prayer streak too). The prayer
// rule is kept hard the longest: with the other rules relaxed it can almost always
// be met just by choosing who prays.
const MODES: Mode[] = [
  { genderHard: true, consecHard: true, prayerHard: true },
  { genderHard: false, consecHard: true, prayerHard: true },
  { genderHard: true, consecHard: false, prayerHard: true },
  { genderHard: false, consecHard: false, prayerHard: true },
  { genderHard: false, consecHard: false, prayerHard: false },
];

export function generateSchedule(input: GenerateInput): GenerateResult {
  const relaxed = { gender: false, consecutive: false, prayer: false };
  const warnings: string[] = [];
  try {
    const members = dedupeMembers(input?.members || []);
    const dates = [...new Set((input?.dates || []).filter((d) => typeof d === 'string'))].sort();
    if (dates.length === 0) return { weeks: [], warnings, relaxed };
    if (members.length < 3) {
      warnings.push('Cần ít nhất 3 thành viên đang hoạt động để xếp lịch đọc.');
      return { weeks: [], warnings, relaxed };
    }
    const firstDay = toDay(dates[0]);
    const history = (input.history || [])
      .filter((w) => w && typeof w.date === 'string' && toDay(w.date) < firstDay)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const rng = typeof input.seed === 'number' && Number.isFinite(input.seed) ? mulberry32(input.seed) : Math.random;

    const n = members.length;
    const male = members.map((m) => m.gender === 'M');
    const idx = new Map(members.map((m, i) => [m.id, i] as const));
    const lastDay = members.map(() => -Infinity);
    const role = members.map(() => [0, 0, 0]);
    const seq: number[][] = members.map(() => []); // roles in date order (0=r1, 1=r2, 2=prayer)
    const events: { day: number; who: number[] }[] = [];
    for (const w of history) {
      const d = toDay(w.date);
      const who: number[] = [];
      ROLES.forEach((r, ri) => {
        const id = w[r];
        const i = id == null ? undefined : idx.get(id);
        if (i === undefined) return;
        role[i][ri]++;
        seq[i].push(ri);
        if (d > lastDay[i]) lastDay[i] = d;
        who.push(i);
      });
      events.push({ day: d, who });
    }
    const streak = (x: number) => {
      const q = seq[x];
      return q.length >= 2 && q[q.length - 1] === 2 && q[q.length - 2] === 2;
    };
    const roleCost = (x: number, ri: number) => role[x][ri] - (role[x][0] + role[x][1] + role[x][2]) / 3;

    const hasM = male.some(Boolean);
    const hasF = male.some((x) => !x);
    const genderPossible = hasM && hasF;

    const weeks: GenerateResult['weeks'] = [];
    const issues: WeekIssues[] = [];
    for (const date of dates) {
      const d = toDay(date);
      // Queue: oldest lastRead first, random order within ties.
      const tie = members.map(() => rng());
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => lastDay[a] - lastDay[b] || tie[a] - tie[b]);
      const recent = new Set<number>();
      for (const e of events) if (e.day < d && e.day >= d - WINDOW) for (const x of e.who) recent.add(x);

      /** Best role assignment of a triple under `mode` (null if a hard rule makes it impossible). */
      const assign = (t: number[], mode: Mode): Assign | null => {
        let consecCount = 0;
        for (const x of t) if (recent.has(x)) consecCount++;
        if (mode.consecHard && consecCount) return null;
        const options: Assign[] = [];
        for (let pi = 0; pi < 3; pi++) {
          const p = t[pi];
          const pStreak = streak(p);
          if (mode.prayerHard && pStreak) continue;
          const rs = t.filter((_, q) => q !== pi);
          const mixed = male[rs[0]] !== male[rs[1]];
          if (mode.genderHard && !mixed) continue;
          for (let o = 0; o < 2; o++) {
            const iss = { gender: !mixed, consec: consecCount > 0, prayer: pStreak };
            options.push({ r1: rs[o], r2: rs[1 - o], p, viol: (mixed ? 0 : 1) + consecCount + (pStreak ? 1 : 0), issues: iss });
          }
        }
        if (!options.length) return null;
        const minViol = Math.min(...options.map((a) => a.viol));
        let best: Assign | null = null;
        let bestCost = Infinity;
        for (const a of options) {
          if (a.viol !== minViol) continue;
          // soft role balance (someone with many prayers gets a reading) + randomness
          const cost = roleCost(a.r1, 0) + roleCost(a.r2, 1) + roleCost(a.p, 2) + rng() * 1.5;
          if (cost < bestCost) {
            bestCost = cost;
            best = a;
          }
        }
        return best;
      };

      /** Lexicographically earliest triple (in queue order) with the fewest violations under `mode`. */
      const bestTriple = (mode: Mode): Assign | null => {
        const cand = mode.consecHard ? order.filter((x) => !recent.has(x)) : order;
        const m = cand.length;
        // Violations that no triple can avoid (lets relaxed modes stop at the first optimal triple).
        const bothGenders = cand.some((x) => male[x]) && cand.some((x) => !male[x]);
        if (mode.genderHard && !bothGenders) return null;
        const lb = !mode.genderHard && !bothGenders ? 1 : 0;
        let best: Assign | null = null;
        for (let i = 0; i < m - 2; i++)
          for (let j = i + 1; j < m - 1; j++)
            for (let k = j + 1; k < m; k++) {
              const a = assign([cand[i], cand[j], cand[k]], mode);
              if (!a) continue;
              if (a.viol <= lb) return a; // enumeration order = lexicographic queue order
              if (!best || a.viol < best.viol) best = a;
            }
        return best;
      };

      let pick: Assign | null = null;
      for (const mode of MODES) {
        if (mode.genderHard && !genderPossible) continue;
        pick = bestTriple(mode);
        if (pick) break;
      }
      if (!pick) {
        warnings.push('Không thể tạo lịch tự động. Vui lòng xếp thủ công.');
        return { weeks: [], warnings, relaxed: { gender: false, consecutive: false, prayer: false } };
      }
      const list = [pick.r1, pick.r2, pick.p];
      list.forEach((x, ri) => {
        role[x][ri]++;
        seq[x].push(ri);
        lastDay[x] = d;
      });
      events.push({ day: d, who: list });
      issues.push(pick.issues);
      weeks.push({ date, reading1: members[pick.r1].id, reading2: members[pick.r2].id, prayer: members[pick.p].id });
    }

    // Describe what had to be relaxed.
    const genderWeeks = dates.filter((_, w) => issues[w].gender);
    const consecWeeks = dates.filter((_, w) => issues[w].consec);
    const prayerWeeks = dates.filter((_, w) => issues[w].prayer);
    if (genderWeeks.length) {
      relaxed.gender = true;
      if (!genderPossible) {
        warnings.push(`Nhóm chỉ có bạn ${hasM ? 'nam' : 'nữ'} nên không thể ghép cặp nam/nữ cho Bài đọc 1 & 2.`);
      } else {
        for (const d of genderWeeks) warnings.push(`Không đủ bạn nam/nữ để ghép cặp Bài đọc 1 & 2 ở ngày ${fmt(d)}.`);
      }
    }
    if (consecWeeks.length) {
      relaxed.consecutive = true;
      const reason = members.length < 6
        ? 'Số thành viên quá ít, buộc phải có bạn đọc 2 lần trong vòng 7 ngày'
        : 'Không tìm được cách xếp tránh việc một bạn đọc 2 lần trong vòng 7 ngày';
      warnings.push(`${reason} (ngày ${consecWeeks.map(fmt).join(', ')}).`);
    }
    if (prayerWeeks.length) {
      relaxed.prayer = true;
      warnings.push(`Buộc phải để có bạn đọc Lời nguyện 3 lần liên tiếp (ngày ${prayerWeeks.map(fmt).join(', ')}).`);
    }
    return { weeks, warnings, relaxed };
  } catch {
    warnings.push('Đã xảy ra lỗi khi tạo lịch tự động. Vui lòng thử lại hoặc xếp thủ công.');
    return { weeks: [], warnings, relaxed };
  }
}

// ---------------------------------------------------------------- validation

export function validateSchedule(members: SchedMember[], weeks: WeekAssignment[]): Violation[] {
  const out: Violation[] = [];
  const ms = dedupeMembers(members);
  const byId = new Map(ms.map((m) => [m.id, m] as const));
  const lastRead = new Map<number, number>(); // member id -> day of last reading (absent = never)
  const sorted = (weeks || []).filter((w) => w && typeof w.date === 'string').slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const byDay = new Map<number, Set<number>>();
  for (const w of sorted) {
    const d = toDay(w.date);
    const s = byDay.get(d) || new Set<number>();
    for (const r of ROLES) if (w[r] != null) s.add(w[r] as number);
    byDay.set(d, s);
  }

  const seqs = new Map<number, Role[]>();
  for (const w of sorted) {
    const label = fmt(w.date);
    const missing = ROLES.filter((r) => w[r] == null);
    if (missing.length) {
      out.push({ date: w.date, kind: 'missing', message: `Ngày ${label}: còn thiếu người cho ${missing.map((r) => ROLE_LABEL[r]).join(', ')}.`, memberIds: [] });
    }
    const present = ROLES.map((r) => w[r]).filter((x): x is number => x != null);
    const dups = [...new Set(present.filter((x, i) => present.indexOf(x) !== i))];
    if (dups.length) {
      out.push({ date: w.date, kind: 'duplicate', message: `Ngày ${label}: một bạn được xếp nhiều vai trong cùng ngày.`, memberIds: dups });
    }
    if (w.reading1 != null && w.reading2 != null && w.reading1 !== w.reading2) {
      const a = byId.get(w.reading1);
      const b = byId.get(w.reading2);
      if (a && b && a.gender === b.gender) {
        out.push({ date: w.date, kind: 'gender', message: `Ngày ${label}: Bài đọc 1 & 2 nên là một bạn nam và một bạn nữ (đang là 2 bạn ${a.gender === 'M' ? 'nam' : 'nữ'}).`, memberIds: [a.id, b.id] });
      }
    }
    // Consecutive: same kid at another (earlier) event within 7 days.
    const day = toDay(w.date);
    for (let k = WINDOW; k >= 1; k--) {
      const prev = byDay.get(day - k);
      if (!prev) continue;
      const rep = [...new Set(present)].filter((x) => prev.has(x));
      if (!rep.length) continue;
      const prevLabel = fmt(dayToDate(day - k));
      const message = k === 7
        ? `Ngày ${label}: có bạn đọc 2 tuần liền (${prevLabel} và ${label}).`
        : `Ngày ${label}: có bạn đọc 2 lần trong vòng 7 ngày (${prevLabel} và ${label}).`;
      out.push({ date: w.date, kind: 'consecutive', message, memberIds: rep });
    }
    // Fairness (waiting queue): picked X is unfair if an unpicked member Y has waited
    // strictly longer (older lastRead, or never read while X has) and Y could legally
    // take X's role this week (gender pair, within-7-days, prayer streak).
    {
      const older = (y: number, x: number) => (lastRead.get(y) ?? -Infinity) < (lastRead.get(x) ?? -Infinity);
      const nearOther = (y: number) => {
        for (let k = 1; k <= WINDOW; k++) if (byDay.get(day - k)?.has(y) || byDay.get(day + k)?.has(y)) return true;
        return false;
      };
      const prayerStreak = (y: number) => {
        const q = seqs.get(y) || [];
        return q.length >= 2 && q[q.length - 1] === 'prayer' && q[q.length - 2] === 'prayer';
      };
      const offenders: number[] = [];
      const waiting = new Set<number>();
      for (const r of ROLES) {
        const x = w[r];
        if (x == null || !byId.has(x)) continue;
        const other = r === 'reading1' ? w.reading2 : r === 'reading2' ? w.reading1 : null;
        const otherM = other == null ? undefined : byId.get(other);
        const ys = ms.filter((m) => {
          const y = m.id;
          if (present.includes(y) || !older(y, x) || nearOther(y)) return false;
          if (r === 'prayer') return !prayerStreak(y);
          return !otherM || otherM.gender !== m.gender;
        });
        if (ys.length) {
          if (!offenders.includes(x)) offenders.push(x);
          for (const y of ys) waiting.add(y.id);
        }
      }
      if (offenders.length) {
        const ws = [...waiting];
        out.push({
          date: w.date,
          kind: 'fairness',
          message: `Ngày ${label}: có bạn đọc trước trong khi bạn khác chờ lâu hơn.`,
          memberIds: [...offenders, ...ws],
          waitingIds: ws,
        });
      }
    }
    // Prayer streak: a kid's own assignments, in date order.
    ROLES.forEach((r) => {
      const x = w[r];
      if (x == null || !byId.has(x)) return;
      const q = seqs.get(x) || [];
      if (r === 'prayer' && q.length >= 2 && q[q.length - 1] === 'prayer' && q[q.length - 2] === 'prayer') {
        out.push({ date: w.date, kind: 'prayer', message: `Ngày ${label}: có bạn đọc Lời nguyện 3 lần liên tiếp.`, memberIds: [x] });
      }
      q.push(r);
      seqs.set(x, q);
    });
    for (const x of present) if (byId.has(x)) lastRead.set(x, day);
  }
  return out;
}

// ---------------------------------------------------------------- stats

export function computeStats(members: SchedMember[], weeks: WeekAssignment[]): MemberStat[] {
  const ms = dedupeMembers(members);
  const pos = new Map(ms.map((m, i) => [m.id, i] as const));
  const stats: MemberStat[] = ms.map((m) => ({ id: m.id, total: 0, effective: 0, reading1: 0, reading2: 0, prayer: 0, lastDate: null }));
  for (const w of weeks || []) {
    if (!w || typeof w.date !== 'string') continue;
    for (const r of ROLES) {
      const id = w[r];
      if (id == null) continue;
      const i = pos.get(id);
      if (i === undefined) continue;
      const s = stats[i];
      s[r]++;
      s.total++;
      if (s.lastDate === null || w.date > s.lastDate) s.lastDate = w.date;
    }
  }
  // effective = queue rank: how many members have waited strictly longer (never-read = longest). 0 = front.
  const key = (s: MemberStat) => s.lastDate ?? '';
  for (const s of stats) s.effective = stats.filter((o) => key(o) < key(s)).length;
  return stats;
}
