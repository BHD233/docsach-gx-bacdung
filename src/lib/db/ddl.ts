// Tạo bảng (idempotent) — dùng chung cho app và script nhập dữ liệu.
export const DDL = [
  `CREATE TABLE IF NOT EXISTS class_levels (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY,
    saint_name TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    father_name TEXT NOT NULL DEFAULT '',
    mother_name TEXT NOT NULL DEFAULT '',
    father_phone TEXT NOT NULL DEFAULT '',
    mother_phone TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    class_id INTEGER,
    class_base_year INTEGER,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    base_count INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS catechists (
    id SERIAL PRIMARY KEY,
    saint_name TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS weeks (
    date TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    reading1_id INTEGER,
    reading2_id INTEGER,
    prayer_id INTEGER,
    note TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''`,
];
