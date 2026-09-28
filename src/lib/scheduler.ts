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
/**
 * Fairness = chronological rounds. `S` holds the members who already read in the
 * current round; the round completes when everyone is in S. Readings within one
 * entry are simultaneous: newcomers are added first; if that completes the round,
 * a new round starts and this entry's repeaters (already in the old S) seed it.
 * Returns true when a round completed. `readers` must be unique members.
 */
function roundStep<T>(S: Set<T>, readers: T[], memberCount: number): boolean {
  const repeaters = readers.filter((x) => S.has(x));
  for (const x of readers) S.add(x);
  if (S.size < memberCount) return false;
  S.clear();
  for (const x of repeaters) S.add(x);
  return true;
}
function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

// ---------------------------------------------------------------- generator

interface Pick { r1: number; r2: number; p: number } // member indices
interface Mode { genderHard: boolean; consecHard: boolean; prayerHard: boolean }
interface WeekIssues { gender: boolean; consec: boolean; prayer: boolean }

const COMBO_LIMIT = 150; // triples examined per node
const BRANCH = 10; // candidates kept per node
const PENALTY = 1000; // soft-constraint penalty in relaxed modes
const MAX_LOOKAHEAD = 4;
const LRU_W = 8; // weight of the "least recently read first" preference
const WINDOW = 7; // a kid may not read at two events whose dates are <= 7 days apart

class Solver {
  n: number;
  W: number;
  ids: number[];
  male: boolean[];
  inS: Set<number>; // current-round readers (member indices)
  lastDay: number[]; // day number of each member's last reading (-Infinity = never)
  sLog: Set<number>[];
  lastLog: number[][];
  role: number[][];
  pair: Int32Array;
  days: number[];
  histByDay = new Map<number, number[]>();
  sol: (Pick | null)[];
  rng: () => number;
  nodes = 0;
  budget = 0;
  aborted = false;
  truncated = false;
  deadline = Infinity;
  realW: number;
  mode: Mode = { genderHard: true, consecHard: true, prayerHard: true };
  seq: number[][]; // per member: roles of their assignments in date order (0=r1, 1=r2, 2=prayer)
  prayerViol: boolean[];
  minorityMale = false;
  scarcityW = 0;

  constructor(members: SchedMember[], history: WeekAssignment[], dates: string[], rng: () => number) {
    this.rng = rng;
    this.n = members.length;
    this.W = dates.length;
    this.ids = members.map((m) => m.id);
    this.male = members.map((m) => m.gender === 'M');
    this.inS = new Set();
    this.lastDay = members.map(() => -Infinity);
    this.role = members.map(() => [0, 0, 0]);
    this.pair = new Int32Array(this.n * this.n);
    // When one gender is scarce, every week needs one of them as a reader, so
    // "wasting" a second scarce kid in the same week (e.g. on prayer) is discouraged.
    const nM = this.male.filter(Boolean).length;
    const nMin = Math.min(nM, this.n - nM);
    this.minorityMale = nM <= this.n - nM;
    const r = nMin / this.n;
    this.scarcityW = nMin > 0 && r < 0.45 ? (0.5 - r) * 25 + 20 : 0;
    this.realW = dates.length;
    // Real dates followed by virtual look-ahead Sundays (used to avoid ending a
    // period in a state from which the next period cannot be scheduled strictly).
    this.days = dates.map(toDay);
    const last = this.days[this.days.length - 1];
    for (let i = 1; i <= MAX_LOOKAHEAD; i++) this.days.push(last + 7 * i);
    this.sol = new Array(this.days.length).fill(null);
    this.prayerViol = new Array(this.days.length).fill(false);
    this.seq = members.map(() => []);
    this.sLog = this.days.map(() => new Set());
    this.lastLog = this.days.map(() => []);
    history = history.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const idx = new Map<number, number>();
    members.forEach((m, i) => idx.set(m.id, i));
    for (const w of history) {
      const got: number[] = [];
      ROLES.forEach((r, ri) => {
        const id = w[r];
        if (id == null) return;
        const i = idx.get(id);
        if (i === undefined) return;
        this.role[i][ri]++;
        this.seq[i].push(ri);
        got.push(i);
      });
      const uniq = [...new Set(got)];
      roundStep(this.inS, uniq, this.n);
      const hd = toDay(w.date);
      for (const x of uniq) if (hd > this.lastDay[x]) this.lastDay[x] = hd;
      for (let a = 0; a < uniq.length; a++)
        for (let b = a + 1; b < uniq.length; b++) this.pair[this.pk(uniq[a], uniq[b])]++;
      const d = toDay(w.date);
      const prev = this.histByDay.get(d) || [];
      this.histByDay.set(d, [...new Set([...prev, ...uniq])]);
    }
  }

  pk(a: number, b: number): number {
    return a < b ? a * this.n + b : b * this.n + a;
  }

  /** Members who read at any event within WINDOW days before event w. */
  prevSet(w: number): Set<number> {
    const d = this.days[w];
    const out = new Set<number>();
    for (let j = w - 1; j >= 0 && this.days[j] >= d - WINDOW; j--) {
      const s = this.sol[j];
      if (s && this.days[j] < d) {
        out.add(s.r1);
        out.add(s.r2);
        out.add(s.p);
      }
    }
    for (let k = 1; k <= WINDOW; k++) for (const x of this.histByDay.get(d - k) || []) out.add(x);
    return out;
  }

  /** True if member x's last two assignments were both prayer. */
  prayerStreak(x: number): boolean {
    const q = this.seq[x];
    return q.length >= 2 && q[q.length - 1] === 2 && q[q.length - 2] === 2;
  }

  apply(w: number, s: Pick, sign: 1 | -1) {
    const list = [s.r1, s.r2, s.p];
    if (sign === 1) {
      this.prayerViol[w] = this.prayerStreak(s.p);
      this.sLog[w] = new Set(this.inS);
      this.lastLog[w] = list.map((x) => this.lastDay[x]);
      roundStep(this.inS, list, this.n);
      for (const x of list) this.lastDay[x] = this.days[w];
    } else {
      this.inS = this.sLog[w];
      list.forEach((x, t) => (this.lastDay[x] = this.lastLog[w][t]));
    }
    list.forEach((x, ri) => {
      this.role[x][ri] += sign;
      if (sign === 1) this.seq[x].push(ri);
      else this.seq[x].pop();
    });
    this.pair[this.pk(s.r1, s.r2)] += sign;
    this.pair[this.pk(s.r1, s.p)] += sign;
    this.pair[this.pk(s.r2, s.p)] += sign;
    this.sol[w] = sign === 1 ? s : null;
  }

  roleCost(x: number, ri: number): number {
    const r = this.role[x];
    return r[ri] - (r[0] + r[1] + r[2]) / 3;
  }

  candidates(w: number): Pick[] {
    const { n, rng } = this;
    // Fairness (rounds): kids not yet read this round are due and go first. With
    // fewer than 3 due, all of them are forced and the rest come from the next round.
    const due: number[] = [];
    const rest: number[] = [];
    for (let i = 0; i < n; i++) (this.inS.has(i) ? rest : due).push(i);
    let forced: number[];
    let partial: number[];
    let k: number;
    if (due.length >= 3) {
      forced = [];
      partial = due;
      k = 3;
    } else {
      forced = due;
      partial = rest;
      k = 3 - due.length;
    }
    const prev = this.prevSet(w);
    if (this.mode.consecHard) {
      if (forced.some((x) => prev.has(x))) return [];
      partial = partial.filter((x) => !prev.has(x));
      if (partial.length < k) return [];
    }
    // LRU preference inside the pool: never-read first, then oldest last reading.
    const lruRank = new Map<number, number>();
    {
      const byAge = partial.slice().sort((a, b) => this.lastDay[a] - this.lastDay[b] || rng() - 0.5);
      const denom = Math.max(1, byAge.length - 1);
      byAge.forEach((x, r) => lruRank.set(x, r / denom));
    }

    // Build k-combinations of the partial pool (enumerate or sample).
    const combos: number[][] = [];
    const total = binom(partial.length, k);
    if (k === 0) combos.push([]);
    else if (total <= COMBO_LIMIT) {
      const rec = (start: number, acc: number[]) => {
        if (acc.length === k) {
          combos.push(acc.slice());
          return;
        }
        for (let t = start; t < partial.length; t++) {
          acc.push(partial[t]);
          rec(t + 1, acc);
          acc.pop();
        }
      };
      rec(0, []);
    } else {
      // Stratified sampling by gender composition (a boys + k-a girls) so that
      // scarce-gender kids are not drowned out by random sampling.
      const ms = partial.filter((x) => this.male[x]);
      const fs = partial.filter((x) => !this.male[x]);
      const fM = forced.filter((x) => this.male[x]).length;
      const fF = forced.length - fM;
      const comps: number[] = [];
      for (let a = 0; a <= k; a++) {
        if (a > ms.length || k - a > fs.length) continue;
        if (this.mode.genderHard && (fM + a === 0 || fF + k - a === 0)) continue;
        comps.push(a);
      }
      const seen = new Set<string>();
      const sample = (pool: number[], cnt: number): number[] => {
        for (let t = 0; t < cnt; t++) {
          const r = t + Math.floor(rng() * (pool.length - t));
          const tmp = pool[t];
          pool[t] = pool[r];
          pool[r] = tmp;
        }
        return pool.slice(0, cnt);
      };
      const per = Math.ceil(COMBO_LIMIT / Math.max(1, comps.length));
      for (const a of comps) {
        const size = binom(ms.length, a) * binom(fs.length, k - a);
        const want = Math.min(per, size);
        let got = 0;
        for (let tries = 0; got < want && tries < want * 3; tries++) {
          const c = sample(ms, a).concat(sample(fs, k - a)).sort((x, y) => x - y);
          const key = c.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          combos.push(c);
          got++;
        }
      }
    }

    const out: { pick: Pick; cost: number }[] = [];
    for (const c of combos) {
      const t = forced.concat(c);
      const [a, b, d] = t;
      const pairCost = 2 * (this.pair[this.pk(a, b)] + this.pair[this.pk(a, d)] + this.pair[this.pk(b, d)]);
      let consecPen = 0;
      for (const x of c) consecPen += LRU_W * lruRank.get(x)!;
      if (this.scarcityW) {
        let minor = 0;
        for (const x of t) if (this.male[x] === this.minorityMale) minor++;
        if (minor > 1) consecPen += this.scarcityW * (minor - 1);
      }
      if (!this.mode.consecHard) for (const x of t) if (prev.has(x)) consecPen += PENALTY;
      let best: Pick | null = null;
      let bestCost = Infinity;
      for (let pi = 0; pi < 3; pi++) {
        const p = t[pi];
        const rs = t.filter((_, q) => q !== pi);
        const mixed = this.male[rs[0]] !== this.male[rs[1]];
        if (this.mode.genderHard && !mixed) {
          continue;
        }
        const streak = this.prayerStreak(p);
        if (this.mode.prayerHard && streak) continue;
        const q = this.seq[p];
        const prayerCost = (streak ? PENALTY : 0) + (q.length && q[q.length - 1] === 2 ? 1.5 : 0);
        for (let o = 0; o < 2; o++) {
          const r1 = rs[o];
          const r2 = rs[1 - o];
          const cost =
            this.roleCost(r1, 0) + this.roleCost(r2, 1) + this.roleCost(p, 2) +
            (mixed ? 0 : PENALTY) + prayerCost + rng() * 1.5;
          if (cost < bestCost) {
            bestCost = cost;
            best = { r1, r2, p };
          }
        }
      }
      if (best) out.push({ pick: best, cost: bestCost + pairCost + consecPen + rng() * 2 });
    }
    out.sort((x, y) => x.cost - y.cost);
    if (out.length > BRANCH || combos.length < total) this.truncated = true;
    return out.slice(0, BRANCH).map((x) => x.pick);
  }

  dfs(w: number): boolean {
    if (w === this.W) return true;
    if (++this.nodes > this.budget || ((this.nodes & 63) === 0 && Date.now() > this.deadline)) {
      this.aborted = true;
      return false;
    }
    for (const c of this.candidates(w)) {
      this.apply(w, c, 1);
      if (this.dfs(w + 1)) return true;
      this.apply(w, c, -1);
      if (this.aborted) return false;
    }
    return false;
  }

  /** Soft-constraint issues of the real (non look-ahead) weeks; call while the solution is applied. */
  issues(): WeekIssues[] {
    const out: WeekIssues[] = [];
    for (let w = 0; w < this.realW; w++) {
      const p = this.sol[w]!;
      const prev = this.prevSet(w);
      out.push({
        gender: this.male[p.r1] === this.male[p.r2],
        consec: [p.r1, p.r2, p.p].some((x) => prev.has(x)),
        prayer: this.prayerViol[w],
      });
    }
    return out;
  }

  /** Run `restarts` randomized DFS attempts; returns best solution (fewest soft violations) or null. */
  run(mode: Mode, budget: number, restarts: number, stopAtFirst: boolean, lookahead = 0, deadline = Infinity): { sol: Pick[]; issues: WeekIssues[] } | null {
    this.mode = mode;
    this.deadline = deadline;
    this.W = this.realW + Math.min(lookahead, MAX_LOOKAHEAD);
    let best: { sol: Pick[]; issues: WeekIssues[] } | null = null;
    let bestPen = Infinity;
    for (let r = 0; r < restarts; r++) {
      this.nodes = 0;
      this.aborted = false;
      this.truncated = false;
      this.budget = budget;
      if (this.dfs(0)) {
        const full = this.sol.slice(0, this.W) as Pick[];
        const issues = this.issues();
        const pen = issues.reduce((a, i) => a + (i.gender ? 1 : 0) + (i.consec ? 1 : 0) + (i.prayer ? 1 : 0), 0);
        if (pen < bestPen) {
          bestPen = pen;
          best = { sol: full.slice(0, this.realW), issues };
        }
        for (let w = this.W - 1; w >= 0; w--) this.apply(w, full[w], -1);
        if (stopAtFirst || pen === 0 || Date.now() > deadline) break;
      } else if (!this.aborted && !this.truncated) {
        break; // complete search space exhausted: no solution in this mode
      }
    }
    return best;
  }
}

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
    const history = (input.history || []).filter((w) => w && typeof w.date === 'string' && toDay(w.date) < firstDay);
    const t0 = Date.now();
    const rng = typeof input.seed === 'number' && Number.isFinite(input.seed) ? mulberry32(input.seed) : Math.random;
    const solver = new Solver(members, history, dates, rng);

    const hasM = members.some((m) => m.gender === 'M');
    const hasF = members.some((m) => m.gender === 'F');
    const genderPossible = hasM && hasF;

    // Relaxation order (fairness is never relaxed):
    //   strict -> gender soft -> "within 7 days" soft -> both soft -> everything soft (prayer streak too).
    // The prayer-streak rule is kept hard the longest because with the other rules
    // relaxed it can almost always be met just by choosing who prays.
    let res: { sol: Pick[]; issues: WeekIssues[] } | null = null;
    if (genderPossible) {
      const strict = { genderHard: true, consecHard: true, prayerHard: true };
      const la = Math.min(MAX_LOOKAHEAD, Math.ceil(members.length / 3));
      res = solver.run(strict, 6000, 4, true, la, t0 + 350);
      if (!res) res = solver.run(strict, 6000, 3, true, 1, t0 + 450);
      if (!res) res = solver.run(strict, 6000, 3, true, 0, t0 + 550);
    }
    if (!res) res = solver.run({ genderHard: false, consecHard: true, prayerHard: true }, 4000, 8, false, 0, t0 + 650);
    if (!res && genderPossible) res = solver.run({ genderHard: true, consecHard: false, prayerHard: true }, 4000, 8, false, 0, t0 + 750);
    if (!res) res = solver.run({ genderHard: false, consecHard: false, prayerHard: true }, 4000, 8, false, 0, t0 + 850);
    // Fairness-only search always succeeds on its first descent (no hard constraint can fail).
    if (!res) res = solver.run({ genderHard: false, consecHard: false, prayerHard: false }, 4000, 8, false, 0, t0 + 950);
    if (!res) {
      warnings.push('Không thể tạo lịch tự động. Vui lòng xếp thủ công.');
      return { weeks: [], warnings, relaxed };
    }
    const { sol, issues } = res;

    const weeks = sol.map((p, w) => ({
      date: dates[w],
      reading1: solver.ids[p.r1],
      reading2: solver.ids[p.r2],
      prayer: solver.ids[p.p],
    }));

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
  const S = new Set<number>(); // member ids who already read in the current round (see roundStep)
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
    // Fairness (rounds): unfair iff someone who already read this round is picked
    // while some member who is still due this round is not.
    const picked = [...new Set(present.filter((x) => byId.has(x)))];
    const repeaters = picked.filter((x) => S.has(x));
    if (repeaters.length) {
      const waiting = ms.filter((m) => !S.has(m.id) && !picked.includes(m.id)).map((m) => m.id);
      if (waiting.length) {
        out.push({
          date: w.date,
          kind: 'fairness',
          message: `Ngày ${label}: chưa công bằng — có bạn đọc lần nữa trong khi còn bạn chưa được đọc vòng này.`,
          memberIds: [...repeaters, ...waiting],
          waitingIds: waiting,
        });
      }
    }
    roundStep(S, picked, ms.length);
  }
  return out;
}

// ---------------------------------------------------------------- stats

export function computeStats(members: SchedMember[], weeks: WeekAssignment[]): MemberStat[] {
  const ms = dedupeMembers(members);
  const pos = new Map(ms.map((m, i) => [m.id, i] as const));
  const stats: MemberStat[] = ms.map((m) => ({ id: m.id, total: 0, effective: 0, reading1: 0, reading2: 0, prayer: 0, lastDate: null }));
  // effective = completed rounds + (already read in the current round ? 1 : 0)
  const S = new Set<number>();
  let rounds = 0;
  const sorted = (weeks || []).filter((w) => w && typeof w.date === 'string').slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const w of sorted) {
    const picked: number[] = [];
    for (const r of ROLES) {
      const id = w[r];
      if (id == null) continue;
      const i = pos.get(id);
      if (i === undefined) continue;
      const s = stats[i];
      s[r]++;
      s.total++;
      if (!picked.includes(id)) picked.push(id);
      if (s.lastDate === null || w.date > s.lastDate) s.lastDate = w.date;
    }
    if (roundStep(S, picked, ms.length)) rounds++;
  }
  for (const s of stats) s.effective = rounds + (S.has(s.id) ? 1 : 0);
  return stats;
}
