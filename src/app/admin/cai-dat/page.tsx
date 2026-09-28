import { requireAdmin } from "@/lib/auth";
import { getSettings, listClasses, listMembers } from "@/lib/data";
import { currentClass } from "@/lib/classes";
import { schoolYearOf, todayVN } from "@/lib/dates";
import { saveSettings } from "@/app/actions";
import BackupPanel from "./BackupPanel";
import ClassesEditor from "./ClassesEditor";

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, classes, members] = await Promise.all([getSettings(), listClasses(), listMembers()]);
  const year = schoolYearOf(todayVN());
  const counts = new Map<string, number>();
  for (const m of members.filter((x) => x.active)) {
    const c = currentClass(classes, m.classId, m.classBaseYear, year);
    if (c) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5">
        <h1 className="text-xl font-extrabold">Danh sách lớp</h1>
        <p className="mt-1 text-sm text-stone-500">
          Sắp xếp theo thứ tự từ nhỏ đến lớn. Mỗi ngày <b>1/9</b> các em tự lên lớp kế tiếp trong danh sách
          (năm học hiện tại: {year}–{year + 1}). Thêm, xoá hay đổi thứ tự lớp sẽ không làm các em nhảy lớp.
        </p>
        <ClassesEditor
          key={classes.map((c) => `${c.id}:${c.name}:${c.sortOrder}`).join("|")}
          initial={classes.map((c) => ({ id: c.id, name: c.name, count: counts.get(c.name) ?? 0 }))}
          graduated={counts.get("Đã hoàn thành") ?? 0}
        />
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-extrabold">Thông tin chung</h2>
        <form key={JSON.stringify(settings)} action={saveSettings} className="mt-4 space-y-3">
          <div>
            <label className="label">Tên ban / giáo xứ</label>
            <input name="parishName" className="input" defaultValue={settings.parishName} />
          </div>
          <div>
            <label className="label">Tiêu đề lịch</label>
            <input name="siteTitle" className="input" defaultValue={settings.siteTitle} />
          </div>
          <div>
            <label className="label">Thánh lễ (hiện dưới tiêu đề)</label>
            <input name="massLabel" className="input" defaultValue={settings.massLabel} placeholder="VD: Thánh lễ Thiếu Nhi 8g00" />
          </div>
          <div>
            <label className="label">Tên hiển thị trên lịch</label>
            <select name="nameStyle" className="input" defaultValue={settings.nameStyle}>
              <option value="1">1 chữ — NGÂN, trùng thì T. NGÂN</option>
              <option value="2">2 chữ — LINH ĐAN, TÚ ANH</option>
            </select>
          </div>
          <button className="btn-primary">Lưu</button>
        </form>
      </section>
      <BackupPanel />
    </div>
  );
}
