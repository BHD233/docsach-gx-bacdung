import Link from "next/link";
import PrintButton from "@/components/PrintButton";
import ScheduleTable, { type ScheduleRow } from "@/components/ScheduleTable";
import { getSettings, listMembers, listWeeks } from "@/lib/data";
import {
  addDays,
  formatDMY,
  isSunday,
  isValidYM,
  weekdayVN,
  monthKey,
  monthLabel,
  shiftMonth,
  todayVN,
  upcomingSunday,
} from "@/lib/dates";
import { getSundaysOfMonths } from "@/lib/liturgical";
import { defaultTitle } from "@/lib/titles";
import { shortNames } from "@/lib/names";

/** "Tháng 10", thêm năm khi khác năm với tháng đang xem: "Tháng 1/2027". */
function monthShort(ym: string, ref: string) {
  const [y, mo] = ym.split("-").map(Number);
  return ym.slice(0, 4) === ref.slice(0, 4) ? `Tháng ${mo}` : `Tháng ${mo}/${y}`;
}

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const today = todayVN();
  const thisSunday = upcomingSunday(today);
  const m0 = monthKey(thisSunday);
  const m = typeof sp.m === "string" && isValidYM(sp.m) ? sp.m : m0;
  const [y, mo] = m.split("-").map(Number);
  const sundays = getSundaysOfMonths(y, mo, 1);

  const [settings, members, weeks, current] = await Promise.all([
    getSettings(),
    listMembers(),
    listWeeks(`${m}-01`, `${m}-31`),
    listWeeks(today, addDays(today, 7)),
  ]);
  const names = shortNames(members, settings.nameStyle);
  const byId = new Map(members.map((x) => [x.id, x]));
  const nm = (id: number | null) => (id ? names.get(id) ?? "" : "");

  const weekMap = new Map(weeks.map((w) => [w.date, w]));
  // Hiện các CN đã có lịch; nếu tháng chưa có gì thì hiện khung trống các CN
  const dates = weeks.length ? weeks.map((w) => w.date) : [];
  const rows: ScheduleRow[] = dates.map((d) => {
    const w = weekMap.get(d)!;
    return {
      date: d,
      title: w.title || defaultTitle(d),
      note: w.note,
      reading1: nm(w.reading1Id),
      reading2: nm(w.reading2Id),
      prayer: nm(w.prayerId),
    };
  });

  // Lễ gần nhất từ hôm nay (có thể là ngày lễ thêm giữa tuần), mặc định là CN tới
  const cw = current.find((w) => w.reading1Id || w.reading2Id || w.prayerId) ?? current.find((w) => w.date === thisSunday);
  const nextDate = cw?.date ?? thisSunday;
  const nextLabel =
    nextDate === today ? "Hôm nay" : isSunday(nextDate) ? "Chúa Nhật tới" : `${weekdayVN(nextDate)} tới`;
  const roles = cw
    ? [
        { label: "Bài đọc 1", id: cw.reading1Id },
        { label: "Bài đọc 2", id: cw.reading2Id },
        { label: "Lời nguyện", id: cw.prayerId },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* Chúa Nhật này */}
      <section className="no-print card overflow-hidden">
        <div className="bg-gradient-to-r from-brand to-rose-600 px-5 py-4 text-white">
          <div className="text-xs font-semibold uppercase tracking-widest opacity-80">
            {nextLabel} · {formatDMY(nextDate)}
            {settings.massLabel && ` · ${settings.massLabel}`}
          </div>
          <h1 className="mt-1 text-xl font-extrabold uppercase sm:text-2xl">
            {cw?.title || defaultTitle(nextDate)}
          </h1>
          {cw?.note && <div className="mt-1 text-sm opacity-90">{cw.note}</div>}
        </div>
        {cw && roles.some((r) => r.id) ? (
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            {roles.map((r) => {
              const p = r.id ? byId.get(r.id) : undefined;
              return (
                <div key={r.label} className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center">
                  <div className="text-xs font-bold uppercase tracking-wider text-brand">{r.label}</div>
                  <div className="mt-2 text-2xl font-extrabold uppercase">{r.id ? nm(r.id) : "—"}</div>
                  {p && (
                    <div className="mt-1 text-sm text-stone-600">
                      {p.saintName && <span className="font-medium">{p.saintName} </span>}
                      {p.fullName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="p-6 text-center text-stone-500">Chưa có phân công cho ngày này.</p>
        )}
      </section>

      {/* Lịch tháng */}
      <section className="card p-4 sm:p-6">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link href={`/?m=${shiftMonth(m, -1)}`} className="btn-ghost">
              ‹ {monthShort(shiftMonth(m, -1), m)}
            </Link>
            <Link href={`/?m=${shiftMonth(m, 1)}`} className="btn-ghost">
              {monthShort(shiftMonth(m, 1), m)} ›
            </Link>
            {/* Chỉ hiện khi tháng hiện tại không nằm ngay cạnh, để không bị trùng tên tháng */}
            {m !== m0 && m0 !== shiftMonth(m, -1) && m0 !== shiftMonth(m, 1) && (
              <Link href="/" className="btn-ghost">
                ↩ Về {monthShort(m0, m).toLowerCase()}
              </Link>
            )}
          </div>
          <PrintButton />
        </div>
        <div className="mb-5 text-center">
          <h2 className="text-xl font-extrabold uppercase tracking-tight sm:text-3xl">{settings.siteTitle}</h2>
          <div className="mt-1 text-lg font-bold text-brand sm:text-2xl">{monthLabel(m)}</div>
          {settings.massLabel && <div className="mt-0.5 text-sm text-stone-500">{settings.massLabel}</div>}
        </div>
        <ScheduleTable rows={rows} highlightDate={nextDate} />
        {rows.length === 0 && sundays.length > 0 && (
          <p className="no-print mt-3 text-center text-sm text-stone-500">
            Tháng này có {sundays.length} Chúa Nhật. Ban điều hành sẽ cập nhật lịch sớm.
          </p>
        )}
      </section>
    </div>
  );
}
