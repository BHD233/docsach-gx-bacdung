"use client";

import { useEffect, useState } from "react";

/**
 * Nút xác nhận 2 bước ngay trên trang (không dùng window.confirm — một số trình duyệt nhúng chặn hộp thoại).
 * Bấm lần 1 → nút đổi sang "Chắc chắn?", bấm lần 2 trong 4 giây mới thực hiện.
 */
export default function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Bấm lần nữa để xác nhận",
  className = "btn-danger",
  disabled,
  skip,
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Bỏ qua bước xác nhận (VD: không có gì để mất) */
  skip?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${className} ${armed ? "animate-pulse ring-2 ring-red-400" : ""}`}
      onClick={() => {
        if (skip || armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
