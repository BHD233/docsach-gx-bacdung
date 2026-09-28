/** Dấu vân tay của 1 tuần đã lưu — để phát hiện lịch bị sửa ở tab/máy khác trước khi ghi đè. */
export function fingerprint(w: {
  reading1Id: number | null;
  reading2Id: number | null;
  prayerId: number | null;
  title: string;
  note: string;
}): string {
  return JSON.stringify([w.reading1Id ?? null, w.reading2Id ?? null, w.prayerId ?? null, w.title, w.note]);
}
