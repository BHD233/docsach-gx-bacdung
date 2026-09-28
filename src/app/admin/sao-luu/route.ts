import { isAdmin } from "@/lib/auth";
import { exportBackup } from "@/lib/backup";
import { todayVN } from "@/lib/dates";

export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const data = await exportBackup();
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="docsach-backup-${todayVN()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
