import { test } from "node:test";
import assert from "node:assert/strict";
import { currentClass, currentClassId } from "./classes";
import { schoolYearOf, upcomingSunday } from "./dates";
import { shortNames } from "./names";

const classes = [
  { id: 10, name: "Rước Lễ 1", sortOrder: 0 },
  { id: 11, name: "Rước Lễ 2", sortOrder: 1 },
  { id: 12, name: "Thêm Sức 1", sortOrder: 2 },
];

test("năm học bắt đầu 1/9", () => {
  assert.equal(schoolYearOf("2026-08-31"), 2025);
  assert.equal(schoolYearOf("2026-09-01"), 2026);
  assert.equal(schoolYearOf("2027-03-15"), 2026);
});

test("tự lên lớp mỗi năm học", () => {
  assert.equal(currentClass(classes, 10, 2026, 2026)?.name, "Rước Lễ 1");
  assert.equal(currentClass(classes, 10, 2026, 2027)?.name, "Rước Lễ 2");
  assert.equal(currentClass(classes, 10, 2026, 2028)?.name, "Thêm Sức 1");
  assert.deepEqual(currentClass(classes, 10, 2026, 2029), { name: "Đã hoàn thành", graduated: true });
  assert.equal(currentClassId(classes, 10, 2026, 2027), 11);
  assert.equal(currentClass(classes, null, null, 2026), null);
});

test("CN sắp tới", () => {
  assert.equal(upcomingSunday("2026-09-28"), "2026-10-04");
  assert.equal(upcomingSunday("2026-10-04"), "2026-10-04");
});

test("tên ngắn", () => {
  const m = shortNames([
    { id: 1, fullName: "Nguyễn Thị Ngân" },
    { id: 2, fullName: "Lê Kim Ngân" },
    { id: 3, fullName: "Trần Văn Toán" },
  ]);
  assert.equal(m.get(1), "T. NGÂN");
  assert.equal(m.get(2), "K. NGÂN");
  assert.equal(m.get(3), "TOÁN");
  const n = shortNames([
    { id: 1, fullName: "Lê Thị Mỹ Anh" },
    { id: 2, fullName: "Trần Minh Anh" },
    { id: 3, fullName: "Phạm Duy Anh" },
    { id: 4, fullName: "Đỗ Ngọc Bảo Thy" },
    { id: 5, fullName: "Hồ Mai Khánh Thy" },
  ]);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => n.get(i)), ["MỸ ANH", "MINH ANH", "DUY ANH", "B. THY", "K. THY"]);
});
