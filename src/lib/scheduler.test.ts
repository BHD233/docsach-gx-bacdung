import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSchedule,
  validateSchedule,
  computeStats,
  type SchedMember,
  type WeekAssignment,
  type GenerateResult,
} from './scheduler';

function makeMembers(nM: number, nF: number, startId = 1, baseCount = 0): SchedMember[] {
  const out: SchedMember[] = [];
  let id = startId;
  for (let i = 0; i < nM; i++) out.push({ id: id++, gender: 'M', baseCount });
  for (let i = 0; i < nF; i++) out.push({ id: id++, gender: 'F', baseCount });
  return out;
}

function sundays(start: string, n: number): string[] {
  const [y, m, d] = start.split('-').map(Number);
  const t0 = Date.UTC(y, m - 1, d);
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 7 * 86400000).toISOString().slice(0, 10));
}

/** Spread of RAW fairness counts (baseCount + real reads), i.e. without the lift. */
function spread(members: SchedMember[], weeks: WeekAssignment[]): number {
  const base = new Map(members.map((m) => [m.id, m.baseCount]));
  const eff = computeStats(members, weeks).map((s) => s.total + base.get(s.id)!);
  return Math.max(...eff) - Math.min(...eff);
}

/** Fairness invariant after every week of the timeline. */
function assertInvariantEachWeek(members: SchedMember[], weeks: WeekAssignment[]) {
  const sorted = weeks.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i <= sorted.length; i++) {
    assert.ok(spread(members, sorted.slice(0, i)) <= 1, `fairness broken after ${sorted[i - 1].date}`);
  }
}

function assertStrict(res: GenerateResult, members: SchedMember[], history: WeekAssignment[], n: number) {
  assert.equal(res.weeks.length, n);
  assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false });
  assert.deepEqual(res.warnings, []);
  assert.deepEqual(validateSchedule(members, [...history, ...res.weeks]), []);
}

test('20 kids (10M/10F), 9 weeks, no history: all hard rules hold', () => {
  const members = makeMembers(10, 10);
  const dates = sundays('2026-10-04', 9);
  const res = generateSchedule({ members, history: [], dates, seed: 1 });
  assertStrict(res, members, [], 9);
  assert.deepEqual(res.weeks.map((w) => w.date), dates);
  assertInvariantEachWeek(members, res.weeks);
  // 27 readings over 20 kids -> everybody read at least once
  assert.ok(computeStats(members, res.weeks).every((s) => s.total >= 1));
});

test('20 kids with existing history: strict and continues fairly (no consecutive at boundary)', () => {
  const members = makeMembers(10, 10);
  const first = generateSchedule({ members, history: [], dates: sundays('2026-08-02', 9), seed: 7 });
  const history = first.weeks;
  const res = generateSchedule({ members, history, dates: sundays('2026-10-04', 9), seed: 8 });
  assertStrict(res, members, history, 9);
  assertInvariantEachWeek(members, [...history, ...res.weeks]);
  const last = history[history.length - 1];
  const lastSet = new Set([last.reading1, last.reading2, last.prayer]);
  const w0 = res.weeks[0];
  assert.ok(![w0.reading1, w0.reading2, w0.prayer].some((x) => lastSet.has(x)));
});

test('12 consecutive 2-month periods fed back as history keep every rule', () => {
  const members = makeMembers(10, 10);
  let history: WeekAssignment[] = [];
  let start = '2026-01-04';
  for (let period = 0; period < 12; period++) {
    const dates = sundays(start, 9);
    const res = generateSchedule({ members, history, dates, seed: 100 + period });
    assertStrict(res, members, history, 9);
    history = [...history, ...res.weeks];
    start = sundays(dates[8], 2)[1];
  }
  assertInvariantEachWeek(members, history);
  // role balance: no one should be stuck in one role
  for (const s of computeStats(members, history)) {
    assert.ok(s.prayer <= s.total - 2 || s.total < 4, `member ${s.id} unbalanced roles ${JSON.stringify(s)}`);
  }
});

test('repeated periods also work without seed (Math.random)', () => {
  const members = makeMembers(6, 9);
  let history: WeekAssignment[] = [];
  let start = '2026-01-04';
  for (let period = 0; period < 6; period++) {
    const dates = sundays(start, 9);
    const res = generateSchedule({ members, history, dates });
    assertStrict(res, members, history, 9);
    history = [...history, ...res.weeks];
    start = sundays(dates[8], 2)[1];
  }
});

test('skewed genders that are still feasible (7M/13F) stay strict across 12 periods', () => {
  const members = makeMembers(7, 13);
  let history: WeekAssignment[] = [];
  let start = '2026-01-04';
  for (let period = 0; period < 12; period++) {
    const dates = sundays(start, 9);
    const res = generateSchedule({ members, history, dates, seed: 42 + period });
    assertStrict(res, members, history, 9);
    history = [...history, ...res.weeks];
    start = sundays(dates[8], 2)[1];
  }
});

test('skewed genders 5M/10F (exactly 1/3 boys) are strict for 9 weeks', () => {
  const members = makeMembers(5, 10);
  const res = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 9), seed: 3 });
  assertStrict(res, members, [], 9);
});

test('3M/15F: not enough boys for fairness + mixed pairs -> gender relaxed, fairness kept', () => {
  // With fairness, 3 of 18 kids can cover at most ~6 of 9 reading weeks, so some weeks must be 2 girls.
  const members = makeMembers(3, 15);
  const dates = sundays('2026-10-04', 9);
  const res = generateSchedule({ members, history: [], dates, seed: 5 });
  assert.equal(res.weeks.length, 9);
  assert.equal(res.relaxed.gender, true);
  assert.equal(res.relaxed.consecutive, false);
  assert.ok(res.warnings.length > 0);
  assert.ok(res.warnings.every((w) => w.includes('Không đủ bạn nam/nữ')));
  const v = validateSchedule(members, res.weeks);
  assert.ok(v.every((x) => x.kind === 'gender'), JSON.stringify(v));
  // mixed pairs used whenever the fairness pool allows: boys used 6 times (the max possible)
  const boysReading = res.weeks.filter((w) => w.reading1 <= 3 || w.reading2 <= 3).length;
  assert.ok(boysReading >= 6, `boys used in ${boysReading} weeks`);
  assertInvariantEachWeek(members, res.weeks);
});

test('all girls -> relaxed.gender with a single explanatory warning', () => {
  const members = makeMembers(0, 12);
  const res = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 9), seed: 9 });
  assert.equal(res.weeks.length, 9);
  assert.equal(res.relaxed.gender, true);
  assert.equal(res.relaxed.consecutive, false);
  assert.equal(res.warnings.length, 1);
  const v = validateSchedule(members, res.weeks);
  assert.ok(v.length > 0 && v.every((x) => x.kind === 'gender'));
});

test('5 kids -> relaxed.consecutive, gender and fairness kept', () => {
  const members = makeMembers(2, 3);
  const res = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 9), seed: 11 });
  assert.equal(res.weeks.length, 9);
  assert.equal(res.relaxed.consecutive, true);
  assert.equal(res.relaxed.gender, false);
  assert.equal(res.relaxed.prayer, false);
  assert.ok(res.warnings.some((w) => w.includes('Số thành viên quá ít')));
  const v = validateSchedule(members, res.weeks);
  assert.ok(v.every((x) => x.kind === 'consecutive'), JSON.stringify(v));
  assertInvariantEachWeek(members, res.weeks);
  for (const w of res.weeks) assert.equal(new Set([w.reading1, w.reading2, w.prayer]).size, 3);
});

test('3 kids all girls -> both relaxed, still returns full weeks', () => {
  const members = makeMembers(0, 3);
  const res = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 4), seed: 1 });
  assert.equal(res.weeks.length, 4);
  assert.deepEqual(res.relaxed, { gender: true, consecutive: true, prayer: false });
});

test('fewer than 3 members -> no weeks, warning, no throw', () => {
  const res = generateSchedule({ members: makeMembers(1, 1), history: [], dates: sundays('2026-10-04', 9) });
  assert.deepEqual(res.weeks, []);
  assert.equal(res.warnings.length, 1);
  const empty = generateSchedule({ members: [], history: [], dates: [] });
  assert.deepEqual(empty.weeks, []);
});

test('latecomers join the current round: due once, no catch-up (baseCount ignored for fairness)', () => {
  const originals = makeMembers(5, 5, 1);
  const late = makeMembers(1, 1, 100, 7); // big baseCount must not matter any more
  const members = [...originals, ...late];
  const pre = generateSchedule({ members: originals, history: [], dates: sundays('2026-07-05', 12), seed: 2 });
  for (let seed = 0; seed < 10; seed++) {
    const res = generateSchedule({ members, history: pre.weeks, dates: sundays('2026-10-04', 9), seed });
    assert.equal(res.weeks.length, 9);
    assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false });
    const genDates = new Set(res.weeks.map((w) => w.date));
    assert.deepEqual(validateSchedule(members, [...pre.weeks, ...res.weeks]).filter((v) => genDates.has(v.date)), []);
    // history never completed a round with the latecomers, so they are the only due kids:
    // both read on 04/10, then they simply rotate with everyone else (no extra readings)
    const w0 = res.weeks[0];
    for (const id of [100, 101]) assert.ok([w0.reading1, w0.reading2, w0.prayer].includes(id));
    const st = computeStats(members, res.weeks);
    // 27 picks = end of round 1 + two full rounds of 12 + start of round 4 -> at most 4 each
    for (const x of st) assert.ok(x.total <= 4, `kid ${x.id} read ${x.total} times`);
  }
});

test('history with unknown ids (removed members) is ignored', () => {
  const members = makeMembers(4, 4);
  const history: WeekAssignment[] = [
    { date: '2026-09-13', reading1: 999, reading2: 1, prayer: 998 },
    { date: '2026-09-20', reading1: 5, reading2: 997, prayer: null },
    { date: '2026-09-27', reading1: 2, reading2: 6, prayer: 996 },
  ];
  const res = generateSchedule({ members, history, dates: sundays('2026-10-04', 9), seed: 6 });
  assert.equal(res.weeks.length, 9);
  assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false });
  const ids = new Set(members.map((m) => m.id));
  for (const w of res.weeks) for (const id of [w.reading1, w.reading2, w.prayer]) assert.ok(ids.has(id));
  const genDates = new Set(res.weeks.map((w) => w.date));
  const v = validateSchedule(members, [...history, ...res.weeks]).filter((x) => genDates.has(x.date));
  assert.deepEqual(v, []);
  // week right after 27/09 must avoid 2 and 6
  const w0 = res.weeks[0];
  assert.ok(![w0.reading1, w0.reading2, w0.prayer].includes(2));
  assert.ok(![w0.reading1, w0.reading2, w0.prayer].includes(6));
});

test('history violating fairness: the due kids finish the round, then a fresh round (no catch-up)', () => {
  const members = makeMembers(5, 5);
  const history: WeekAssignment[] = [
    { date: '2026-09-06', reading1: 1, reading2: 6, prayer: 2 },
    { date: '2026-09-20', reading1: 1, reading2: 7, prayer: 3 },
    { date: '2026-09-27', reading1: 1, reading2: 8, prayer: 4 }, // kid 1 read 3 times, 5/9/10 never
  ];
  const hv = validateSchedule(members, history).filter((v) => v.kind === 'fairness');
  assert.deepEqual(hv.map((v) => v.date), ['2026-09-20', '2026-09-27']);
  // round reconstruction: due = {5, 9, 10}
  const st = computeStats(members, history);
  assert.deepEqual(st.filter((x) => x.effective === 0).map((x) => x.id), [5, 9, 10]);
  for (let seed = 0; seed < 10; seed++) {
    const res = generateSchedule({ members, history, dates: sundays('2026-10-04', 9), seed });
    assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false });
    const genDates = new Set(res.weeks.map((w) => w.date));
    assert.deepEqual(validateSchedule(members, [...history, ...res.weeks]).filter((x) => genDates.has(x.date)), []);
    const ids = (w: (typeof res.weeks)[number]) => [w.reading1, w.reading2, w.prayer];
    assert.deepEqual(ids(res.weeks[0]).sort((a, b) => a - b), [5, 9, 10]);
    // new round: weeks 2-4 are 9 distinct kids (kid 1 has no extra "credit" or "debt")
    assert.equal(new Set(res.weeks.slice(1, 4).flatMap(ids)).size, 9);
  }
});

test('uneven history (real counts 1..5): only the kids missing from the current round are due', () => {
  // 20 kids, mixed gender; history read in "rounds" r=0..4 by kids with count > r (60 reads, 20 weeks)
  const members: SchedMember[] = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, gender: i % 2 ? 'F' : 'M', baseCount: 0 }));
  const cnt = (id: number) => 1 + Math.floor((id - 1) / 4);
  const reads: number[] = [];
  for (let r = 0; r < 5; r++) for (let id = 1; id <= 20; id++) if (cnt(id) > r) reads.push(id);
  const hDates = sundays('2026-05-17', 20);
  const history: WeekAssignment[] = hDates.map((date, j) => ({ date, reading1: reads[3 * j], reading2: reads[3 * j + 1], prayer: reads[3 * j + 2] }));
  // round 1 = everyone; round 2 so far = kids 5..20 -> due {1,2,3,4}
  assert.deepEqual(computeStats(members, history).filter((x) => x.effective === 1).map((x) => x.id), [1, 2, 3, 4]);
  for (let seed = 0; seed < 10; seed++) {
    const res = generateSchedule({ members, history, dates: sundays('2026-10-04', 9), seed });
    assert.equal(res.weeks.length, 9);
    const genDates = new Set(res.weeks.map((w) => w.date));
    assert.deepEqual(validateSchedule(members, [...history, ...res.weeks]).filter((v) => genDates.has(v.date)), []);
    const early = new Set(res.weeks.slice(0, 2).flatMap((w) => [w.reading1, w.reading2, w.prayer]));
    for (const id of [1, 2, 3, 4]) assert.ok(early.has(id), `seed ${seed}: due kid ${id} not in first 2 weeks`);
    for (const x of computeStats(members, res.weeks)) assert.ok(x.total <= 2, `seed ${seed}: kid ${x.id} read ${x.total} times`);
  }
});

// ---------------------------------------------------------------- real data regression

const REAL_MEMBERS: [string, 'M' | 'F'][] = [
  ['Mỹ Anh', 'F'], ['Ngọc Hà', 'F'], ['Thu Trang', 'F'], ['Quốc Anh', 'M'], ['Anh Đào', 'F'], ['Thanh Tâm', 'F'],
  ['Hồng Nhung', 'F'], ['Bích Ngọc', 'F'], ['Văn Hải', 'M'], ['Hải Anh', 'M'], ['Minh Khôi', 'M'], ['Đức Long', 'M'],
  ['Thu Hà', 'F'], ['Kim Chi', 'F'], ['Hoàng Nam', 'M'], ['Diệu Linh', 'F'], ['Phương Vy', 'F'], ['Khánh Linh', 'F'],
  ['Gia Bảo', 'M'], ['Thiện Tâm', 'M'], ['Thảo My', 'F'],
];
const REAL_HISTORY: [string, (string | null)[]][] = [
  ['05-03', ['Bích Ngọc', 'Thiện Tâm', 'Kim Chi']], ['05-10', ['Mỹ Anh', 'Đức Long', 'Ngọc Hà']],
  ['05-17', ['Thu Trang', 'Quốc Anh', 'Thu Hà']], ['05-24', [null, null, null]],
  ['05-31', ['Minh Khôi', 'Thảo My', 'Phương Vy']], ['06-07', ['Hải Anh', 'Hồng Nhung', 'Kim Chi']],
  ['06-14', ['Mỹ Anh', 'Thiện Tâm', 'Bích Ngọc']], ['06-21', ['Anh Đào', 'Hoàng Nam', 'Diệu Linh']],
  ['06-28', ['Bích Ngọc', 'Văn Hải', 'Thanh Tâm']], ['07-05', ['Khánh Linh', 'Đức Long', 'Thu Trang']],
  ['07-12', ['Thu Hà', 'Thiện Tâm', 'Thu Trang']], ['07-19', ['Hồng Nhung', 'Quốc Anh', 'Anh Đào']],
  ['08-02', ['Minh Khôi', 'Phương Vy', 'Kim Chi']], ['08-09', ['Thảo My', 'Hải Anh', 'Mỹ Anh']],
  ['08-16', ['Gia Bảo', 'Thu Trang', 'Khánh Linh']], ['08-23', ['Hoàng Nam', 'Diệu Linh', 'Thanh Tâm']],
  ['08-30', ['Phương Vy', 'Đức Long', 'Bích Ngọc']], ['09-06', ['Văn Hải', 'Hồng Nhung', 'Thu Hà']],
  ['09-13', ['Thiện Tâm', 'Kim Chi', 'Minh Khôi']], ['09-20', ['Quốc Anh', 'Thảo My', 'Thu Trang']],
  ['09-25', ['Thu Hà', null, 'Hoàng Nam']], ['09-27', ['Hải Anh', 'Mỹ Anh', 'Thanh Tâm']],
];

test('real data: round reconstruction and Oct-Nov generation', () => {
  const idOf = new Map(REAL_MEMBERS.map(([name], i) => [name, i + 1]));
  const nameOf = new Map(REAL_MEMBERS.map(([name], i) => [i + 1, name]));
  const members: SchedMember[] = REAL_MEMBERS.map(([, g], i) => ({ id: i + 1, gender: g, baseCount: 0 }));
  const id = (n: string | null) => (n == null ? null : idOf.get(n)!);
  const history: WeekAssignment[] = REAL_HISTORY.map(([md, [a, b, c]]) => ({ date: `2026-${md}`, reading1: id(a), reading2: id(b), prayer: id(c) }));
  const lastRead = new Map<number, string>();
  for (const w of history) for (const x of [w.reading1, w.reading2, w.prayer]) if (x != null) lastRead.set(x, w.date);

  // round 1 completes on 16/08 (Gia Bảo's first reading); due now = the kids with effective 1
  const st = computeStats(members, history);
  const due = st.filter((x) => x.effective === 1).map((x) => nameOf.get(x.id)).sort();
  assert.deepEqual(due, ['Anh Đào', 'Gia Bảo', 'Ngọc Hà']);
  assert.ok(st.every((x) => x.effective === 1 || x.effective === 2));

  const dates = sundays('2026-10-04', 9);
  assert.equal(dates[8], '2026-11-29');
  let earlyBeforeLate = 0;
  let comparisons = 0;
  for (let seed = 0; seed < 25; seed++) {
    const res = generateSchedule({ members, history, dates, seed });
    assert.equal(res.weeks.length, 9);
    assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false }, `seed ${seed}`);
    const genDates = new Set(res.weeks.map((w) => w.date));
    assert.deepEqual(validateSchedule(members, [...history, ...res.weeks]).filter((v) => genDates.has(v.date)), [], `seed ${seed}`);
    // 04/10 = exactly the three due kids; Gia Bảo must be a reader (only boy)
    const w0 = res.weeks[0];
    assert.deepEqual([w0.reading1, w0.reading2, w0.prayer].map((x) => nameOf.get(x)).sort(), ['Anh Đào', 'Gia Bảo', 'Ngọc Hà']);
    assert.notEqual(w0.prayer, idOf.get('Gia Bảo'));
    // Thiện Tâm (read 13/09) must not read on 04/10
    assert.ok(![w0.reading1, w0.reading2, w0.prayer].includes(idOf.get('Thiện Tâm')!));
    // round 3 starts 11/10: LRU -> kids last read up to 06/09 tend to come before kids who read 20/09-27/09
    const pos = new Map<number, number>();
    res.weeks.slice(1).forEach((w, i) => [w.reading1, w.reading2, w.prayer].forEach((x) => { if (!pos.has(x)) pos.set(x, i); }));
    const early = members.filter((m) => (lastRead.get(m.id) ?? '') <= '2026-09-06' && !['Anh Đào', 'Gia Bảo', 'Ngọc Hà'].includes(nameOf.get(m.id)!));
    const late = members.filter((m) => (lastRead.get(m.id) ?? '') >= '2026-09-20');
    for (const a of early) for (const b of late) {
      comparisons++;
      if ((pos.get(a.id) ?? 99) < (pos.get(b.id) ?? 99)) earlyBeforeLate++;
    }
  }
  assert.ok(earlyBeforeLate / comparisons > 0.75, `LRU preference too weak: ${earlyBeforeLate}/${comparisons}`);
});

test('deterministic with seed, varies without', () => {
  const members = makeMembers(10, 10);
  const dates = sundays('2026-10-04', 9);
  const a = generateSchedule({ members, history: [], dates, seed: 77 });
  const b = generateSchedule({ members, history: [], dates, seed: 77 });
  assert.deepEqual(a, b);
  const outs = new Set<string>();
  for (let i = 0; i < 5; i++) outs.add(JSON.stringify(generateSchedule({ members, history: [], dates }).weeks));
  assert.ok(outs.size > 1);
});

test('reading1/reading2 order is randomized between M and F', () => {
  const members = makeMembers(10, 10);
  const byId = new Map(members.map((m) => [m.id, m]));
  let mFirst = 0;
  let fFirst = 0;
  for (let s = 0; s < 10; s++) {
    for (const w of generateSchedule({ members, history: [], dates: sundays('2026-10-04', 9), seed: s }).weeks) {
      if (byId.get(w.reading1)!.gender === 'M') mFirst++;
      else fFirst++;
    }
  }
  assert.ok(mFirst > 10 && fFirst > 10, `${mFirst} vs ${fFirst}`);
});

test('performance: 100 members x 9 weeks and small hard cases under 1s', () => {
  const cases: SchedMember[][] = [makeMembers(50, 50), makeMembers(3, 15), makeMembers(2, 3), makeMembers(3, 3), makeMembers(0, 7), makeMembers(1, 6), makeMembers(4, 4)];
  for (const members of cases) {
    const t = Date.now();
    const res = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 9), seed: 1 });
    const ms = Date.now() - t;
    assert.equal(res.weeks.length, 9);
    assert.ok(ms < 1000, `${members.length} members took ${ms}ms`);
    assertInvariantEachWeek(members, res.weeks);
  }
});

test('6 kids (3M/3F) is exactly enough for strict rules', () => {
  const members = makeMembers(3, 3);
  const res = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 9), seed: 21 });
  assertStrict(res, members, [], 9);
});

test('validateSchedule detects each violation kind', () => {
  const members = makeMembers(3, 3);
  const weeks: WeekAssignment[] = [
    { date: '2026-10-11', reading1: 1, reading2: 1, prayer: 4 }, // duplicate
    { date: '2026-10-04', reading1: 1, reading2: 2, prayer: 4 }, // gender (1,2 both M)
    { date: '2026-10-18', reading1: 3, reading2: null, prayer: 5 }, // missing
  ];
  const v = validateSchedule(members, weeks);
  const kinds = new Set(v.map((x) => x.kind));
  for (const k of ['duplicate', 'gender', 'missing', 'consecutive', 'fairness'] as const) assert.ok(kinds.has(k), `missing ${k}`);
  const g = v.find((x) => x.kind === 'gender')!;
  assert.equal(g.date, '2026-10-04');
  assert.deepEqual(g.memberIds.sort(), [1, 2]);
  const c = v.find((x) => x.kind === 'consecutive')!;
  assert.equal(c.date, '2026-10-11');
  assert.ok(c.memberIds.includes(1));
});

test('computeStats counts roles, effective (rounds) and lastDate', () => {
  const members: SchedMember[] = [
    { id: 1, gender: 'M', baseCount: 2 },
    { id: 2, gender: 'F', baseCount: 0 },
    { id: 3, gender: 'F', baseCount: 0 },
  ];
  const weeks: WeekAssignment[] = [
    { date: '2026-10-11', reading1: 1, reading2: 2, prayer: 3 },
    { date: '2026-10-04', reading1: 2, reading2: 1, prayer: 99 },
  ];
  // 04/10: S={1,2}; 11/10: 3 completes round 1, repeaters 1 & 2 start round 2 -> effective 2,2,1
  const s = computeStats(members, weeks);
  assert.deepEqual(s[0], { id: 1, total: 2, effective: 2, reading1: 1, reading2: 1, prayer: 0, lastDate: '2026-10-11' });
  assert.deepEqual(s[1].effective, 2);
  assert.deepEqual(s[2], { id: 3, total: 1, effective: 1, reading1: 0, reading2: 0, prayer: 1, lastDate: '2026-10-11' });
});

// ---------------------------------------------------------------- prayer streak rule

/** Every member's own assignment sequence (date order) never has 3 prayers in a row. */
function assertNoPrayerStreak(weeks: WeekAssignment[]) {
  const seq = new Map<number, string[]>();
  for (const w of weeks.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    for (const r of ['reading1', 'reading2', 'prayer'] as const) {
      const id = w[r];
      if (id == null) continue;
      const q = seq.get(id) || [];
      q.push(r);
      seq.set(id, q);
      const n = q.length;
      assert.ok(!(n >= 3 && q[n - 1] === 'prayer' && q[n - 2] === 'prayer' && q[n - 3] === 'prayer'), `member ${id} prayed 3 times in a row (${w.date})`);
    }
  }
}

test('prayer streak across history boundary: kid with 2 prayers must read next', () => {
  // 6 kids: 1-3 M, 4-6 F. Kids 1 and 6 prayed at both of their assignments so far.
  const members = makeMembers(3, 3);
  const history: WeekAssignment[] = [
    { date: '2026-09-06', reading1: 2, reading2: 4, prayer: 1 },
    { date: '2026-09-13', reading1: 3, reading2: 5, prayer: 6 },
    { date: '2026-09-20', reading1: 2, reading2: 4, prayer: 1 },
    { date: '2026-09-27', reading1: 3, reading2: 5, prayer: 6 },
  ];
  for (let seed = 0; seed < 20; seed++) {
    const res = generateSchedule({ members, history, dates: sundays('2026-10-04', 9), seed });
    assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false });
    // 04/10 is forced to {1,2,4} (3/5/6 read 27/09); kid 1 must read, so 2 prays
    const w0 = res.weeks[0];
    assert.ok(w0.reading1 === 1 || w0.reading2 === 1, `seed ${seed}: ${JSON.stringify(w0)}`);
    assert.equal(w0.prayer, 2);
    // 11/10 is {3,5,6}; kid 6 must read, so 5 prays
    const w1 = res.weeks[1];
    assert.ok(w1.reading1 === 6 || w1.reading2 === 6, `seed ${seed}: ${JSON.stringify(w1)}`);
    assert.equal(w1.prayer, 5);
    assertNoPrayerStreak([...history, ...res.weeks]);
    assert.deepEqual(validateSchedule(members, [...history, ...res.weeks]), []);
  }
});

test('prayer streak never occurs over 12 periods (small group 3M/4F, prayer often lands on the same kids)', () => {
  const members = makeMembers(3, 4);
  let history: WeekAssignment[] = [];
  let start = '2026-01-04';
  for (let period = 0; period < 12; period++) {
    const dates = sundays(start, 9);
    const res = generateSchedule({ members, history, dates, seed: 300 + period });
    assert.equal(res.relaxed.prayer, false);
    history = [...history, ...res.weeks];
    start = sundays(dates[8], 2)[1];
  }
  assertNoPrayerStreak(history);
  assert.ok(validateSchedule(members, history).every((v) => v.kind !== 'prayer' && v.kind !== 'fairness'));
});

test('prayer rule relaxed only when impossible (3 kids, all already on a prayer streak)', () => {
  const members = makeMembers(1, 2); // ids 1(M), 2(F), 3(F)
  const history: WeekAssignment[] = [
    { date: '2026-07-05', reading1: null, reading2: null, prayer: 1 },
    { date: '2026-07-19', reading1: null, reading2: null, prayer: 1 },
    { date: '2026-08-02', reading1: null, reading2: null, prayer: 2 },
    { date: '2026-08-16', reading1: null, reading2: null, prayer: 2 },
    { date: '2026-08-30', reading1: null, reading2: null, prayer: 3 },
    { date: '2026-09-13', reading1: null, reading2: null, prayer: 3 },
  ];
  const res = generateSchedule({ members, history, dates: sundays('2026-10-04', 4), seed: 1 });
  assert.equal(res.weeks.length, 4);
  assert.equal(res.relaxed.prayer, true);
  assert.ok(res.warnings.some((w) => w.includes('Lời nguyện 3 lần liên tiếp')));
  const pv = validateSchedule(members, [...history, ...res.weeks]).filter((v) => v.kind === 'prayer');
  assert.equal(pv.length, 1, JSON.stringify(pv)); // only the unavoidable first week
  assert.equal(pv[0].date, '2026-10-04');
});

// ---------------------------------------------------------------- feast days (non-Sunday dates)

function assertNoTwoWithin7Days(weeks: { date: string; reading1: number | null; reading2: number | null; prayer: number | null }[]) {
  const toDay = (d: string) => Date.parse(d + 'T00:00:00Z') / 86400000;
  for (let i = 0; i < weeks.length; i++)
    for (let j = 0; j < weeks.length; j++) {
      const diff = toDay(weeks[j].date) - toDay(weeks[i].date);
      if (diff <= 0 || diff > 7) continue;
      const a = new Set([weeks[i].reading1, weeks[i].reading2, weeks[i].prayer]);
      for (const x of [weeks[j].reading1, weeks[j].reading2, weeks[j].prayer])
        assert.ok(x == null || !a.has(x), `kid ${x} reads ${weeks[i].date} and ${weeks[j].date}`);
    }
}

test('feast days between Sundays (Christmas): nobody reads twice within 7 days, fairness counts feasts', () => {
  const members = makeMembers(10, 10);
  const dates = [...sundays('2026-12-06', 5), '2026-12-24', '2026-12-25', '2027-01-01'].sort();
  for (let seed = 0; seed < 10; seed++) {
    const res = generateSchedule({ members, history: [], dates, seed });
    assertStrict(res, members, [], dates.length);
    assertNoTwoWithin7Days(res.weeks);
    assertInvariantEachWeek(members, res.weeks);
  }
});

test('feast day in history 4 days before first date blocks its readers; 14-day gap is fine', () => {
  const members = makeMembers(5, 5);
  const history: WeekAssignment[] = [
    { date: '2026-09-20', reading1: 2, reading2: 7, prayer: 3 }, // 14 days before -> allowed
    { date: '2026-09-30', reading1: 1, reading2: 6, prayer: 8 }, // Wednesday feast, 4 days before
  ];
  for (let seed = 0; seed < 10; seed++) {
    const res = generateSchedule({ members, history, dates: sundays('2026-10-04', 6), seed });
    assertStrict(res, members, history, 6);
    const w0 = res.weeks[0];
    for (const x of [1, 6, 8]) assert.ok(![w0.reading1, w0.reading2, w0.prayer].includes(x));
    assertNoTwoWithin7Days([...history, ...res.weeks]);
  }
});

test('Trung thu feast mid-week in a small group of 7 relaxes "within 7 days" only if needed', () => {
  // 7 kids, Sunday 20/09, Friday 25/09 (Trung thu), Sunday 27/09: 3 events pairwise <= 7 days -> needs 9 kids
  const members = makeMembers(3, 4);
  const res = generateSchedule({ members, history: [], dates: ['2026-09-20', '2026-09-25', '2026-09-27', '2026-10-04'], seed: 2 });
  assert.equal(res.weeks.length, 4);
  assert.equal(res.relaxed.consecutive, true);
  assert.ok(res.warnings.some((w) => w.includes('trong vòng 7 ngày')));
  assertInvariantEachWeek(members, res.weeks);
});

test('validateSchedule: within-7-days and prayer streak flags', () => {
  const members = makeMembers(4, 4); // 1-4 M, 5-8 F
  const weeks: WeekAssignment[] = [
    { date: '2026-12-20', reading1: 1, reading2: 5, prayer: 2 },
    { date: '2026-12-24', reading1: 3, reading2: 6, prayer: 1 }, // 1 again after 4 days
    { date: '2026-12-27', reading1: 4, reading2: 7, prayer: 3 }, // 3 again after 3 days; nothing vs 20/12 (7 days) except none
    { date: '2027-01-04', reading1: 2, reading2: 8, prayer: 5 }, // 8 days after 27/12: allowed
    // prayer streak for kid 5: reading (20/12), then prayers 04/01, 18/01, 01/02 -> 3rd prayer flagged on 01/02
    { date: '2027-01-18', reading1: 1, reading2: 6, prayer: 5 },
    { date: '2027-02-01', reading1: 2, reading2: 7, prayer: 5 },
    // kid 6: reading, reading, prayer, prayer -> no streak of 3
    { date: '2027-02-15', reading1: 3, reading2: 8, prayer: 6 },
    { date: '2027-03-01', reading1: 4, reading2: 7, prayer: 6 },
  ];
  const v = validateSchedule(members, weeks);
  const consec = v.filter((x) => x.kind === 'consecutive');
  assert.deepEqual(consec.map((x) => [x.date, x.memberIds]), [
    ['2026-12-24', [1]],
    ['2026-12-27', [3]],
  ]);
  assert.ok(consec[0].message.includes('trong vòng 7 ngày'));
  const prayer = v.filter((x) => x.kind === 'prayer');
  assert.deepEqual(prayer.map((x) => [x.date, x.memberIds]), [['2027-02-01', [5]]]);
  assert.ok(prayer[0].message.includes('Lời nguyện 3 lần liên tiếp'));
  // exactly 7 days apart keeps the "2 tuần liền" wording
  const v2 = validateSchedule(members, [
    { date: '2026-10-04', reading1: 1, reading2: 5, prayer: 2 },
    { date: '2026-10-11', reading1: 1, reading2: 6, prayer: 3 },
  ]).filter((x) => x.kind === 'consecutive');
  assert.equal(v2.length, 1);
  assert.ok(v2[0].message.includes('2 tuần liền'));
});
