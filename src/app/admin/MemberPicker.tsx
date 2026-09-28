"use client";

import { useId, useMemo, useRef, useState } from "react";
import { norm } from "@/lib/text";

export interface PickerMember {
  id: number;
  short: string;
  label: string;
  gender: "M" | "F";
  active: boolean;
}

/**
 * Ô chọn thành viên có gõ tìm (không cần dấu). Gợi ý xếp theo số lần đọc ít nhất,
 * em nào đã có lịch trong vòng 7 ngày thì bị đẩy xuống và đánh dấu.
 */
export default function MemberPicker({
  members,
  value,
  onChange,
  counts,
  busy,
  invalid,
  placeholder = "Gõ tên để tìm…",
}: {
  members: PickerMember[];
  value: number | null;
  onChange: (id: number | null) => void;
  counts: Map<number, number>;
  busy: Set<number>;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const selected = value != null ? members.find((m) => m.id === value) : undefined;

  const options = useMemo(() => {
    const nq = norm(q);
    return members
      .filter((m) => m.active || m.id === value)
      .filter((m) => !nq || norm(`${m.short} ${m.label}`).includes(nq))
      .sort(
        (a, b) =>
          Number(busy.has(a.id) && a.id !== value) - Number(busy.has(b.id) && b.id !== value) ||
          (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) ||
          a.short.localeCompare(b.short, "vi"),
      );
  }, [members, q, value, counts, busy]);

  function pick(id: number | null) {
    onChange(id);
    setOpen(false);
    setQ("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, options.length - 1));
      scrollTo(hi + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
      scrollTo(hi - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[hi]) pick(options[hi].id);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQ("");
    }
  }

  function scrollTo(i: number) {
    listRef.current?.children[i]?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className={`input pr-8 ${invalid ? "border-red-400 bg-red-50" : ""} ${selected && !open ? "font-semibold" : ""}`}
        placeholder={placeholder}
        value={open ? q : selected ? `${selected.short} — ${selected.label}` : ""}
        onFocus={(e) => {
          setOpen(true);
          setQ("");
          setHi(0);
          e.currentTarget.select();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {selected && !open && (
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-stone-400 hover:text-red-600"
          onClick={() => pick(null)}
          aria-label="Bỏ chọn"
        >
          ×
        </button>
      )}
      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full min-w-[240px] overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
        >
          {options.length === 0 && <li className="px-3 py-2 text-sm text-stone-500">Không tìm thấy</li>}
          {options.map((m, i) => {
            const isBusy = busy.has(m.id) && m.id !== value;
            return (
              <li
                key={m.id}
                role="option"
                aria-selected={m.id === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m.id);
                }}
                onMouseEnter={() => setHi(i)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                  i === hi ? "bg-brand/10" : ""
                } ${isBusy ? "text-stone-400" : ""}`}
              >
                <span className={m.gender === "F" ? "text-pink-600" : "text-sky-600"}>●</span>
                <span className="whitespace-nowrap font-semibold">{m.short}</span>
                <span className="truncate text-xs text-stone-500">{m.label}</span>
                <span className="ml-auto shrink-0 text-xs text-stone-400">
                  {isBusy ? "gần ngày" : `${counts.get(m.id) ?? 0} lần`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
