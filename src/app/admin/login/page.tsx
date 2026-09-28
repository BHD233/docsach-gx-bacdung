import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await isAdmin()) redirect("/admin");
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card p-6">
        <h1 className="text-xl font-extrabold">Đăng nhập Admin</h1>
        <p className="mt-1 text-sm text-stone-500">Dành cho ban điều hành để chia lịch và quản lý thành viên.</p>
        <LoginForm next={typeof sp.next === "string" ? sp.next : "/admin"} />
      </div>
    </div>
  );
}
