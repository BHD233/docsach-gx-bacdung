import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const classLevels = pgTable("class_levels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  saintName: text("saint_name").notNull().default(""),
  fullName: text("full_name").notNull(),
  gender: text("gender").notNull(), // 'M' | 'F'
  fatherName: text("father_name").notNull().default(""),
  motherName: text("mother_name").notNull().default(""),
  fatherPhone: text("father_phone").notNull().default(""),
  motherPhone: text("mother_phone").notNull().default(""),
  phone: text("phone").notNull().default(""),
  classId: integer("class_id"),
  // Năm học (năm bắt đầu, 1/9) tại thời điểm gán classId. Lớp hiện tại = classId + số năm đã trôi qua.
  classBaseYear: integer("class_base_year"),
  active: boolean("active").notNull().default(true),
  // Bù số lần đọc cho em vào sau, để thuật toán công bằng không dồn lịch cho em đó.
  baseCount: integer("base_count").notNull().default(0),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const catechists = pgTable("catechists", {
  id: serial("id").primaryKey(),
  saintName: text("saint_name").notNull().default(""),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().default(""),
  role: text("role").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const weeks = pgTable("weeks", {
  date: text("date").primaryKey(), // YYYY-MM-DD (Chúa Nhật)
  title: text("title").notNull().default(""),
  reading1Id: integer("reading1_id"),
  reading2Id: integer("reading2_id"),
  prayerId: integer("prayer_id"),
  note: text("note").notNull().default(""),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type ClassLevel = typeof classLevels.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Catechist = typeof catechists.$inferSelect;
export type Week = typeof weeks.$inferSelect;
