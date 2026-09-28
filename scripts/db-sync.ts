// Sao lưu / khôi phục TOÀN BỘ dữ liệu (lớp, thành viên, GLV, lịch, cài đặt), giữ nguyên id.
//   Sao lưu từ local (tắt dev server trước):   npm run db:dump            → data/backup.json
//   Sao lưu từ production:                     DATABASE_URL=... npm run db:dump
//   Khôi phục vào production:                  DATABASE_URL=... npm run db:restore
// Khôi phục sẽ XOÁ dữ liệu hiện có trong database đích rồi ghi lại từ file.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DDL } from "../src/lib/db/ddl";

const TABLES = ["class_levels", "members", "catechists", "weeks", "settings"] as const;
const SERIAL = ["class_levels", "members", "catechists"];

type Exec = (q: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

async function connect(): Promise<{ exec: Exec; close: () => Promise<void>; where: string }> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const q = neon(url);
    return {
      exec: async (text, params = []) => (await q.query(text, params)) as Record<string, unknown>[],
      close: async () => {},
      where: "Postgres (DATABASE_URL)",
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  mkdirSync("./.data", { recursive: true });
  const db = new PGlite("./.data/pglite");
  return {
    exec: async (text, params = []) => (await db.query(text, params)).rows as Record<string, unknown>[],
    close: () => db.close(),
    where: "PGlite local (./.data)",
  };
}

async function main() {
  const [cmd, file = "data/backup.json"] = process.argv.slice(2);
  const { exec, close, where } = await connect();
  for (const stmt of DDL) await exec(stmt);

  if (cmd === "dump") {
    const out: Record<string, unknown[]> = {};
    for (const t of TABLES) out[t] = await exec(`SELECT * FROM ${t}`);
    mkdirSync("data", { recursive: true });
    writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`✓ Đã sao lưu từ ${where} → ${file}:`, TABLES.map((t) => `${t}=${out[t].length}`).join(", "));
  } else if (cmd === "restore") {
    const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, unknown>[]>;
    for (const t of [...TABLES].reverse()) await exec(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      for (const row of data[t] ?? []) {
        const cols = Object.keys(row);
        await exec(
          `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
          cols.map((c) => row[c]),
        );
      }
    }
    for (const t of SERIAL)
      await exec(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
    console.log(`✓ Đã khôi phục vào ${where}:`, TABLES.map((t) => `${t}=${(data[t] ?? []).length}`).join(", "));
  } else {
    console.log("Dùng: tsx scripts/db-sync.ts dump|restore [file]");
  }
  await close();
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
