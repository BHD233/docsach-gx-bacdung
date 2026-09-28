import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import Link from "next/link";
import { logout } from "./actions";
import { isAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import NavLinks from "@/components/NavLinks";
import "./globals.css";

const font = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  return {
    title: s?.parishName ?? "Ban Đọc Sách Thiếu Nhi",
    description: "Lịch đọc sách Chúa Nhật và danh sách ban đọc sách thiếu nhi",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [admin, settings] = await Promise.all([isAdmin(), getSettings()]);
  const links = [
    { href: "/", label: "Lịch đọc" },
    { href: "/thanh-vien", label: "Thành viên" },
    ...(admin
      ? [
          { href: "/admin", label: "Chia lịch" },
          { href: "/admin/cai-dat", label: "Cài đặt" },
        ]
      : []),
  ];
  return (
    <html lang="vi" className={`${font.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="no-print z-30 sm:sticky sm:top-0 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-extrabold text-brand">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">✝</span>
              <span className="leading-tight">{settings.parishName}</span>
            </Link>
            <NavLinks links={links} />
            <div className="ml-auto flex items-center gap-2 text-sm">
              {admin ? (
                <form action={logout}>
                  <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    Admin
                  </span>
                  <button className="text-stone-500 hover:text-brand">Đăng xuất</button>
                </form>
              ) : (
                <Link href="/admin/login" className="text-stone-500 hover:text-brand">
                  Đăng nhập
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="no-print py-6 text-center text-xs text-stone-400">
          {settings.parishName} · Lịch đọc sách Chúa Nhật
        </footer>
      </body>
    </html>
  );
}
