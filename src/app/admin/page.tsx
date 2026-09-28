import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSettings, listMembers, listWeeks } from "@/lib/data";
import { isSunday, isValidYM, lastDayOfMonth, monthKey, monthLabel, shiftMonth, todayVN, upcomingSunday } from "@/lib/dates";
import { getSundaysOfMonths } from "@/lib/liturgical";
import { defaultTitle } from "@/lib/titles";
import { shortNames } from "@/lib/names";
import { fingerprint } from "@/lib/fingerprint";
import ScheduleEditor from "./ScheduleEditor";

export default async function AdminSchedulePage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await searchParams;
  const [members, weeks, settings] = await Promise.all([listMembers(), listWeeks(), getSettings()]);

  const today = todayVN();
  let start: string;
  if (typeof sp.m === "string" && isValidYM(sp.m)) start = sp.m;
  else {
    // Mặc định: kỳ tiếp theo sau lịch cuối cùng đã có, hoặc tháng của CN sắp tới
    const last = weeks.filter((w) => w.reading1Id || w.reading2Id || w.prayerId).at(-1);
    const cur = monthKey(upcomingSunday(today));
    start = last && monthKey(last.date) >= cur ? shiftMonth(monthKey(last.date), 1) : cur;
  }
  const [y, m] = start.split("-").map(Number);
  const windowEnd = lastDayOfMonth(shiftMonth(start, 1));
  // Các CN trong 2 tháng + các ngày lễ đặc biệt (không phải CN) đã thêm
  const specials = weeks.filter((w) => w.date >= `${start}-01` && w.date <= windowEnd && !isSunday(w.date));
  const dates = [...getSundaysOfMonths(y, m, 2), ...specials.map((w) => w.date)].sort();
  const inWindow = new Set(dates);
  const byDate = new Map(weeks.map((w) => [w.date, w]));
  const names = shortNames(members, settings.nameStyle);

  const rows = dates.map((d) => {
    const w = byDate.get(d);
    return {
      date: d,
      title: w?.title || defaultTitle(d),
      note: w?.note ?? "",
      reading1Id: w?.reading1Id ?? null,
      reading2Id: w?.reading2Id ?? null,
      prayerId: w?.prayerId ?? null,
      skip: false,
      saved: !!w,
      special: !isSunday(d),
    };
  });
  const outside = weeks
    .filter((w) => !inWindow.has(w.date))
    .map((w) => ({ date: w.date, reading1: w.reading1Id, reading2: w.reading2Id, prayer: w.prayerId }));

  const end = shiftMonth(start, 1);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Chia lịch đọc sách</h1>
          <p className="text-sm text-stone-500">
            Kỳ 2 tháng: <b>{monthLabel(start)}</b> & <b>{monthLabel(end)}</b> · {dates.length - specials.length} Chúa Nhật
            {specials.length > 0 && ` + ${specials.length} ngày lễ`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link className="btn-ghost" href={`/admin?m=${shiftMonth(start, -1)}`}>
            ‹ Tháng trước
          </Link>
          <Link className="btn-ghost" href={`/admin?m=${shiftMonth(start, 1)}`}>
            Tháng sau ›
          </Link>
        </div>
      </div>
      <ScheduleEditor
        key={start}
        windowStart={`${start}-01`}
        windowEnd={windowEnd}
        initialRows={rows}
        baseline={Object.fromEntries(dates.map((d) => [d, byDate.has(d) ? fingerprint(byDate.get(d)!) : null]))}
        outside={outside}
        members={members.map((x) => ({
          id: x.id,
          short: names.get(x.id) ?? x.fullName,
          label: `${x.saintName ? x.saintName + " " : ""}${x.fullName}`,
          gender: x.gender === "F" ? ("F" as const) : ("M" as const),
          active: x.active,
          baseCount: x.baseCount,
        }))}
      />
    </div>
  );
}
