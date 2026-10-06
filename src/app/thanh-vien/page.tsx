import { isAdmin } from "@/lib/auth";
import { currentClass, currentClassId } from "@/lib/classes";
import { listCatechists, listClasses, listMembers, listWeeks } from "@/lib/data";
import { schoolYearOf, todayVN } from "@/lib/dates";
import { computeStats } from "@/lib/scheduler";
import MembersView, { type AdminMember, type PublicMember } from "./MembersView";
import CatechistsView from "./CatechistsView";

export default async function MembersPage() {
  const admin = await isAdmin();
  const [members, classes, catechists] = await Promise.all([listMembers(), listClasses(), listCatechists()]);
  const year = schoolYearOf(todayVN());

  let data: PublicMember[] | AdminMember[];
  if (admin) {
    const weeks = await listWeeks();
    const stats = new Map(
      computeStats(
        members.map((m) => ({ id: m.id, gender: m.gender === "F" ? "F" : "M", baseCount: m.baseCount })),
        weeks.map((w) => ({ date: w.date, reading1: w.reading1Id, reading2: w.reading2Id, prayer: w.prayerId })),
      ).map((s) => [s.id, s]),
    );
    data = members.map((m) => {
      const cls = currentClass(classes, m.classId, m.classBaseYear, year);
      return {
        id: m.id,
        saintName: m.saintName,
        fullName: m.fullName,
        gender: m.gender === "F" ? "F" : "M",
        fatherName: m.fatherName,
        motherName: m.motherName,
        fatherPhone: m.fatherPhone,
        motherPhone: m.motherPhone,
        phone: m.phone,
        note: m.note,
        active: m.active,
        className: cls?.name ?? "",
        classValue: cls?.graduated ? "graduated" : String(currentClassId(classes, m.classId, m.classBaseYear, year) ?? ""),
        readCount: stats.get(m.id)?.total ?? 0,
      } satisfies AdminMember;
    });
  } else {
    // Khách chỉ nhận đúng 3 trường công khai — không gửi thông tin phụ huynh xuống trình duyệt
    data = members
      .filter((m) => m.active)
      .map((m) => ({ id: m.id, saintName: m.saintName, fullName: m.fullName, gender: m.gender === "F" ? "F" : "M" }));
  }

  return (
    <div className="space-y-8">
      <MembersView
        admin={admin}
        members={data}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        schoolYear={year}
      />
      <CatechistsView
        admin={admin}
        items={catechists.map((c) => ({
          id: c.id,
          saintName: c.saintName,
          fullName: c.fullName,
          phone: c.phone,
          role: c.role,
        }))}
      />
    </div>
  );
}
