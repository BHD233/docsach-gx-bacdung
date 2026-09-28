import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "docsach_admin";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const s =
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV !== "production" ? "dev-secret-change-me" : "");
  let ok = false;
  if (token && s) {
    try {
      await jwtVerify(token, new TextEncoder().encode(s));
      ok = true;
    } catch {}
  }
  if (!ok) return NextResponse.redirect(new URL("/admin/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/((?!login).*)"],
};
