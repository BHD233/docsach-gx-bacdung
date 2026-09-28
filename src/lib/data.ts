import "server-only";
import { and, asc, gte, lte } from "drizzle-orm";
import { getDb, schema } from "./db";

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

export async function getSettings(): Promise<SiteSettings> {
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

export async function listClasses() {
  const db = await getDb();
  return db
    .select()
    .from(schema.classLevels)
    .orderBy(asc(schema.classLevels.sortOrder), asc(schema.classLevels.id));
}

export async function listMembers() {
  const db = await getDb();
  return db.select().from(schema.members).orderBy(asc(schema.members.id));
}

export async function listCatechists() {
  const db = await getDb();
  return db
    .select()
    .from(schema.catechists)
    .orderBy(asc(schema.catechists.sortOrder), asc(schema.catechists.id));
}

export async function listWeeks(start?: string, end?: string) {
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
