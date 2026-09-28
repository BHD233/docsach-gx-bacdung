import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSundayTitle,
  getLiturgicalYearLetter,
  getSundaysInRange,
  getSundaysOfMonths,
  getEaster,
  getAdventStart,
} from './liturgical';

const t = getSundayTitle;

test('Easter dates (Meeus/Butcher)', () => {
  const known: Record<number, string> = {
    2008: '2008-03-23', 2019: '2019-04-21', 2024: '2024-03-31', 2025: '2025-04-20',
    2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16', 2038: '2038-04-25',
    2285: '2285-03-22',
  };
  for (const [y, e] of Object.entries(known)) assert.equal(getEaster(Number(y)), e);
});

test('Advent start dates', () => {
  assert.equal(getAdventStart(2025), '2025-11-30');
  assert.equal(getAdventStart(2026), '2026-11-29');
  assert.equal(getAdventStart(2022), '2022-11-27'); // Christmas on Sunday
  assert.equal(getAdventStart(2023), '2023-12-03');
});

test('year letter', () => {
  assert.equal(getLiturgicalYearLetter('2025-11-23'), 'C');
  assert.equal(getLiturgicalYearLetter('2025-11-30'), 'A');
  assert.equal(getLiturgicalYearLetter('2026-09-06'), 'A');
  assert.equal(getLiturgicalYearLetter('2026-11-22'), 'A');
  assert.equal(getLiturgicalYearLetter('2026-11-29'), 'B');
  assert.equal(getLiturgicalYearLetter('2027-12-05'), 'C');
});

test('required September 2026 outputs', () => {
  assert.equal(t('2026-09-06'), 'CHÚA NHẬT XXIII THƯỜNG NIÊN NĂM A');
  assert.equal(t('2026-09-13'), 'CHÚA NHẬT XXIV THƯỜNG NIÊN NĂM A');
  assert.equal(t('2026-09-20'), 'CHÚA NHẬT XXV THƯỜNG NIÊN NĂM A');
  assert.equal(t('2026-09-27'), 'CHÚA NHẬT XXVI THƯỜNG NIÊN NĂM A');
});

test('Advent and Christmas 2025', () => {
  assert.equal(t('2025-11-23'), 'LỄ CHÚA GIÊSU KITÔ VUA VŨ TRỤ NĂM C');
  assert.equal(t('2025-11-30'), 'CHÚA NHẬT I MÙA VỌNG NĂM A');
  assert.equal(t('2025-12-07'), 'CHÚA NHẬT II MÙA VỌNG NĂM A');
  assert.equal(t('2025-12-14'), 'CHÚA NHẬT III MÙA VỌNG NĂM A');
  assert.equal(t('2025-12-21'), 'CHÚA NHẬT IV MÙA VỌNG NĂM A');
  assert.equal(t('2025-12-28'), 'LỄ THÁNH GIA THẤT NĂM A');
  assert.equal(t('2026-01-04'), 'LỄ CHÚA HIỂN LINH');
  assert.equal(t('2026-01-11'), 'LỄ CHÚA GIÊSU CHỊU PHÉP RỬA NĂM A');
  assert.equal(t('2026-01-18'), 'CHÚA NHẬT II THƯỜNG NIÊN NĂM A');
  assert.equal(t('2026-01-25'), 'CHÚA NHẬT III THƯỜNG NIÊN NĂM A');
  assert.equal(t('2026-02-15'), 'CHÚA NHẬT VI THƯỜNG NIÊN NĂM A');
});

test('Advent IV on Dec 24 and Immaculate Conception Sunday keeps Advent', () => {
  assert.equal(t('2023-12-24'), 'CHÚA NHẬT IV MÙA VỌNG NĂM B');
  assert.equal(t('2024-12-08'), 'CHÚA NHẬT II MÙA VỌNG NĂM C');
});

test('Christmas on Sunday (2022): no Holy Family Sunday, Jan 1 Mary, Epiphany Jan 8, Baptism Monday', () => {
  assert.equal(t('2022-12-25'), 'LỄ CHÚA GIÁNG SINH');
  assert.equal(t('2023-01-01'), 'LỄ ĐỨC MARIA MẸ THIÊN CHÚA');
  assert.equal(t('2023-01-08'), 'LỄ CHÚA HIỂN LINH');
  assert.equal(t('2023-01-15'), 'CHÚA NHẬT II THƯỜNG NIÊN NĂM A');
});

test('Epiphany Jan 7 (2024) -> Baptism Monday, Jan 14 is OT II', () => {
  assert.equal(t('2024-01-07'), 'LỄ CHÚA HIỂN LINH');
  assert.equal(t('2024-01-14'), 'CHÚA NHẬT II THƯỜNG NIÊN NĂM B');
});

test('Epiphany Jan 2 (2028) -> Baptism Jan 9', () => {
  assert.equal(t('2028-01-02'), 'LỄ CHÚA HIỂN LINH');
  assert.equal(t('2028-01-09'), 'LỄ CHÚA GIÊSU CHỊU PHÉP RỬA NĂM C');
  assert.equal(t('2028-01-16'), 'CHÚA NHẬT II THƯỜNG NIÊN NĂM C');
});

test('Lent and Easter 2026', () => {
  assert.equal(t('2026-02-22'), 'CHÚA NHẬT I MÙA CHAY NĂM A');
  assert.equal(t('2026-03-01'), 'CHÚA NHẬT II MÙA CHAY NĂM A');
  assert.equal(t('2026-03-22'), 'CHÚA NHẬT V MÙA CHAY NĂM A');
  assert.equal(t('2026-03-29'), 'CHÚA NHẬT LỄ LÁ NĂM A');
  assert.equal(t('2026-04-05'), 'CHÚA NHẬT PHỤC SINH');
  assert.equal(t('2026-04-12'), 'CHÚA NHẬT II PHỤC SINH - LÒNG CHÚA THƯƠNG XÓT NĂM A');
  assert.equal(t('2026-04-19'), 'CHÚA NHẬT III PHỤC SINH NĂM A');
  assert.equal(t('2026-05-10'), 'CHÚA NHẬT VI PHỤC SINH NĂM A');
  assert.equal(t('2026-05-17'), 'LỄ CHÚA THĂNG THIÊN NĂM A');
  assert.equal(t('2026-05-24'), 'LỄ CHÚA THÁNH THẦN HIỆN XUỐNG NĂM A');
  assert.equal(t('2026-05-31'), 'LỄ CHÚA BA NGÔI NĂM A');
  assert.equal(t('2026-06-07'), 'LỄ MÌNH MÁU THÁNH CHÚA KITÔ NĂM A');
  assert.equal(t('2026-06-14'), 'CHÚA NHẬT XI THƯỜNG NIÊN NĂM A');
});

test('End of year 2026', () => {
  assert.equal(t('2026-11-01'), 'LỄ CÁC THÁNH NAM NỮ');
  assert.equal(t('2026-11-08'), 'CHÚA NHẬT XXXII THƯỜNG NIÊN NĂM A');
  assert.equal(t('2026-11-15'), 'CHÚA NHẬT XXXIII THƯỜNG NIÊN NĂM A');
  assert.equal(t('2026-11-22'), 'LỄ CHÚA GIÊSU KITÔ VUA VŨ TRỤ NĂM A');
  assert.equal(t('2026-11-29'), 'CHÚA NHẬT I MÙA VỌNG NĂM B');
});

test('2027 Easter cycle', () => {
  assert.equal(t('2027-03-21'), 'CHÚA NHẬT LỄ LÁ NĂM B');
  assert.equal(t('2027-03-28'), 'CHÚA NHẬT PHỤC SINH');
  assert.equal(t('2027-05-16'), 'LỄ CHÚA THÁNH THẦN HIỆN XUỐNG NĂM B');
  assert.equal(t('2027-05-23'), 'LỄ CHÚA BA NGÔI NĂM B');
  assert.equal(t('2027-05-30'), 'LỄ MÌNH MÁU THÁNH CHÚA KITÔ NĂM B');
  assert.equal(t('2027-06-06'), 'CHÚA NHẬT X THƯỜNG NIÊN NĂM B');
  assert.equal(t('2027-08-15'), 'LỄ ĐỨC MẸ LÊN TRỜI');
});

test('fixed feasts replacing Ordinary Time Sundays', () => {
  assert.equal(t('2025-09-14'), 'LỄ SUY TÔN THÁNH GIÁ');
  assert.equal(t('2025-11-02'), 'LỄ CẦU CHO CÁC TÍN HỮU ĐÃ QUA ĐỜI');
  assert.equal(t('2025-11-09'), 'LỄ CUNG HIẾN THÁNH ĐƯỜNG LATERANÔ');
  assert.equal(t('2025-08-10'), 'CHÚA NHẬT XIX THƯỜNG NIÊN NĂM C');
  assert.equal(t('2025-06-29'), 'LỄ THÁNH PHÊRÔ VÀ PHAOLÔ TÔNG ĐỒ');
  assert.equal(t('2025-08-17'), 'CHÚA NHẬT XX THƯỜNG NIÊN NĂM C');
  assert.equal(t('2025-02-02'), 'LỄ DÂNG CHÚA GIÊSU TRONG ĐỀN THÁNH');
  assert.equal(t('2025-02-09'), 'CHÚA NHẬT V THƯỜNG NIÊN NĂM C');
  assert.equal(t('2029-06-24'), 'LỄ SINH NHẬT THÁNH GIOAN TẨY GIẢ');
  assert.equal(t('2027-06-06'), 'CHÚA NHẬT X THƯỜNG NIÊN NĂM B');
  assert.equal(t('2032-08-15'), 'LỄ ĐỨC MẸ LÊN TRỜI');
  assert.equal(t('2028-08-06'), 'LỄ CHÚA HIỂN DUNG');
});

test('Sep 13 2026 not overridden (Sep 14 is Monday)', () => {
  assert.equal(t('2026-09-13'), 'CHÚA NHẬT XXIV THƯỜNG NIÊN NĂM A');
});

test('Nov 24 on Sunday collides with Christ the King -> Christ the King wins', () => {
  assert.equal(t('2024-11-24'), 'LỄ CHÚA GIÊSU KITÔ VUA VŨ TRỤ NĂM B');
  assert.equal(t('2019-11-24'), 'LỄ CHÚA GIÊSU KITÔ VUA VŨ TRỤ NĂM C');
});

test('Corpus Christi beats Jun 24 / Jun 29 when on the same Sunday', () => {
  // 2038: Easter Apr 25 -> Corpus Christi Jun 27
  assert.equal(t('2038-06-27'), 'LỄ MÌNH MÁU THÁNH CHÚA KITÔ NĂM A');
  // 2011: Easter Apr 24 -> Trinity Jun 19, Corpus Christi Jun 26
  assert.equal(t('2011-06-26'), 'LỄ MÌNH MÁU THÁNH CHÚA KITÔ NĂM A');
});

test('every Sunday of several years has a title and OT numbers are within II..XXXIII', () => {
  for (const s of getSundaysInRange('2020-01-01', '2040-12-31')) {
    const title = t(s);
    assert.ok(title.length > 0, s);
    const mm = /^CHÚA NHẬT ([IVXL]+) THƯỜNG NIÊN/.exec(title);
    if (mm) {
      assert.ok(!['I', 'XXXIV'].includes(mm[1]), `${s}: ${title}`);
    }
  }
});

test('OT numbering is contiguous before Lent and after Corpus Christi', () => {
  const sundays = getSundaysInRange('2026-01-01', '2026-11-28');
  const romans = sundays
    .map(t)
    .map((x) => /^CHÚA NHẬT ([IVXL]+) THƯỜNG NIÊN/.exec(x)?.[1])
    .filter(Boolean);
  assert.deepEqual(romans.slice(0, 5), ['II', 'III', 'IV', 'V', 'VI']);
  assert.equal(romans[romans.length - 1], 'XXXIII');
});

test('getSundaysInRange', () => {
  assert.deepEqual(getSundaysInRange('2026-09-01', '2026-09-30'), [
    '2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27',
  ]);
  assert.deepEqual(getSundaysInRange('2026-09-06', '2026-09-06'), ['2026-09-06']);
  assert.deepEqual(getSundaysInRange('2026-09-07', '2026-09-12'), []);
  assert.deepEqual(getSundaysInRange('2024-02-25', '2024-03-03'), ['2024-02-25', '2024-03-03']);
});

test('getSundaysOfMonths', () => {
  assert.deepEqual(getSundaysOfMonths(2026, 9, 1), [
    '2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27',
  ]);
  const s = getSundaysOfMonths(2026, 11, 3); // Nov 2026 - Jan 2027
  assert.equal(s[0], '2026-11-01');
  assert.equal(s[s.length - 1], '2027-01-31');
  assert.equal(s.length, 5 + 4 + 5);
  assert.deepEqual(getSundaysOfMonths(2024, 2, 1), [
    '2024-02-04', '2024-02-11', '2024-02-18', '2024-02-25',
  ]);
  assert.deepEqual(getSundaysOfMonths(2026, 1, 0), []);
});
