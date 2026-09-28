"use server";

import { eq, inArray, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { adminPassword, createSession, destroySession, isAdmin } from "@/lib/auth";
import { currentClass, currentClassId } from "@/lib/classes";
import { schoolYearOf, todayVN } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";
import { listClasses, listMembers, listWeeks } from "@/lib/data";
import { defaultTitle } from "@/lib/titles";
import { fingerprint } from "@/lib/fingerprint";
import { computeStats, generateSchedule, type SchedMember } from "@/lib/scheduler";

async function assertAdmin() {
  if (!(await isAdmin())) throw new Error("Bạn cần đăng nhập admin");
}

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

// ---------- Auth ----------

export async function login(_prev: { error?: string } | undefined, fd: FormData) {
  const pw = str(fd, "password");
  const expected = adminPassword();
  const a = Buffer.from(pw);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { error: "Sai mật khẩu" };
  }
  await createSession();
  const next = str(fd, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

// ---------- Members ----------

function toSched(m: typeof schema.members.$inferSelect): SchedMember {
  return { id: m.id, gender: m.gender === "F" ? "F" : "M", baseCount: m.baseCount };
}

/** Số lần đọc "hiệu dụng" nhỏ nhất hiện tại trong các em đang hoạt động. */
async function currentMinEffective(excludeId?: number) {
  const members = (await listMembers()).filter((m) => m.active && m.id !== excludeId);
  if (members.length === 0) return { min: 0, stats: new Map<number, number>() };
  const weeks = await listWeeks(undefined, todayVN());
  const stats = computeStats(
    members.map(toSched),
    weeks.map((w) => ({
      date: w.date,
      reading1: w.reading1Id,
      reading2: w.reading2Id,
      prayer: w.prayerId,
    })),
  );
  return {
    min: Math.min(...stats.map((s) => s.effective)),
    stats: new Map(stats.map((s) => [s.id, s.total])),
  };
}

export async function saveMember(fd: FormData) {
  await assertAdmin();
  const db = await getDb();
  const id = Number(fd.get("id") || 0);
  const fullName = str(fd, "fullName");
  if (!fullName) throw new Error("Thiếu họ tên");
  const gender = str(fd, "gender") === "F" ? "F" : "M";
  const classIdRaw = str(fd, "classId");
  const classId = classIdRaw ? Number(classIdRaw) : null;
  const active = fd.get("active") === "on" || fd.get("active") === "true";
  const values = {
    saintName: str(fd, "saintName"),
    fullName,
    gender,
    fatherName: str(fd, "fatherName"),
    motherName: str(fd, "motherName"),
    fatherPhone: str(fd, "fatherPhone"),
    motherPhone: str(fd, "motherPhone"),
    note: str(fd, "note"),
    active,
  };
  const year = schoolYearOf(todayVN());
  const classes = await listClasses();

  if (id) {
    const [old] = await db.select().from(schema.members).where(eq(schema.members.id, id));
    if (!old) throw new Error("Không tìm thấy thành viên");
    const oldCurrent = currentClassId(classes, old.classId, old.classBaseYear, year);
    const oldGraduated = currentClass(classes, old.classId, old.classBaseYear, year)?.graduated;
    const classChanged = classIdRaw === "graduated" ? !oldGraduated : oldCurrent !== classId || (oldGraduated && classId !== null);
    let classPatch = {};
    if (classIdRaw === "graduated") {
      if (!oldGraduated) classPatch = graduatedPatch(classes, year);
    } else if (classChanged) {
      classPatch = { classId, classBaseYear: classId ? year : null };
    }
    let basePatch = {};
    if (active && !old.active) {
      // Kích hoạt lại: bù để không bị dồn lịch
      const { min, stats } = await currentMinEffective(id);
      const actual = stats.get(id) ?? 0;
      basePatch = { baseCount: Math.max(old.baseCount, min - actual) };
    }
    await db
      .update(schema.members)
      .set({ ...values, ...classPatch, ...basePatch })
      .where(eq(schema.members.id, id));
  } else {
    const { min } = await currentMinEffective();
    await db.insert(schema.members).values({
      ...values,
      ...(classIdRaw === "graduated"
        ? graduatedPatch(classes, year)
        : { classId, classBaseYear: classId ? year : null }),
      baseCount: min,
    });
  }
  revalidateAll();
}

function graduatedPatch(classes: { id: number }[], year: number) {
  if (classes.length === 0) return { classId: null, classBaseYear: null };
  return { classId: classes[classes.length - 1].id, classBaseYear: year - 100 };
}

export async function deleteMember(id: number) {
  await assertAdmin();
  const db = await getDb();
  await db.delete(schema.members).where(eq(schema.members.id, id));
  revalidateAll();
}

// ---------- Catechists (GLV) ----------

export async function saveCatechist(fd: FormData) {
  await assertAdmin();
  const db = await getDb();
  const id = Number(fd.get("id") || 0);
  const values = {
    saintName: str(fd, "saintName"),
    fullName: str(fd, "fullName"),
    phone: str(fd, "phone"),
    role: str(fd, "role"),
  };
  if (!values.fullName) throw new Error("Thiếu họ tên");
  if (id) await db.update(schema.catechists).set(values).where(eq(schema.catechists.id, id));
  else await db.insert(schema.catechists).values({ ...values, sortOrder: Date.now() % 1e9 });
  revalidateAll();
}

export async function deleteCatechist(id: number) {
  await assertAdmin();
  const db = await getDb();
  await db.delete(schema.catechists).where(eq(schema.catechists.id, id));
  revalidateAll();
}

// ---------- Classes ----------

/**
 * Lưu danh sách lớp theo thứ tự mới. Trước khi đổi, "chốt" lớp hiện tại của từng em
 * để việc thêm/xoá/sắp xếp lớp không làm các em nhảy lớp.
 */
export async function saveClasses(list: { id?: number; name: string }[]) {
  await assertAdmin();
  const db = await getDb();
  const cleaned = list.map((c) => ({ ...c, name: c.name.trim() })).filter((c) => c.name);
  const year = schoolYearOf(todayVN());
  const oldClasses = await listClasses();
  const members = await listMembers();

  // 1. Chốt lớp hiện tại
  const snapshot = members.map((m) => ({
    id: m.id,
    graduated: !!currentClass(oldClasses, m.classId, m.classBaseYear, year)?.graduated,
    currentId: currentClassId(oldClasses, m.classId, m.classBaseYear, year),
  }));

  // 2. Cập nhật danh sách lớp
  const keepIds = cleaned.filter((c) => c.id).map((c) => c.id!) as number[];
  const removed = oldClasses.filter((c) => !keepIds.includes(c.id)).map((c) => c.id);
  if (removed.length) await db.delete(schema.classLevels).where(inArray(schema.classLevels.id, removed));
  const finalIds: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c.id && oldClasses.some((o) => o.id === c.id)) {
      await db
        .update(schema.classLevels)
        .set({ name: c.name, sortOrder: i })
        .where(eq(schema.classLevels.id, c.id));
      finalIds.push(c.id);
    } else {
      const [row] = await db
        .insert(schema.classLevels)
        .values({ name: c.name, sortOrder: i })
        .returning({ id: schema.classLevels.id });
      finalIds.push(row.id);
    }
  }

  // 3. Gán lại lớp cho các em theo lớp đã chốt
  const lastId = finalIds[finalIds.length - 1];
  for (const s of snapshot) {
    let patch: { classId: number | null; classBaseYear: number | null };
    if (s.graduated) patch = lastId ? { classId: lastId, classBaseYear: year - 100 } : { classId: null, classBaseYear: null };
    else if (s.currentId && finalIds.includes(s.currentId)) patch = { classId: s.currentId, classBaseYear: year };
    else patch = { classId: null, classBaseYear: null };
    await db.update(schema.members).set(patch).where(eq(schema.members.id, s.id));
  }
  revalidateAll();
}

// ---------- Settings ----------

export async function saveSettings(fd: FormData) {
  await assertAdmin();
  const db = await getDb();
  for (const key of ["siteTitle", "parishName", "massLabel", "nameStyle"]) {
    const value = str(fd, key);
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }
  revalidateAll();
}

// ---------- Schedule ----------

export interface WeekInput {
  date: string;
  title: string;
  reading1Id: number | null;
  reading2Id: number | null;
  prayerId: number | null;
  note: string;
}

export async function randomSchedule(dates: string[]) {
  await assertAdmin();
  const sorted = [...new Set(dates)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (sorted.length === 0) return { weeks: [], warnings: ["Không có Chúa Nhật nào để chia"] };
  const members = (await listMembers()).filter((m) => m.active);
  const db = await getDb();
  const history = await db.select().from(schema.weeks).where(lt(schema.weeks.date, sorted[0]));
  const result = generateSchedule({
    members: members.map(toSched),
    history: history.map((w) => ({
      date: w.date,
      reading1: w.reading1Id,
      reading2: w.reading2Id,
      prayer: w.prayerId,
    })),
    dates: sorted,
  });
  return {
    weeks: result.weeks.map((w) => ({
      date: w.date,
      reading1Id: w.reading1,
      reading2Id: w.reading2,
      prayerId: w.prayer,
    })),
    warnings: result.warnings,
  };
}

export async function saveWeeks(
  rows: WeekInput[],
  removeDates: string[],
  baseline: Record<string, string | null>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const db = await getDb();
  const clean = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
  const touched = [...new Set([...clean.map((r) => r.date), ...removeDates])];

  // 1. Chống ghi đè: dữ liệu trong DB phải giống lúc trang được mở
  if (touched.length) {
    const current = await db.select().from(schema.weeks).where(inArray(schema.weeks.date, touched));
    const now = new Map(current.map((w) => [w.date, fingerprint(w)]));
    const changed = touched.filter((d) => (now.get(d) ?? null) !== (baseline[d] ?? null));
    if (changed.length) {
      return {
        ok: false,
        error: `Lịch ngày ${changed.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)).join(", ")} đã được sửa ở nơi khác sau khi bạn mở trang. Hãy tải lại trang (F5) rồi làm lại để không ghi đè.`,
      };
    }
  }

  // 2. Chỉ chấp nhận thành viên đang tồn tại
  const ids = new Set((await listMembers()).map((m) => m.id));
  const bad = clean.flatMap((r) => [r.reading1Id, r.reading2Id, r.prayerId]).filter((id) => id && !ids.has(id));
  if (bad.length) return { ok: false, error: "Có thành viên không còn tồn tại trong lịch. Hãy tải lại trang (F5)." };

  for (const r of clean) {
    const values = {
      date: r.date,
      title: (r.title || "").trim() || defaultTitle(r.date),
      reading1Id: r.reading1Id || null,
      reading2Id: r.reading2Id || null,
      prayerId: r.prayerId || null,
      note: (r.note || "").trim(),
    };
    await db
      .insert(schema.weeks)
      .values(values)
      .onConflictDoUpdate({ target: schema.weeks.date, set: values });
  }
  const del = removeDates.filter((d) => !clean.some((r) => r.date === d));
  if (del.length) await db.delete(schema.weeks).where(inArray(schema.weeks.date, del));
  revalidateAll();
  return { ok: true };
}


// ---------- Backup ----------

export async function restoreFromBackup(text: string) {
  await assertAdmin();
  const { parseBackup, restoreBackup } = await import("@/lib/backup");
  try {
    const counts = await restoreBackup(parseBackup(text));
    revalidateAll();
    return { ok: true as const, counts };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Khôi phục thất bại" };
  }
}
