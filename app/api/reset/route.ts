// POST /api/reset restores the exact demo state. Protected by RESET_SECRET,
// sent as "Authorization: Bearer <secret>". Used by the admin reset button
// (Sprint 4) and the nightly GitHub Actions job.
import { getDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/seed/seed";

export async function POST(request: Request) {
  const secret = process.env.RESET_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Reset needs a valid RESET_SECRET bearer token." }, { status: 401 });
  }
  const summary = await seedDatabase(getDb());
  return Response.json({ ok: true, ...summary });
}
