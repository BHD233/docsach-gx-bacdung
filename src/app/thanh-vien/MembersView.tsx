"use client";

import { useMemo, useState, useTransition } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Modal from "@/components/Modal";
import { deleteMember, saveMember } from "@/app/actions";

export interface PublicMember {
  id: number;
  saintName: string;
  fullName: string;
  gender: "M" | "F";
}

export interface AdminMember extends PublicMember {
  fatherName: string;
  motherName: string;
  fatherPhone: string;
  motherPhone: string;
  phone: string;
  note: string;
  active: boolean;
  className: string;
  classValue: string;
  readCount: number;
}

const genderLabel = (g: "M" | "F") => (g === "F" ? "Nữ" : "Nam");

function isAdminMember(m: PublicMember): m is AdminMember {
  return "active" in m;
}

export default function MembersView({
  admin,
  members,
  classes,
  schoolYear,
}: {
  admin: boolean;
  members: PublicMember[] | AdminMember[];
  classes: { id: number; name: string }[];
  schoolYear: number;
}) {
  const [q, setQ] = useState("");
  const [gender, setGender] = useState<"" | "M" | "F">("");
  const [cls, setCls] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<AdminMember | "new" | null>(null);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

  const list = useMemo(() => {
    const nq = norm(q);
    return (members as PublicMember[]).filter((m) => {
      if (gender && m.gender !== gender) return false;
      if (isAdminMember(m)) {
        if (!showInactive && !m.active) return false;
        if (cls && m.className !== cls) return false;
        if (nq && !norm(`${m.saintName} ${m.fullName} ${m.phone} ${m.fatherName} ${m.motherName} ${m.fatherPhone} ${m.motherPhone}`).includes(nq))
          return false;
      } else if (nq && !norm(`${m.saintName} ${m.fullName}`).includes(nq)) return false;
      return true;
    });
  }, [members, q, gender, cls, showInactive]);

  const activeAll = (members as PublicMember[]).filter((m) => !isAdminMember(m) || m.active);
  const boys = activeAll.filter((m) => m.gender === "M").length;

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Thành viên ban đọc sách</h1>
          <p className="text-sm text-stone-500">
            {activeAll.length} em · {boys} nam · {activeAll.length - boys} nữ · Năm học {schoolYear}–{schoolYear + 1}
          </p>
        </div>
        {admin && (
          <button className="btn-primary" onClick={() => setEditing("new")}>
            + Thêm thành viên
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Tìm theo tên…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={gender} onChange={(e) => setGender(e.target.value as "" | "M" | "F")}>
          <option value="">Tất cả giới tính</option>
          <option value="M">Nam</option>
          <option value="F">Nữ</option>
        </select>
        {admin && (
          <>
            <select className="input w-auto" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">Tất cả lớp</option>
              {classes.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
              <option value="Đã hoàn thành">Đã hoàn thành</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Hiện cả em đã nghỉ
            </label>
          </>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Tên thánh</th>
              <th className="px-3 py-2.5">Họ và tên</th>
              <th className="px-3 py-2.5">Giới tính</th>
              {admin && (
                <>
                  <th className="px-3 py-2.5">Lớp</th>
                  <th className="px-3 py-2.5">SĐT em</th>
                  <th className="px-3 py-2.5">Ba</th>
                  <th className="px-3 py-2.5">Mẹ</th>
                  <th className="px-3 py-2.5 text-center">Đã đọc</th>
                  <th className="px-3 py-2.5"></th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {list.map((m, i) => (
              <tr key={m.id} className={isAdminMember(m) && !m.active ? "bg-stone-50 text-stone-400" : ""}>
                <td className="px-3 py-2.5 text-stone-400">{i + 1}</td>
                <td className="px-3 py-2.5">{m.saintName}</td>
                <td className="px-3 py-2.5 font-semibold">
                  {m.fullName}
                  {isAdminMember(m) && !m.active && <span className="ml-2 text-xs font-normal">(đã nghỉ)</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      m.gender === "F" ? "bg-pink-100 text-pink-700" : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {genderLabel(m.gender)}
                  </span>
                </td>
                {admin && isAdminMember(m) && (
                  <>
                    <td className="px-3 py-2.5">{m.className || <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {m.phone ? <a className="text-xs text-sky-700" href={`tel:${m.phone}`}>{m.phone}</a> : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div>{m.fatherName}</div>
                      {m.fatherPhone && <a className="text-xs text-sky-700" href={`tel:${m.fatherPhone}`}>{m.fatherPhone}</a>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div>{m.motherName}</div>
                      {m.motherPhone && <a className="text-xs text-sky-700" href={`tel:${m.motherPhone}`}>{m.motherPhone}</a>}
                    </td>
                    <td className="px-3 py-2.5 text-center">{m.readCount}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button className="text-sm font-semibold text-brand hover:underline" onClick={() => setEditing(m)}>
                        Sửa
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={admin ? 10 : 4} className="px-3 py-8 text-center text-stone-500">
                  Không có thành viên nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {admin && (
        <Modal
          open={editing !== null}
          onClose={() => setEditing(null)}
          title={editing === "new" ? "Thêm thành viên" : "Sửa thông tin thành viên"}
        >
          <MemberForm member={editing === "new" ? null : editing} classes={classes} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}

function MemberForm({
  member,
  classes,
  onDone,
}: {
  member: AdminMember | null;
  classes: { id: number; name: string }[];
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function submit(fd: FormData) {
    setError("");
    start(async () => {
      try {
        await saveMember(fd);
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
      }
    });
  }

  function remove() {
    if (!member) return;
    start(async () => {
      await deleteMember(member.id);
      onDone();
    });
  }

  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-2">
      {member && <input type="hidden" name="id" value={member.id} />}
      <Field label="Tên thánh" name="saintName" defaultValue={member?.saintName} />
      <Field label="Họ và tên *" name="fullName" defaultValue={member?.fullName} required />
      <div>
        <label className="label">Giới tính</label>
        <select name="gender" className="input" defaultValue={member?.gender ?? "M"}>
          <option value="M">Nam</option>
          <option value="F">Nữ</option>
        </select>
      </div>
      <div>
        <label className="label">Lớp hiện tại</label>
        <select name="classId" className="input" defaultValue={member?.classValue ?? ""}>
          <option value="">— Chưa xếp lớp —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="graduated">Đã hoàn thành</option>
        </select>
        <p className="mt-1 text-xs text-stone-400">Tự động lên lớp mỗi ngày 1/9.</p>
      </div>
      <Field label="Tên ba" name="fatherName" defaultValue={member?.fatherName} />
      <Field label="SĐT ba" name="fatherPhone" defaultValue={member?.fatherPhone} type="tel" />
      <Field label="Tên mẹ" name="motherName" defaultValue={member?.motherName} />
      <Field label="SĐT mẹ" name="motherPhone" defaultValue={member?.motherPhone} type="tel" />
      <Field label="SĐT em" name="phone" defaultValue={member?.phone} type="tel" />
      <div className="sm:col-span-2">
        <label className="label">Ghi chú</label>
        <textarea name="note" className="input" rows={2} defaultValue={member?.note} />
      </div>
      {member && (
        <p className="text-xs text-stone-500 sm:col-span-2">
          Em tạm nghỉ thì bỏ chọn “Đang hoạt động” thay vì xoá — xoá hẳn sẽ làm lịch cũ bị trống tên.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={member?.active ?? true} />
        Đang hoạt động (được xếp lịch đọc)
      </label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex items-center justify-between gap-2 sm:col-span-2">
        {member ? (
          <ConfirmButton onConfirm={remove} disabled={pending} confirmLabel="Xoá hẳn? Bấm lần nữa">
            Xoá
          </ConfirmButton>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onDone}>Huỷ</button>
          <button className="btn-primary" disabled={pending}>{pending ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} className="input" defaultValue={defaultValue} required={required} />
    </div>
  );
}
