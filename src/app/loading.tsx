// Hiện ngay khi chuyển trang, trong lúc server đang lấy dữ liệu
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Đang tải">
      <div className="card h-40 bg-stone-100" />
      <div className="card space-y-3 p-6">
        <div className="mx-auto h-7 w-2/3 rounded bg-stone-200" />
        <div className="mx-auto h-5 w-1/3 rounded bg-stone-200" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-16 rounded-xl bg-stone-100" />
        ))}
      </div>
    </div>
  );
}
