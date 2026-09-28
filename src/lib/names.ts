// Tên hiển thị ngắn kiểu "NGÂN", trùng thì thêm chữ đầu tên đệm: "T. NGÂN", "K. NGÂN".

interface Named {
  id: number;
  fullName: string;
}

function words(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

export function shortNames<T extends Named>(people: T[], style: "1" | "2" = "1"): Map<number, string> {
  const upper = (s: string) => s.toLocaleUpperCase("vi-VN");
  if (style === "2") return lastWords(people, upper);
  const byGiven = new Map<string, T[]>();
  for (const p of people) {
    const w = words(p.fullName);
    const given = upper(w[w.length - 1] ?? "");
    const arr = byGiven.get(given) ?? [];
    arr.push(p);
    byGiven.set(given, arr);
  }
  const out = new Map<number, string>();
  for (const [given, group] of byGiven) {
    if (group.length === 1) {
      out.set(group[0].id, given);
      continue;
    }
    // Trùng tên: thử chữ đầu tên đệm ("T. NGÂN", "K. NGÂN"). Nếu chữ đầu vẫn trùng
    // (Mỹ Anh / Minh Anh) thì cả nhóm dùng đủ 2 chữ cuối ("MỸ ANH", "MINH ANH", "DUY ANH").
    const initialOf = (p: T) => {
      const w = words(p.fullName);
      return w.length >= 2 ? upper(w[w.length - 2][0]) : "";
    };
    const initials = group.map(initialOf);
    const initialsUnique = initials.every((x) => x) && new Set(initials).size === group.length;
    for (const p of group) {
      if (initialsUnique) out.set(p.id, `${initialOf(p)}. ${given}`);
      else out.set(p.id, upper(words(p.fullName).slice(-2).join(" ")) || given);
    }
    const counts = new Map<string, number>();
    for (const p of group) counts.set(out.get(p.id)!, (counts.get(out.get(p.id)!) ?? 0) + 1);
    for (const p of group) {
      if ((counts.get(out.get(p.id)!) ?? 0) > 1) out.set(p.id, upper(p.fullName.trim()));
    }
  }
  return out;
}

/** Kiểu 2 chữ: "LINH ĐAN", "TÚ ANH"; trùng thì thêm dần chữ phía trước. */
function lastWords<T extends Named>(people: T[], upper: (s: string) => string): Map<number, string> {
  const out = new Map<number, string>();
  let n = 2;
  let pending = people;
  while (pending.length && n <= 6) {
    const label = (p: T) => upper(words(p.fullName).slice(-n).join(" "));
    const count = new Map<string, number>();
    for (const p of pending) count.set(label(p), (count.get(label(p)) ?? 0) + 1);
    const next: T[] = [];
    for (const p of pending) {
      if (count.get(label(p)) === 1 || n === 6) out.set(p.id, label(p));
      else next.push(p);
    }
    pending = next;
    n++;
  }
  return out;
}
