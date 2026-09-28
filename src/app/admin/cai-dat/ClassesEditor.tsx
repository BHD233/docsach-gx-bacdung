"use client";

import { useState, useTransition } from "react";
import { saveClasses } from "@/app/actions";
import ConfirmButton from "@/components/ConfirmButton";

interface Row {
  id?: number;
  name: string;
  count: number;
  key: string;
}

export default function ClassesEditor({
  initial,
  graduated,
}: {
  initial: { id: number; name: string; count: number }[];
  graduated: number;
}) {
  const [rows, setRows] = useState<Row[]>(initial.map((c) => ({ ...c, key: String(c.id) })));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = (next: Row[]) => {
    setRows(next);
    setSaved(false);
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };

  return (
    <div className="mt-4 space-y-2">
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center gap-2">
          <span className="w-6 text-right text-sm text-stone-400">{i + 1}.</span>
          <input
            className="input"
            value={r.name}
            onChange={(e) => update(rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
          />
          <span className="w-14 shrink-0 text-center text-xs text-stone-500" title="Số em đang học lớp này">
            {r.count} em
          </span>
          <button className="btn-ghost px-2" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Lên">↑</button>
          <button className="btn-ghost px-2" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Xuống">↓</button>
          <ConfirmButton
            className="btn-danger px-2"
            skip={r.count === 0}
            confirmLabel={`Xoá? (${r.count} em sẽ thành chưa xếp lớp)`}
            onConfirm={() => update(rows.filter((_, k) => k !== i))}
          >
            ✕
          </ConfirmButton>
        </div>
      ))}
      <div className="flex items-center gap-2 pl-8 text-sm text-stone-500">
        Sau lớp cuối → <b>Đã hoàn thành</b> ({graduated} em)
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          className="btn-ghost"
          onClick={() => update([...rows, { name: "", count: 0, key: `new-${Date.now()}` }])}
        >
          + Thêm lớp
        </button>
        <button
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await saveClasses(rows.map((r) => ({ id: r.id, name: r.name })));
              setSaved(true);
            })
          }
        >
          {pending ? "Đang lưu…" : "Lưu danh sách lớp"}
        </button>
        {saved && <span className="self-center text-sm text-green-700">✓ Đã lưu</span>}
      </div>
    </div>
  );
}
