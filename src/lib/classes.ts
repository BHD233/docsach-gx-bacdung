import type { ClassLevel } from "./db/schema";

export interface ClassInfo {
  name: string;
  graduated: boolean;
}

/**
 * Lớp hiện tại = vị trí lớp được gán + số năm học đã trôi qua kể từ khi gán.
 * Mỗi 1/9 các em tự động lên 1 lớp theo thứ tự danh sách lớp.
 */
export function currentClass(
  classes: ClassLevel[],
  classId: number | null,
  baseYear: number | null,
  schoolYear: number,
): ClassInfo | null {
  if (classId == null || baseYear == null) return null;
  const sorted = [...classes].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const idx = sorted.findIndex((c) => c.id === classId);
  if (idx < 0) return null;
  const now = idx + (schoolYear - baseYear);
  if (now >= sorted.length) return { name: "Đã hoàn thành", graduated: true };
  if (now < 0) return { name: sorted[0].name, graduated: false };
  return { name: sorted[now].name, graduated: false };
}

/** Tìm id lớp tương ứng lớp hiện tại (để hiển thị trong form sửa). */
export function currentClassId(
  classes: ClassLevel[],
  classId: number | null,
  baseYear: number | null,
  schoolYear: number,
): number | null {
  if (classId == null || baseYear == null) return null;
  const sorted = [...classes].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const idx = sorted.findIndex((c) => c.id === classId);
  if (idx < 0) return null;
  const now = idx + (schoolYear - baseYear);
  if (now < 0 || now >= sorted.length) return null;
  return sorted[now].id;
}
