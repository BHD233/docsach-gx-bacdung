"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { randomSchedule, saveWeeks } from "@/app/actions";
import { addDays, formatDM, formatDMY, parseISO, weekdayVN } from "@/lib/dates";
import { computeStats, validateSchedule, type Violation, type WeekAssignment } from "@/lib/scheduler";
import { fingerprint } from "@/lib/fingerprint";
import { FEAST_SUGGESTIONS, SPECIAL_DEFAULT_TITLE, defaultTitle } from "@/lib/titles";
import ConfirmButton from "@/components/ConfirmButton";
import MemberPicker, { type PickerMember } from "./MemberPicker";

interface Row {
  date: string;
  title: string;
  note: string;
  reading1Id: number | null;
  reading2Id: number | null;
  prayerId: number | null;
  skip: boolean;
  saved: boolean;
  special: boolean;
}

interface M extends PickerMember {
  baseCount: number;
}

type RoleKey = "reading1Id" | "reading2Id" | "prayerId";
type CellRef = { date: string; role: RoleKey };

const ROLES: { key: RoleKey; label: string }[] = [
  { key: "reading1Id", label: "Bài đọc 1" },
  { key: "reading2Id", label: "Bài đọc 2" },
  { key: "prayerId", label: "Lời nguyện" },
];

const dayDiff = (a: string, b: string) => Math.abs(parseISO(a).getTime() - parseISO(b).getTime()) / 86400000;

export default function ScheduleEditor({
  initialRows,
  outside,
  members,
  windowStart,
  windowEnd,
  baseline: initialBaseline,
}: {
  initialRows: Row[];
  outside: WeekAssignment[];
  members: M[];
  windowStart: string;
  windowEnd: string;
  baseline: Record<string, string | null>;
}) {
  const [rows, setRows] = useState(initialRows);
  const [removed, setRemoved] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [swapFrom, setSwapFrom] = useState<CellRef | null>(null);
  const [undoStack, setUndoStack] = useState<{ rows: Row[]; removed: string[]; label: string }[]>([]);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [baseline, setBaseline] = useState(initialBaseline);
  const [saveError, setSaveError] = useState("");
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!swapFrom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSwapFrom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [swapFrom]);

  // Cảnh báo khi rời trang mà chưa lưu
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const active = useMemo(() => members.filter((m) => m.active), [members]);
  const sched = useMemo(() => active.map((m) => ({ id: m.id, gender: m.gender, baseCount: m.baseCount })), [active]);

  const liveRows = useMemo(() => rows.filter((r) => !r.skip), [rows]);
  const timeline = useMemo<WeekAssignment[]>(
    () => [
      ...outside,
      ...liveRows.map((r) => ({ date: r.date, reading1: r.reading1Id, reading2: r.reading2Id, prayer: r.prayerId })),
    ],
    [outside, liveRows],
  );
  const violations = useMemo(() => {
    const inWindow = new Set(rows.map((r) => r.date));
    // Ngày còn trống hoàn toàn thì không báo lỗi "thiếu người"
    const empty = new Set(rows.filter((r) => !r.reading1Id && !r.reading2Id && !r.prayerId).map((r) => r.date));
    return validateSchedule(sched, timeline).filter(
      (v) => inWindow.has(v.date) && !(v.kind === "missing" && empty.has(v.date)),
    );
  }, [sched, timeline, rows]);
  const badCells = new Set(violations.flatMap((v) => v.memberIds.map((id) => `${v.date}:${id}`)));
  const stats = useMemo(() => computeStats(sched, timeline), [sched, timeline]);
  const totals = useMemo(() => new Map(stats.map((s) => [s.id, s.total])), [stats]);
  const minEffective = stats.length ? Math.min(...stats.map((s) => s.effective)) : 0;
  const windowCount = useMemo(() => {
    const c = new Map<number, number>();
    for (const r of liveRows) for (const id of [r.reading1Id, r.reading2Id, r.prayerId]) if (id) c.set(id, (c.get(id) ?? 0) + 1);
    return c;
  }, [liveRows]);

  /** Các em đã có lịch trong vòng 7 ngày quanh ngày `date` (kể cả cùng ngày). */
  const busyFor = (date: string) => {
    const s = new Set<number>();
    for (const w of timeline) {
      if (dayDiff(w.date, date) > 7) continue;
      for (const id of [w.reading1, w.reading2, w.prayer]) if (id) s.add(id);
    }
    return s;
  };

  /** Diễn giải lỗi kèm tên các bạn liên quan. */
  const describe = (v: Violation) => {
    const names = (ids: number[]) => {
      const list = ids.map((id) => byId.get(id)?.short ?? "?");
      return list.length > 6 ? `${list.slice(0, 5).join(", ")} và ${list.length - 5} bạn khác` : list.join(", ");
    };
    if (v.kind === "fairness" && v.waitingIds) {
      const waiting = new Set(v.waitingIds);
      const repeaters = v.memberIds.filter((id) => !waiting.has(id));
      return `${names(repeaters)} đọc lần nữa trong khi ${names(v.waitingIds)} chưa được đọc vòng này.`;
    }
    const msg = v.message.replace(/^Ngày \d{1,2}\/\d{1,2}:\s*/, "");
    const cap = msg.charAt(0).toLocaleUpperCase("vi-VN") + msg.slice(1);
    return v.memberIds.length ? `${cap} (${names(v.memberIds)})` : cap;
  };

  const hasAssignments = rows.some((r) => r.reading1Id || r.reading2Id || r.prayerId);

  /** Lưu trạng thái hiện tại để có thể Hoàn tác các thao tác hàng loạt. */
  function snapshot(label: string) {
    setUndoStack((st) => [...st.slice(-19), { rows, removed, label }]);
  }

  function undo() {
    const last = undoStack.at(-1);
    if (!last) return;
    setRows(last.rows);
    setRemoved(last.removed);
    setUndoStack((st) => st.slice(0, -1));
    setSwapFrom(null);
    setDirty(true);
    setMsg(`Đã hoàn tác: ${last.label}`);
  }

  function touch() {
    setDirty(true);
    setMsg("");
  }

  function patch(date: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.date === date ? { ...r, ...p } : r)));
    touch();
  }

  function clickSwap(cell: CellRef) {
    if (!swapFrom) return setSwapFrom(cell);
    if (swapFrom.date === cell.date && swapFrom.role === cell.role) return setSwapFrom(null);
    const a = rows.find((r) => r.date === swapFrom.date)![swapFrom.role];
    const b = rows.find((r) => r.date === cell.date)![cell.role];
    setRows((rs) =>
      rs.map((r) => {
        let x = r;
        if (r.date === swapFrom.date) x = { ...x, [swapFrom.role]: b };
        if (r.date === cell.date) x = { ...x, [cell.role]: a };
        return x;
      }),
    );
    const name = (id: number | null) => (id ? byId.get(id)?.short : "(trống)");
    snapshot(`đổi ${name(a)} ⇄ ${name(b)}`);
    setSwapFrom(null);
    touch();
    setMsg(`Đã đổi ${name(a)} ⇄ ${name(b)} — nhớ bấm Lưu.`);
  }

  /** Thêm ngày lễ; trả về thông báo lỗi nếu không hợp lệ. */
  function addFeast(date: string, title: string): string | null {
    if (!date) return "Chọn ngày trước đã";
    if (date < windowStart || date > windowEnd)
      return `Ngày lễ phải nằm trong kỳ ${formatDMY(windowStart)} – ${formatDMY(windowEnd)}`;
    if (rows.some((r) => r.date === date)) return "Ngày này đã có trong lịch — hãy sửa tên lễ ở ngày đó";
    const row: Row = {
      date,
      title: title.trim().toLocaleUpperCase("vi-VN") || SPECIAL_DEFAULT_TITLE,
      note: "",
      reading1Id: null,
      reading2Id: null,
      prayerId: null,
      skip: false,
      saved: false,
      special: true,
    };
    snapshot(`thêm ngày lễ ${formatDM(date)}`);
    setRows((rs) => [...rs, row].sort((x, y) => x.date.localeCompare(y.date)));
    setRemoved((d) => d.filter((x) => x !== date));
    setInsertAt(null);
    touch();
    return null;
  }

  function removeFeast(r: Row) {
    snapshot(`xoá ngày lễ ${formatDM(r.date)}`);
    setRows((rs) => rs.filter((x) => x.date !== r.date));
    if (r.saved) setRemoved((d) => [...d, r.date]);
    touch();
  }

  function doRandom() {
    start(async () => {
      const res = await randomSchedule(liveRows.map((r) => r.date));
      const map = new Map(res.weeks.map((w) => [w.date, w]));
      if (map.size === 0) {
        setWarnings(res.warnings);
        return;
      }
      snapshot("chia ngẫu nhiên");
      setRows((rs) =>
        rs.map((r) => {
          const w = map.get(r.date);
          return w ? { ...r, reading1Id: w.reading1Id, reading2Id: w.reading2Id, prayerId: w.prayerId } : r;
        }),
      );
      setWarnings(res.warnings);
      setSwapFrom(null);
      setDirty(true);
      setRound((n) => n + 1);
      setMsg("Đã chia lịch ngẫu nhiên — bấm lại để chia kiểu khác, hoặc bấm Lưu để công bố.");
    });
  }

  function doSave() {
    start(async () => {
      const removeDates = [...rows.filter((r) => r.skip).map((r) => r.date), ...removed];
      // Không tạo dòng rỗng cho tuần chưa từng lưu và chưa điền gì
      const toSave = liveRows.filter(
        (r) =>
          r.saved ||
          r.special ||
          r.reading1Id ||
          r.reading2Id ||
          r.prayerId ||
          r.note.trim() ||
          r.title.trim() !== defaultTitle(r.date),
      );
      const res = await saveWeeks(toSave, removeDates, baseline);
      if (!res.ok) {
        setSaveError(res.error);
        setMsg("");
        return;
      }
      setSaveError("");
      // Cập nhật baseline theo đúng những gì vừa lưu
      setBaseline((b) => {
        const next = { ...b };
        for (const r of toSave)
          next[r.date] = fingerprint({ ...r, title: r.title.trim() || defaultTitle(r.date), note: r.note.trim() });
        for (const d of removeDates) next[d] = null;
        return next;
      });
      const savedDates = new Set(toSave.map((r) => r.date));
      setRows((rs) => rs.map((r) => ({ ...r, saved: savedDates.has(r.date) })));
      setRemoved([]);
      setDirty(false);
      setMsg("✓ Đã lưu lịch.");
    });
  }

  function clearAll() {
    snapshot("xoá phân công");
    setSwapFrom(null);
    setRows((rs) => rs.map((r) => ({ ...r, reading1Id: null, reading2Id: null, prayerId: null })));
    touch();
    setMsg("Đã xoá phân công (chưa lưu) — bấm Hoàn tác nếu lỡ tay.");
  }

  const swapName = swapFrom ? rows.find((r) => r.date === swapFrom.date)?.[swapFrom.role] : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="card sticky top-2 z-20 space-y-3 p-3 sm:top-16">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary w-52" onClick={doRandom} disabled={pending || active.length < 3}>
              🎲 {pending ? "Đang chia…" : round > 0 ? "Chia lại" : "Chia lịch ngẫu nhiên"}
            </button>
            <button className="btn-primary bg-emerald-700 hover:bg-emerald-800" onClick={doSave} disabled={pending || !dirty}>
              💾 Lưu lịch
            </button>
            <button className="btn-ghost" onClick={clearAll} disabled={pending || !hasAssignments}>
              Xoá phân công
            </button>
            <button className="btn-ghost" onClick={undo} disabled={pending || undoStack.length === 0} title={undoStack.at(-1)?.label}>
              ↶ Hoàn tác
            </button>
            <span className="text-sm text-stone-500">
              {pending ? "Đang xử lý…" : msg || (dirty ? "Có thay đổi chưa lưu" : "")}
            </span>
          </div>
          {swapFrom && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
              ⇄ Đang đổi chỗ <b>{swapName ? byId.get(swapName)?.short : "(ô trống)"}</b> ({formatDM(swapFrom.date)}) — bấm
              nút ⇄ ở ô muốn đổi.
              <button className="ml-auto font-semibold underline" onClick={() => setSwapFrom(null)}>
                Huỷ (Esc)
              </button>
            </div>
          )}
        </div>

        {saveError && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">
            ⛔ Chưa lưu: {saveError}
            <button className="btn-ghost ml-auto" onClick={() => location.reload()}>
              Tải lại trang
            </button>
          </div>
        )}

        {active.length < 3 && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Cần ít nhất 3 thành viên đang hoạt động để chia lịch. Hãy thêm thành viên ở trang Thành viên.
          </div>
        )}

        {(warnings.length > 0 || violations.length > 0) && (
          <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {warnings.map((w, i) => (
              <div key={`w${i}`}>⚠️ {w}</div>
            ))}
            {violations.map((v, i) => (
              <div key={`v${i}`}>
                ❗ <b>{formatDM(v.date)}</b>: {describe(v)}
              </div>
            ))}
          </div>
        )}
        {violations.length === 0 && hasAssignments && (
          <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            ✓ Lịch hợp lệ: đủ nam/nữ ở Bài đọc 1 & 2, không ai đọc 2 lần trong 7 ngày, không ai đọc Lời nguyện 3 lần
            liên tiếp, số lần đọc chênh lệch tối đa 1.
          </div>
        )}

        {rows.map((r, idx) => (
          <div key={r.date} className="space-y-4">
          {idx > 0 && (
            <InsertSlot
              open={insertAt === idx}
              onOpen={() => setInsertAt(idx)}
              onClose={() => setInsertAt(null)}
              min={addDays(rows[idx - 1].date, 1)}
              max={addDays(r.date, -1)}
              onAdd={addFeast}
            />
          )}
          <div
            className={`card ${r.skip ? "opacity-60" : ""} ${r.special ? "border-sky-300 ring-1 ring-sky-200" : ""}`}
          >
            <div
              className={`flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-stone-100 px-4 py-2.5 ${
                r.special ? "bg-sky-50" : "bg-stone-50"
              }`}
            >
              <div>
                <div className="text-lg font-extrabold leading-tight">{formatDMY(r.date)}</div>
                <div className={`text-xs font-semibold ${r.special ? "text-sky-700" : "text-stone-500"}`}>
                  {weekdayVN(r.date)}
                  {r.special && " · Ngày lễ thêm"}
                </div>
              </div>
              <input
                className={`input min-w-[220px] flex-1 font-semibold uppercase ${r.special ? "text-sky-800" : "text-brand"}`}
                value={r.title}
                onChange={(e) => patch(r.date, { title: e.target.value })}
                aria-label="Tên lễ"
              />
              {r.special ? (
                <ConfirmButton onConfirm={() => removeFeast(r)} confirmLabel="Bấm lần nữa để xoá">
                  Xoá ngày lễ
                </ConfirmButton>
              ) : (
                <label className="flex items-center gap-1.5 text-sm text-stone-600">
                  <input type="checkbox" checked={r.skip} onChange={(e) => patch(r.date, { skip: e.target.checked })} />
                  Không có lịch tuần này
                </label>
              )}
            </div>
            {!r.skip && (
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {ROLES.map((role) => {
                  const val = r[role.key];
                  const bad = val != null && badCells.has(`${r.date}:${val}`);
                  const isSource = swapFrom?.date === r.date && swapFrom.role === role.key;
                  const busy = busyFor(r.date);
                  if (val != null) busy.delete(val);
                  return (
                    <div
                      key={role.key}
                      className={`rounded-xl ${isSource ? "bg-violet-100 p-1.5 ring-2 ring-violet-400" : swapFrom ? "bg-violet-50/60 p-1.5" : ""}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="label mb-0">{role.label}</span>
                        <button
                          type="button"
                          onClick={() => clickSwap({ date: r.date, role: role.key })}
                          className={`rounded-md px-1.5 text-xs font-semibold ${
                            isSource
                              ? "bg-violet-600 text-white"
                              : swapFrom
                                ? "bg-violet-600/90 text-white hover:bg-violet-700"
                                : "text-stone-400 hover:bg-stone-100 hover:text-violet-700"
                          }`}
                          title={swapFrom ? "Đổi với ô này" : "Chọn để đổi chỗ với một ô khác"}
                        >
                          {isSource ? "Huỷ" : swapFrom ? "⇄ Đổi với ô này" : "⇄ Đổi"}
                        </button>
                      </div>
                      <MemberPicker
                        members={members}
                        value={val}
                        onChange={(id) => patch(r.date, { [role.key]: id })}
                        counts={totals}
                        busy={busy}
                        invalid={bad}
                      />
                    </div>
                  );
                })}
                <div className="sm:col-span-3">
                  <input
                    className="input text-sm"
                    placeholder="Ghi chú (tuỳ chọn) — VD: Lễ bổn mạng, đổi giờ lễ…"
                    value={r.note}
                    onChange={(e) => patch(r.date, { note: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
          </div>
        ))}

        <div className="card border-dashed p-4">
          <h3 className="font-bold">+ Thêm ngày lễ khác</h3>
          <p className="text-xs text-stone-500">
            Chọn ngày bất kỳ trong kỳ (VD: Giáng Sinh, Trung Thu, Tết…), hoặc bấm “+ Thêm ngày lễ” giữa 2 ngày. Ngày lễ được chia lịch cùng các Chúa Nhật và tính vào số lần đọc.
          </p>
          <FeastForm min={windowStart} max={windowEnd} onAdd={addFeast} />
        </div>
      </div>

      <aside className="card h-fit p-4 lg:sticky lg:top-20">
        <h2 className="font-bold">Thống kê số lần đọc</h2>
        <p className="text-xs text-stone-500">Tính cả lịch đã lưu và lịch đang chỉnh. “Kỳ này” là số lần trong 2 tháng. “Đến lượt” = chưa đọc trong vòng hiện tại (vòng xong khi tất cả đã đọc 1 lần).</p>
        <div className="mt-3 max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-xs text-stone-500">
              <tr>
                <th className="py-1 text-left">Tên</th>
                <th className="py-1" title="Tổng số lần đọc">Tổng</th>
                <th className="py-1" title="Bài đọc 1 / Bài đọc 2 / Lời nguyện">B1/B2/LN</th>
                <th className="py-1">Kỳ này</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {[...stats]
                .sort(
                  (a, b) =>
                    a.effective - b.effective ||
                    (a.lastDate ?? "").localeCompare(b.lastDate ?? "") ||
                    (byId.get(a.id)?.short ?? "").localeCompare(byId.get(b.id)?.short ?? ""),
                )
                .map((s) => {
                  const m = byId.get(s.id);
                  const due = s.effective === minEffective;
                  return (
                    <tr key={s.id}>
                      <td className="py-1">
                        <span className={m?.gender === "F" ? "text-pink-700" : "text-sky-700"}>●</span> {m?.short}
                        {due && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">đến lượt</span>}
                        {s.lastDate && <div className="pl-4 text-[10px] text-stone-400">lần cuối {formatDM(s.lastDate)}</div>}
                      </td>
                      <td className="py-1 text-center font-semibold">{s.total}</td>
                      <td className="py-1 text-center text-stone-500">
                        {s.reading1}/{s.reading2}/{s.prayer}
                      </td>
                      <td className="py-1 text-center">{windowCount.get(s.id) ?? 0}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}

function FeastForm({
  min,
  max,
  onAdd,
  initialDate = "",
  onCancel,
}: {
  min: string;
  max: string;
  onAdd: (date: string, title: string) => string | null;
  initialDate?: string;
  onCancel?: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const err = onAdd(date, title);
    setError(err ?? "");
    if (!err) {
      setDate("");
      setTitle("");
    }
  };
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <input type="date" className="input w-auto" min={min} max={max} value={date} onChange={(e) => setDate(e.target.value)} />
        <input
          className="input min-w-[220px] flex-1 uppercase"
          list="feast-suggestions"
          placeholder="Tên lễ, VD: LỄ CHÚA GIÁNG SINH"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <datalist id="feast-suggestions">
          {FEAST_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="button" className="btn-primary" onClick={submit} disabled={!date}>
          Thêm
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Huỷ
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Nút nhỏ giữa 2 ngày để chèn ngày lễ vào đúng khoảng đó. */
function InsertSlot({
  open,
  onOpen,
  onClose,
  min,
  max,
  onAdd,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  min: string;
  max: string;
  onAdd: (date: string, title: string) => string | null;
}) {
  if (min > max) return null;
  if (!open)
    return (
      <div className="group flex items-center gap-2 text-xs text-stone-400">
        <div className="h-px flex-1 bg-stone-200 group-hover:bg-sky-300" />
        <button type="button" onClick={onOpen} className="rounded-full border border-dashed border-stone-300 px-3 py-0.5 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700">
          + Thêm ngày lễ ({formatDM(min)} – {formatDM(max)})
        </button>
        <div className="h-px flex-1 bg-stone-200 group-hover:bg-sky-300" />
      </div>
    );
  return (
    <div className="card border-sky-300 bg-sky-50/50 p-3">
      <div className="text-sm font-semibold text-sky-800">
        Thêm ngày lễ giữa {formatDM(addDays(min, -1))} và {formatDM(addDays(max, 1))}
      </div>
      <FeastForm min={min} max={max} onAdd={onAdd} initialDate={min === max ? min : ""} onCancel={onClose} />
    </div>
  );
}
