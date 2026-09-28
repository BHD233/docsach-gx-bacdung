// Nhập danh sách thành viên + lịch cũ từ file JSON.
//   Local (PGlite, tắt dev server trước):  npm run import:data
//   Production (Neon):                      DATABASE_URL="postgres://..." npm run import:data
// Mặc định THAY THẾ toàn bộ thành viên và lịch hiện có. Lớp, GLV, cài đặt giữ nguyên.
import { readFileSync, mkdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { DDL } from "../src/lib/db/ddl";
import * as schema from "../src/lib/db/schema";
import { getSundayTitle } from "../src/lib/liturgical";

type Role = string | null;
interface Input {
  members: { key: string; saintName: string; fullName: string; gender: "M" | "F" }[];
  weeks: { date: string; title?: string; reading1: Role; reading2: Role; prayer: Role; note?: string }[];
}

async function getDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    console.log("→ Ghi vào Postgres theo DATABASE_URL");
    return drizzle(neon(url), { schema });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  mkdirSync("./.data", { recursive: true });
  console.log("→ Ghi vào PGlite local (./.data)");
  return drizzle(new PGlite("./.data/pglite"), { schema }) as unknown as Awaited<ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>>>;
}

async function main() {
  const file = process.argv[2] || "data/ban-doc-sach.json";
  const input: Input = JSON.parse(readFileSync(file, "utf8"));
  const db = await getDb();
  for (const stmt of DDL) await db.execute(sql.raw(stmt));

  await db.delete(schema.weeks);
  await db.delete(schema.members);

  const idByKey = new Map<string, number>();
  for (const m of input.members) {
    const [row] = await db
      .insert(schema.members)
      .values({ saintName: m.saintName, fullName: m.fullName, gender: m.gender, baseCount: 0 })
      .returning({ id: schema.members.id });
    idByKey.set(m.key.toLowerCase(), row.id);
  }
  const ref = (k: Role) => {
    if (!k) return null;
    const id = idByKey.get(k.toLowerCase());
    if (!id) throw new Error(`Không tìm thấy thành viên "${k}" trong danh sách`);
    return id;
  };
  for (const w of input.weeks) {
    await db.insert(schema.weeks).values({
      date: w.date,
      title: w.title || getSundayTitle(w.date),
      reading1Id: ref(w.reading1),
      reading2Id: ref(w.reading2),
      prayerId: ref(w.prayer),
      note: w.note ?? "",
    });
  }
  console.log(`✓ Đã nhập ${input.members.length} thành viên và ${input.weeks.length} tuần lịch cũ.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
