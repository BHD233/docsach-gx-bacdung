# Ban Đọc Sách Thiếu Nhi

Web quản lý lịch đọc sách Chúa Nhật cho ban đọc sách thiếu nhi (Next.js 16 + Postgres).

## Tính năng

| Trang | Ai xem | Nội dung |
|---|---|---|
| `/` | Mọi người | Phân công Chúa Nhật tới + lịch cả tháng, in được |
| `/thanh-vien` | Mọi người | Khách: tên thánh, họ tên, giới tính. Admin: xem/sửa toàn bộ (lớp, ba mẹ, SĐT, số lần đọc). Danh sách GLV liên hệ |
| `/admin` | Admin | Chia lịch 2 tháng: nút 🎲 chia ngẫu nhiên, gõ tên để chọn (không cần dấu), ⇄ đổi chỗ 2 người bất kỳ, thêm ngày lễ giữa tuần (Giáng Sinh, Trung Thu…), báo lỗi, thống kê |
| `/admin/cai-dat` | Admin | Danh sách lớp theo thứ tự, tên ban, tiêu đề lịch |

**Luật chia lịch** (`src/lib/scheduler.ts`):
- Mỗi Chúa Nhật 3 em khác nhau: Bài đọc 1, Bài đọc 2, Lời nguyện.
- Bài đọc 1 và 2 luôn có 1 nam 1 nữ.
- Không em nào đọc 2 lần trong vòng 7 ngày (2 tuần liền, hoặc Chúa Nhật + ngày lễ giữa tuần).
- Không em nào đọc Lời nguyện 3 lần liên tiếp.
- **Hàng chờ:** các em xếp theo ngày đọc gần nhất; em chờ lâu nhất (hoặc chưa đọc lần nào) đứng đầu. Mỗi tuần lấy 3 em đầu hàng. Chỉ được bỏ qua một em khi em đó vướng luật bắt buộc (thiếu nam/nữ, đọc trong vòng 7 ngày, Lời nguyện 3 lần), và em bị bỏ qua vẫn đứng đầu hàng tuần sau. Đọc xong thì về cuối hàng.
- Nhờ vậy chưa ai đọc lần 2 khi còn em chưa đọc lần nào. Em mới vào đứng đầu hàng, đọc 1 lần rồi về cuối như mọi người, không đọc bù.
- Phần ngẫu nhiên: xáo các em cùng vị trí trong hàng (đọc cùng ngày) và xáo vai Bài 1 / Bài 2 / Lời nguyện.
- Để luôn đủ cặp nam–nữ, giới ít hơn nên chiếm khoảng **1/3 ban trở lên**. Ví dụ 3 nam / 15 nữ thì chắc chắn có vài tuần phải để 2 nữ đọc Bài đọc 1 & 2.
- Nếu không thể giữ đủ luật (ví dụ ban quá ít người, hoặc toàn nữ), web vẫn chia lịch và hiện cảnh báo. Luật công bằng thì không bao giờ bị nới.

**Lên lớp tự động**: mỗi em lưu lớp lúc được gán và năm học lúc gán. Mỗi ngày 1/9, lớp hiện tại tự tiến 1 bậc theo danh sách lớp, không cần cron. Sau lớp cuối là "Đã hoàn thành".

**Tên Chúa Nhật** (VD "CHÚA NHẬT XXIII THƯỜNG NIÊN NĂM A") được tính tự động theo lịch phụng vụ, có áp dụng các lễ dời sang Chúa Nhật tại Việt Nam. Admin có thể sửa tay.

## Chạy local

```bash
npm install
npm run seed:demo   # (tuỳ chọn) thêm 28 em mẫu — chạy khi dev server đang tắt
npm run dev         # http://localhost:3000, mật khẩu admin: admin
npm test            # test thuật toán chia lịch, lịch phụng vụ, lên lớp
```

Không có `DATABASE_URL` thì web dùng PGlite (Postgres nhúng), dữ liệu lưu ở `./.data`.

## Sao lưu / chuyển dữ liệu

Dữ liệu thật nằm trong `data/`. Thư mục này có trong `.gitignore`, nên không bao giờ lên git.

```bash
npm run db:dump                              # sao lưu DB local → data/backup.json (tắt dev server trước)
DATABASE_URL="postgres://..." npm run db:dump      # sao lưu DB production
DATABASE_URL="postgres://..." npm run db:restore   # ghi đè DB production bằng data/backup.json
npm run import:data                          # nhập từ data/ban-doc-sach.json (danh sách + lịch cũ dạng tên)
```

## Deploy lên Vercel

1. Đẩy code lên GitHub, rồi vào Vercel → **Add New Project** → import repo.
2. Vào **Storage → Create Database → Neon (Postgres)** và connect vào project. Bước này tự thêm biến `DATABASE_URL`.
3. Vào **Settings → Environment Variables** và thêm:
   - `ADMIN_PASSWORD`: mật khẩu admin
   - `AUTH_SECRET`: chuỗi ngẫu nhiên dài, tạo bằng `openssl rand -base64 32`
4. Deploy. Bảng dữ liệu tự tạo ở lần truy cập đầu tiên, không cần chạy migration.

Có thể dùng Postgres khác (Supabase…) bằng cách đặt `DATABASE_URL`. Web dùng driver HTTP của Neon, nên với Postgres không phải Neon thì cần đổi driver trong `src/lib/db/index.ts`.
