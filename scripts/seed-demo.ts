// Tạo dữ liệu mẫu cho môi trường local (PGlite). Chạy: npm run seed:demo  (khi dev server đang TẮT)
import { PGlite } from "@electric-sql/pglite";

const boys = ["Phước", "Hưởng", "Đức", "Toán", "Kiên", "Thịnh", "Hiệp", "Thông", "Lam", "Minh", "Khang", "Hưng", "Tín", "Tuấn"];
const girls = ["Vân", "Liễu", "Ngân", "Yến", "Hạnh", "Thúy", "Trúc", "Duyên", "Hồng", "Xuân", "Quỳnh", "Linh", "Dung", "Ngân"];
const ho = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Võ", "Đặng", "Bùi"];
const dem = { M: ["Văn", "Minh", "Quốc", "Gia"], F: ["Thị", "Ngọc", "Thanh", "Kim"] };
const saints = { M: ["Giuse", "Phêrô", "Gioan", "Phaolô", "Đaminh", "Antôn"], F: ["Maria", "Anna", "Têrêsa", "Cêcilia", "Rosa", "Agnès"] };

async function main() {
  (await import("node:fs")).mkdirSync("./.data", { recursive: true });
  const db = new PGlite("./.data/pglite");
  await db.exec(`CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY, saint_name TEXT NOT NULL DEFAULT '', full_name TEXT NOT NULL, gender TEXT NOT NULL,
    father_name TEXT NOT NULL DEFAULT '', mother_name TEXT NOT NULL DEFAULT '', father_phone TEXT NOT NULL DEFAULT '',
    mother_phone TEXT NOT NULL DEFAULT '', class_id INTEGER, class_base_year INTEGER, active BOOLEAN NOT NULL DEFAULT TRUE,
    base_count INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMP NOT NULL DEFAULT NOW())`);
  await db.exec(`CREATE TABLE IF NOT EXISTS catechists (id SERIAL PRIMARY KEY, saint_name TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0)`);
  const pick = <T,>(a: T[], i: number) => a[i % a.length];
  let i = 0;
  for (const [g, list] of [["M", boys], ["F", girls]] as const) {
    for (const given of list) {
      const full = `${pick(ho, i * 3)} ${pick(dem[g], i)} ${given}`;
      await db.query(
        `INSERT INTO members (saint_name, full_name, gender, father_name, mother_name, father_phone, mother_phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [pick(saints[g], i), full, g, `${pick(ho, i * 3)} Văn Ba`, `${pick(ho, i + 1)} Thị Mẹ`, `09000000${String(i).padStart(2, "0")}`, `09100000${String(i).padStart(2, "0")}`],
      );
      i++;
    }
  }
  await db.query(`INSERT INTO catechists (saint_name, full_name, phone, role) VALUES
    ('Giuse','Nguyễn Văn An','0901234567','Trưởng ban'), ('Maria','Trần Thị Bình','0907654321','Phó ban')`);
  console.log(`Đã thêm ${i} thành viên mẫu và 2 GLV.`);
  await db.close();
}
main();
