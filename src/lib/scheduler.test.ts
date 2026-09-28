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

/** Queue fairness over the whole timeline: validateSchedule reports no 'fairness' violation. */
function assertInvariantEachWeek(members: SchedMember[], weeks: WeekAssignment[]) {
  const v = validateSchedule(members, weeks).filter((x) => x.kind === 'fairness');
  assert.deepEqual(v, [], 'queue fairness broken');
}

/**
 * Independent brute force: every generated week must be the lexicographically earliest
 * (sorted queue-rank vector) triple that satisfies all hard rules.
 */
function assertLexEarliest(members: SchedMember[], history: WeekAssignment[], weeks: WeekAssignment[]) {
  const day = (d: string) => Date.parse(d + 'T00:00:00Z') / 86400000;
  const roles = ['reading1', 'reading2', 'prayer'] as const;
  const male = new Map(members.map((m) => [m.id, m.gender === 'M']));
  const timeline = history.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const w of weeks) {
    const d = day(w.date);
    const last = new Map<number, number>();
    const seq = new Map<number, string[]>();
    const recent = new Set<number>();
    for (const h of timeline)
      for (const r of roles) {
        const x = h[r];
        if (x == null) continue;
        last.set(x, Math.max(last.get(x) ?? -Infinity, day(h.date)));
        seq.set(x, [...(seq.get(x) || []), r]);
        if (d - day(h.date) > 0 && d - day(h.date) <= 7) recent.add(x);
      }
    const lr = (x: number) => last.get(x) ?? -Infinity;
    const rank = (x: number) => members.filter((m) => lr(m.id) < lr(x)).length;
    const streak = (x: number) => {
      const q = seq.get(x) || [];
      return q.length >= 2 && q[q.length - 1] === 'prayer' && q[q.length - 2] === 'prayer';
    };
    const legal = (t: number[]) =>
      t.every((x) => !recent.has(x)) &&
      t.some((p) => {
        const rs = t.filter((x) => x !== p);
        return !streak(p) && male.get(rs[0]) !== male.get(rs[1]);
      });
    const vec = (t: number[]) => t.map(rank).sort((a, b) => a - b);
    const less = (a: number[], b: number[]) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
    let best: number[] | null = null;
    const ids = members.map((m) => m.id);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        for (let k = j + 1; k < ids.length; k++) {
          const t = [ids[i], ids[j], ids[k]];
          if (!legal(t)) continue;
          const v = vec(t);
          if (!best || less(v, best)) best = v;
        }
    assert.deepEqual(vec([w.reading1!, w.reading2!, w.prayer!]), best, `week ${w.date} is not the earliest feasible set`);
    timeline.push(w);
  }
}

function assertStrict(res: GenerateResult, members: SchedMember[], history: WeekAssignment[], n: number) {
  assert.equal(res.weeks.length, n);
  assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false });
  assert.deepEqual(res.warnings, []);
  // (history itself may be unfair/hand-edited; only the generated dates must be clean)
  const genDates = new Set(res.weeks.map((w) => w.date));
  assert.deepEqual(validateSchedule(members, [...history, ...res.weeks]).filter((v) => genDates.has(v.date)), []);
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

test('3M/15F: queue lets the scarce boys read more often, so rules stay strict', () => {
  const members = makeMembers(3, 15);
  const res = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 9), seed: 5 });
  assertStrict(res, members, [], 9);
  assertLexEarliest(members, [], res.weeks);
});

test('1M/10F: the only boy cannot read two Sundays in a row -> gender relaxed on the other weeks', () => {
  const members = makeMembers(1, 10);
  const res = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 8), seed: 5 });
  assert.equal(res.weeks.length, 8);
  assert.deepEqual(res.relaxed, { gender: true, consecutive: false, prayer: false });
  const boyWeeks = res.weeks.filter((w) => [w.reading1, w.reading2].includes(1)).length;
  assert.equal(boyWeeks, 4); // every other week
  assert.equal(res.warnings.length, 4);
  assert.ok(res.warnings.every((w) => w.includes('Không đủ bạn nam/nữ')));
  const v = validateSchedule(members, res.weeks);
  assert.ok(v.every((x) => x.kind === 'gender'), JSON.stringify(v));
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

test('newcomer (never read) goes to the front of the queue; baseCount is ignored', () => {
  const originals = makeMembers(5, 5, 1);
  const late = makeMembers(1, 1, 100, 7); // big baseCount must not matter
  const members = [...originals, ...late];
  const pre = generateSchedule({ members: originals, history: [], dates: sundays('2026-07-05', 12), seed: 2 });
  for (let seed = 0; seed < 10; seed++) {
    const res = generateSchedule({ members, history: pre.weeks, dates: sundays('2026-10-04', 9), seed });
    assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false });
    // (pre-history is flagged for the newcomers, who did not exist yet; only check the new weeks)
    const genDates = new Set(res.weeks.map((w) => w.date));
    assert.deepEqual(validateSchedule(members, [...pre.weeks, ...res.weeks]).filter((v) => genDates.has(v.date)), []);
    const w0 = res.weeks[0];
    for (const id of [100, 101]) assert.ok([w0.reading1, w0.reading2, w0.prayer].includes(id), `seed ${seed}`);
    assertLexEarliest(members, pre.weeks, res.weeks);
    // no catch-up: after their first reading the newcomers wait like everybody else
    for (const x of computeStats(members, res.weeks).filter((x) => x.id >= 100)) assert.ok(x.total <= 3);
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

test('queue after an unfair history: never-read first, then the oldest readers', () => {
  const members = makeMembers(5, 5); // 1-5 M, 6-10 F
  const history: WeekAssignment[] = [
    { date: '2026-09-06', reading1: 1, reading2: 6, prayer: 2 },
    { date: '2026-09-20', reading1: 1, reading2: 7, prayer: 3 },
    { date: '2026-09-27', reading1: 1, reading2: 8, prayer: 4 }, // kid 1 read 3 times, 5/9/10 never
  ];
  const hv = validateSchedule(members, history).filter((v) => v.kind === 'fairness');
  assert.deepEqual(hv.map((v) => v.date), ['2026-09-20', '2026-09-27']);
  // 27/09: kid 1 (read 20/09) reads again while boys 5 (never) and 2 (06/09) wait; 8 and 4 were first-timers
  assert.deepEqual(hv[1].memberIds[0], 1);
  assert.deepEqual(hv[1].waitingIds?.slice().sort((a, b) => a - b), [2, 5]);
  // queue ranks: never-read 5/9/10 = 0; 06/09 readers 2/6 = 3; 20/09 = 5; 27/09 = 7
  const eff = new Map(computeStats(members, history).map((x) => [x.id, x.effective]));
  assert.deepEqual([5, 9, 10, 2, 6, 3, 7, 1, 4, 8].map((id) => eff.get(id)), [0, 0, 0, 3, 3, 5, 5, 7, 7, 7]);
  const second = new Set<number>();
  for (let seed = 0; seed < 20; seed++) {
    const res = generateSchedule({ members, history, dates: sundays('2026-10-04', 9), seed });
    assertStrict(res, members, history, 9);
    const ids = (w: (typeof res.weeks)[number]) => [w.reading1, w.reading2, w.prayer];
    assert.deepEqual(ids(res.weeks[0]).sort((a, b) => a - b), [5, 9, 10]);
    const w1 = ids(res.weeks[1]);
    assert.ok(w1.includes(2) && w1.includes(6), `seed ${seed}: ${w1}`);
    second.add(w1.find((x) => x !== 2 && x !== 6)!);
    assertLexEarliest(members, history, res.weeks);
  }
  assert.deepEqual([...second].sort(), [3, 7]); // tie between 3 and 7 broken randomly
});

test('gender-scarce front of queue: a girl is skipped for the first boy and reads next week', () => {
  // 6 girls (ids 1-6), 3 boys (ids 7-9); queue G1, G2, G3, B7, G4, B8, G5, G6, B9
  const members: SchedMember[] = [
    ...[1, 2, 3, 4, 5, 6].map((id) => ({ id, gender: 'F' as const, baseCount: 0 })),
    ...[7, 8, 9].map((id) => ({ id, gender: 'M' as const, baseCount: 0 })),
  ];
  const order = [1, 2, 3, 7, 4, 8, 5, 6, 9];
  const history: WeekAssignment[] = order.map((id, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, reading1: null, reading2: null, prayer: id }));
  for (let seed = 0; seed < 10; seed++) {
    const res = generateSchedule({ members, history, dates: sundays('2026-10-04', 4), seed });
    assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false });
    const ids = (w: (typeof res.weeks)[number]) => [w.reading1, w.reading2, w.prayer].sort((a, b) => a - b);
    assert.deepEqual(ids(res.weeks[0]), [1, 2, 7]); // G3 skipped: {G1,G2,G3} has no boy
    assert.deepEqual(ids(res.weeks[1]), [3, 4, 8]); // G3 still at the front -> reads next week
    const genDates = new Set(res.weeks.map((w) => w.date));
    assert.deepEqual(validateSchedule(members, [...history, ...res.weeks]).filter((v) => genDates.has(v.date)), []);
    assertLexEarliest(members, history, res.weeks);
  }
});

test('ties in the queue are broken randomly across seeds', () => {
  const members = makeMembers(10, 10);
  const firsts = new Set<string>();
  for (let seed = 0; seed < 20; seed++) {
    const res = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 3), seed });
    firsts.add(JSON.stringify([res.weeks[0].reading1, res.weeks[0].reading2, res.weeks[0].prayer].sort()));
  }
  assert.ok(firsts.size >= 10, `only ${firsts.size} distinct first weeks`);
});

test('feast days: a kid blocked by the 7-day rule keeps their place and reads right after', () => {
  const members = makeMembers(6, 6);
  const pre = generateSchedule({ members, history: [], dates: sundays('2026-10-04', 8), seed: 9 });
  const dates = ['2026-12-06', '2026-12-13', '2026-12-20', '2026-12-24', '2026-12-25', '2026-12-27', '2027-01-03'];
  for (let seed = 0; seed < 10; seed++) {
    const res = generateSchedule({ members, history: pre.weeks, dates, seed });
    assertStrict(res, members, pre.weeks, dates.length);
    assertLexEarliest(members, pre.weeks, res.weeks);
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

test('real data: waiting queue, Oct-Nov generation (19 active members)', () => {
  const idOf = new Map(REAL_MEMBERS.map(([name], i) => [name, i + 1]));
  const nameOf = new Map(REAL_MEMBERS.map(([name], i) => [i + 1, name]));
  const hidden = new Set(['Ngọc Hà', 'Anh Đào']); // no longer active
  const members: SchedMember[] = REAL_MEMBERS.flatMap(([name, g], i) => (hidden.has(name) ? [] : [{ id: i + 1, gender: g, baseCount: 0 }]));
  assert.equal(members.length, 19);
  const id = (n: string | null) => (n == null ? null : idOf.get(n)!);
  const history: WeekAssignment[] = REAL_HISTORY.map(([md, [a, b, c]]) => ({ date: `2026-${md}`, reading1: id(a), reading2: id(b), prayer: id(c) }));

  // queue front: Gia Bảo (M) & Khánh Linh (F) last read 16/08 (rank 0), Diệu Linh 23/08 (rank 2)
  const eff = new Map(computeStats(members, history).map((x) => [nameOf.get(x.id), x.effective]));
  assert.equal(eff.get('Gia Bảo'), 0);
  assert.equal(eff.get('Khánh Linh'), 0);
  assert.equal(eff.get('Diệu Linh'), 2);
  assert.equal([...eff.values()].filter((e) => e <= 2).length, 3);

  const dates = sundays('2026-10-04', 9);
  assert.equal(dates[8], '2026-11-29');
  const variants = new Set<string>();
  for (let seed = 0; seed < 25; seed++) {
    const res = generateSchedule({ members, history, dates, seed });
    assert.deepEqual(res.relaxed, { gender: false, consecutive: false, prayer: false }, `seed ${seed}`);
    assert.equal(res.weeks.length, 9);
    const genDates = new Set(res.weeks.map((w) => w.date));
    assert.deepEqual(validateSchedule(members, [...history, ...res.weeks]).filter((v) => genDates.has(v.date)), [], `seed ${seed}`);
    const w0 = res.weeks[0];
    assert.deepEqual([w0.reading1, w0.reading2, w0.prayer].map((x) => nameOf.get(x)).sort(), ['Diệu Linh', 'Gia Bảo', 'Khánh Linh']);
    assert.notEqual(w0.prayer, idOf.get('Gia Bảo')); // only boy -> must be a reader
    assertLexEarliest(members, history, res.weeks);
    variants.add(JSON.stringify(res.weeks));
  }
  assert.ok(variants.size > 5, 'ties should randomize the schedule');
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

test('computeStats counts roles, effective (queue rank) and lastDate', () => {
  const members: SchedMember[] = [
    { id: 1, gender: 'M', baseCount: 2 },
    { id: 2, gender: 'F', baseCount: 0 },
    { id: 3, gender: 'F', baseCount: 0 },
    { id: 4, gender: 'M', baseCount: 0 },
  ];
  const weeks: WeekAssignment[] = [
    { date: '2026-10-11', reading1: 1, reading2: 2, prayer: null },
    { date: '2026-10-04', reading1: 2, reading2: 1, prayer: 3 },
  ];
  // lastRead: 4 never (rank 0), 3 04/10 (rank 1), 1 & 2 11/10 (tied, rank 2)
  const s = computeStats(members, weeks);
  assert.deepEqual(s[0], { id: 1, total: 2, effective: 2, reading1: 1, reading2: 1, prayer: 0, lastDate: '2026-10-11' });
  assert.equal(s[1].effective, 2);
  assert.deepEqual(s[2], { id: 3, total: 1, effective: 1, reading1: 0, reading2: 0, prayer: 1, lastDate: '2026-10-04' });
  assert.deepEqual(s[3], { id: 4, total: 0, effective: 0, reading1: 0, reading2: 0, prayer: 0, lastDate: null });
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
