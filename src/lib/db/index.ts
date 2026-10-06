import "server-only";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { DDL } from "./ddl";
import * as schema from "./schema";

export type DB = NeonHttpDatabase<typeof schema>;


const DEFAULT_CLASSES = [
  "Khai Tâm 1",
  "Khai Tâm 2",
  "Rước Lễ 1",
  "Rước Lễ 2",
  "Thêm Sức 1",
  "Thêm Sức 2",
  "Thêm Sức 3",
  "Bao Đồng 1",
  "Bao Đồng 2",
];

async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema });
  }
  if (process.env.VERCEL) {
    throw new Error(
      "Chưa cấu hình DATABASE_URL. Hãy thêm Neon Postgres trong Vercel → Storage.",
    );
  }
  // Dev local: PGlite (Postgres nhúng), dữ liệu lưu ở ./.data
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { mkdirSync } = await import("node:fs");
  mkdirSync("./.data", { recursive: true });
  const client = new PGlite("./.data/pglite");
  return drizzle(client, { schema }) as unknown as DB;
}

// Tăng số này khi đổi cấu trúc bảng trong ddl.ts
const SCHEMA_VERSION = "2";

async function init(): Promise<DB> {
  const db = await createDb();
  // Đường nhanh: DB đã được khởi tạo → chỉ tốn 1 truy vấn
  try {
    const v = await db.execute(sql`SELECT value FROM settings WHERE key = 'schema_version'`);
    if ((v.rows[0] as { value?: string } | undefined)?.value === SCHEMA_VERSION) return db;
  } catch {
    // bảng chưa tồn tại
  }
  for (const stmt of DDL) await db.execute(sql.raw(stmt));
  const seeded = await db.execute(sql`SELECT value FROM settings WHERE key = 'seeded'`);
  if (seeded.rows.length === 0) {
    const count = await db.execute(sql`SELECT COUNT(*)::int AS n FROM class_levels`);
    if (Number((count.rows[0] as { n: number }).n) === 0) {
      await db.insert(schema.classLevels).values(
        DEFAULT_CLASSES.map((name, i) => ({ name, sortOrder: i })),
      );
    }
    await db.insert(schema.settings).values({ key: "seeded", value: "1" }).onConflictDoNothing();
  }
  await db
    .insert(schema.settings)
    .values({ key: "schema_version", value: SCHEMA_VERSION })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: SCHEMA_VERSION } });
  return db;
}

const g = globalThis as unknown as { __docsachDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  if (!g.__docsachDb) {
    g.__docsachDb = init().catch((e) => {
      g.__docsachDb = undefined;
      throw e;
    });
  }
  return g.__docsachDb;
}

export { schema };
