import { formatDM, isSunday, weekdayVN } from "@/lib/dates";

export interface ScheduleRow {
  date: string;
  title: string;
  note: string;
  reading1: string;
  reading2: string;
  prayer: string;
}

export default function ScheduleTable({
  rows,
  highlightDate,
}: {
  rows: ScheduleRow[];
  highlightDate?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-stone-800">
      <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] border-b-2 border-stone-800 bg-white text-center text-[11px] font-bold uppercase tracking-wide sm:text-sm">
        <div className="border-r border-stone-800 px-1 py-2.5">Ngày tháng</div>
        <div className="border-r border-stone-800 px-1 py-2.5">Bài đọc 1</div>
        <div className="border-r border-stone-800 px-1 py-2.5">Bài đọc 2</div>
        <div className="px-1 py-2.5">Lời nguyện</div>
      </div>
      {rows.length === 0 && (
        <div className="bg-white px-4 py-10 text-center text-stone-500">Chưa có lịch cho tháng này.</div>
      )}
      {rows.map((r, i) => {
        const hl = r.date === highlightDate;
        const special = !isSunday(r.date);
        return (
          <div key={r.date} className={i > 0 ? "border-t-2 border-stone-800" : ""}>
            <div
              className={`border-b border-stone-800 bg-white px-2 py-2 text-center text-xs font-bold uppercase sm:text-base ${
                special ? "text-sky-700" : "text-brand"
              }`}
            >
              {r.title}
              {r.note && <div className="text-[11px] font-semibold normal-case text-sky-700 sm:text-sm">{r.note}</div>}
            </div>
            <div
              className={`grid grid-cols-[1.1fr_1fr_1fr_1fr] text-center font-bold uppercase ${
                hl ? "bg-amber-50" : "bg-white"
              }`}
            >
              <div
                className={`flex flex-wrap items-center justify-center gap-x-1 border-r border-stone-800 px-1 py-3 text-lg sm:text-2xl ${
                  special ? "bg-emerald-100 text-sky-800" : "bg-sun"
                }`}
              >
                {formatDM(r.date)}
                {special && <span className="w-full text-[10px] font-semibold normal-case sm:text-xs">{weekdayVN(r.date)}</span>}
                {hl && <span className="hidden rounded bg-brand px-1 py-0.5 text-[10px] text-white sm:inline">SẮP TỚI</span>}
              </div>
              <Cell>{r.reading1}</Cell>
              <Cell>{r.reading2}</Cell>
              <Cell last>{r.prayer}</Cell>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cell({ children, last }: { children: string; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center break-words px-1 py-3 text-xs sm:text-lg ${
        last ? "" : "border-r border-stone-800"
      } ${children ? "" : "text-stone-300"}`}
    >
      {children || "—"}
    </div>
  );
}
