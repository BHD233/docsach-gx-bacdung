import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

// Cùng định dạng với `npm run db:dump` (scripts/db-sync.ts): { tên_bảng: [dòng thô] }
export const BACKUP_TABLES = ["class_levels", "members", "catechists", "weeks", "settings"] as const;
const SERIAL = ["class_levels", "members", "catechists"];
const COLUMN = /^[a-z_][a-z0-9_]*$/;

export type Backup = Record<(typeof BACKUP_TABLES)[number], Record<string, unknown>[]>;

export async function exportBackup(): Promise<Backup> {
  const db = await getDb();
  const out = {} as Backup;
  for (const t of BACKUP_TABLES) out[t] = (await db.execute(sql.raw(`SELECT * FROM ${t}`))).rows as Record<string, unknown>[];
  return out;
}

export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("File không phải JSON hợp lệ");
  }
  if (!data || typeof data !== "object") throw new Error("File sao lưu không đúng định dạng");
  const d = data as Record<string, unknown>;
  for (const t of BACKUP_TABLES) {
    if (!Array.isArray(d[t])) throw new Error(`File sao lưu thiếu bảng "${t}"`);
    for (const row of d[t] as unknown[]) {
      if (!row || typeof row !== "object") throw new Error(`Dữ liệu bảng "${t}" không hợp lệ`);
      for (const c of Object.keys(row)) if (!COLUMN.test(c)) throw new Error(`Tên cột không hợp lệ: ${c}`);
    }
  }
  if (!(d.members as unknown[]).length) throw new Error("File sao lưu không có thành viên nào — huỷ để tránh xoá nhầm");
  return d as Backup;
}

/** Xoá toàn bộ dữ liệu hiện có rồi ghi lại từ bản sao lưu (giữ nguyên id). */
export async function restoreBackup(data: Backup) {
  const db = await getDb();
  for (const t of [...BACKUP_TABLES].reverse()) await db.execute(sql.raw(`DELETE FROM ${t}`));
  for (const t of BACKUP_TABLES) {
    for (const row of data[t]) {
      const cols = Object.keys(row);
      await db.execute(
        sql`INSERT INTO ${sql.raw(t)} (${sql.raw(cols.join(", "))}) VALUES (${sql.join(
          cols.map((c) => sql`${row[c] as string | number | boolean | null}`),
          sql`, `,
        )})`,
      );
    }
  }
  for (const t of SERIAL)
    await db.execute(
      sql.raw(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`),
    );
  return Object.fromEntries(BACKUP_TABLES.map((t) => [t, data[t].length])) as Record<string, number>;
}
