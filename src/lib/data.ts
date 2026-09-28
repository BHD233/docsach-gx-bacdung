import "server-only";
import { and, asc, gte, lte } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getDb, schema } from "./db";

/** Mọi dữ liệu đọc đều được cache với tag này; server action gọi updateTag(DATA_TAG) sau khi ghi. */
export const DATA_TAG = "data";
// Lưới an toàn khi DB bị sửa ngoài app (script nhập dữ liệu): tự làm mới sau 10 phút.
const cached = <A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string) =>
  unstable_cache(fn, [key], { tags: [DATA_TAG], revalidate: 600 });

export interface SiteSettings {
  siteTitle: string;
  parishName: string;
  massLabel: string;
  /** "1": NGÂN / T. NGÂN · "2": LINH ĐAN */
  nameStyle: "1" | "2";
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteTitle: "LỊCH ĐỌC SÁCH THIẾU NHI",
  parishName: "Ban Đọc Sách Thiếu Nhi",
  massLabel: "Thánh lễ Thiếu Nhi",
  nameStyle: "1",
};

async function getSettingsRaw(): Promise<SiteSettings> {
  const db = await getDb();
  const rows = await db.select().from(schema.settings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    siteTitle: map.siteTitle || DEFAULT_SETTINGS.siteTitle,
    parishName: map.parishName || DEFAULT_SETTINGS.parishName,
    massLabel: map.massLabel ?? DEFAULT_SETTINGS.massLabel,
    nameStyle: map.nameStyle === "2" ? "2" : "1",
  };
}

async function listClassesRaw() {
  const db = await getDb();
  return db
    .select()
    .from(schema.classLevels)
    .orderBy(asc(schema.classLevels.sortOrder), asc(schema.classLevels.id));
}

async function listMembersRaw() {
  const db = await getDb();
  return db.select().from(schema.members).orderBy(asc(schema.members.id));
}

async function listCatechistsRaw() {
  const db = await getDb();
  return db
    .select()
    .from(schema.catechists)
    .orderBy(asc(schema.catechists.sortOrder), asc(schema.catechists.id));
}

async function listWeeksRaw(start?: string, end?: string) {
  const db = await getDb();
  const conds = [];
  if (start) conds.push(gte(schema.weeks.date, start));
  if (end) conds.push(lte(schema.weeks.date, end));
  return db
    .select()
    .from(schema.weeks)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(schema.weeks.date));
}

export const getSettings = cached(getSettingsRaw, "settings");
export const listClasses = cached(listClassesRaw, "classes");
export const listMembers = cached(listMembersRaw, "members");
export const listCatechists = cached(listCatechistsRaw, "catechists");
export const listWeeks = cached(listWeeksRaw, "weeks");
