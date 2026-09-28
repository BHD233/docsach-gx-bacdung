/** Chuẩn hoá để tìm kiếm không dấu: "Nguyễn Đức" → "nguyen duc". */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}
