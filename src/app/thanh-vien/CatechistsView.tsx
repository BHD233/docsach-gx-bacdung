"use client";

import { useState, useTransition } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Modal from "@/components/Modal";
import { deleteCatechist, saveCatechist } from "@/app/actions";

interface Catechist {
  id: number;
  saintName: string;
  fullName: string;
  phone: string;
  role: string;
}

export default function CatechistsView({ admin, items }: { admin: boolean; items: Catechist[] }) {
  const [editing, setEditing] = useState<Catechist | "new" | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">Giáo lý viên liên hệ</h2>
          <p className="text-sm text-stone-500">Quý phụ huynh cần hỗ trợ xin liên hệ các anh chị dưới đây.</p>
        </div>
        {admin && (
          <button className="btn-primary" onClick={() => setEditing("new")}>+ Thêm GLV</button>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-stone-200 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10 text-lg font-bold text-brand">
              {c.fullName.trim().split(/\s+/).pop()?.[0] ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {c.saintName && <span className="font-normal text-stone-500">{c.saintName} </span>}
                {c.fullName}
              </div>
              {c.role && <div className="text-xs text-stone-500">{c.role}</div>}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="text-sm font-semibold text-sky-700">📞 {c.phone}</a>
              )}
            </div>
            {admin && (
              <button className="text-sm font-semibold text-brand hover:underline" onClick={() => setEditing(c)}>Sửa</button>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-stone-500">Chưa có thông tin giáo lý viên.</p>}
      </div>

      {admin && (
        <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Thêm giáo lý viên" : "Sửa giáo lý viên"}>
          {editing && (
            <form
              action={(fd) =>
                start(async () => {
                  await saveCatechist(fd);
                  setEditing(null);
                })
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
              <div>
                <label className="label">Tên thánh</label>
                <input name="saintName" className="input" defaultValue={editing !== "new" ? editing.saintName : ""} />
              </div>
              <div>
                <label className="label">Họ và tên *</label>
                <input name="fullName" className="input" required defaultValue={editing !== "new" ? editing.fullName : ""} />
              </div>
              <div>
                <label className="label">Số điện thoại</label>
                <input name="phone" type="tel" className="input" defaultValue={editing !== "new" ? editing.phone : ""} />
              </div>
              <div>
                <label className="label">Vai trò (tuỳ chọn)</label>
                <input name="role" className="input" placeholder="VD: Trưởng ban" defaultValue={editing !== "new" ? editing.role : ""} />
              </div>
              <div className="flex justify-between gap-2 sm:col-span-2">
                {editing !== "new" ? (
                  <ConfirmButton
                    disabled={pending}
                    confirmLabel="Bấm lần nữa để xoá"
                    onConfirm={() =>
                      start(async () => {
                        await deleteCatechist(editing.id);
                        setEditing(null);
                      })
                    }
                  >
                    Xoá
                  </ConfirmButton>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Huỷ</button>
                  <button className="btn-primary" disabled={pending}>{pending ? "Đang lưu…" : "Lưu"}</button>
                </div>
              </div>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}
