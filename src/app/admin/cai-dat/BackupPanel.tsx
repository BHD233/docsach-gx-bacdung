"use client";

import { useState, useTransition } from "react";
import { restoreFromBackup } from "@/app/actions";
import ConfirmButton from "@/components/ConfirmButton";

export default function BackupPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function restore() {
    if (!file) return;
    start(async () => {
      const res = await restoreFromBackup(await file.text());
      setMsg(
        res.ok
          ? {
              ok: true,
              text: `✓ Đã khôi phục: ${res.counts.members} thành viên, ${res.counts.weeks} ngày lịch, ${res.counts.class_levels} lớp, ${res.counts.catechists} GLV.`,
            }
          : { ok: false, text: `✗ ${res.error}` },
      );
    });
  }

  return (
    <section className="card p-5 lg:col-span-2">
      <h2 className="text-xl font-extrabold">Sao lưu & khôi phục</h2>
      <p className="mt-1 text-sm text-stone-500">
        Tải về toàn bộ dữ liệu (thành viên, lịch, lớp, GLV, cài đặt) để cất giữ, hoặc khôi phục từ một file sao lưu.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a href="/admin/sao-luu" className="btn-ghost">⬇ Tải bản sao lưu</a>
        <span className="text-stone-300">|</span>
        <input
          type="file"
          accept="application/json,.json"
          className="text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setMsg(null);
          }}
        />
        <ConfirmButton
          disabled={!file || pending}
          onConfirm={restore}
          confirmLabel="Xoá dữ liệu hiện tại & khôi phục?"
        >
          {pending ? "Đang khôi phục…" : "⬆ Khôi phục"}
        </ConfirmButton>
      </div>
      <p className="mt-2 text-xs text-amber-700">
        Khôi phục sẽ xoá toàn bộ dữ liệu hiện có rồi thay bằng nội dung file. Nên tải bản sao lưu hiện tại trước.
      </p>
      {msg && <p className={`mt-2 text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
    </section>
  );
}
