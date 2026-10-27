"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_USERS, ensureDemoRoles, SESSION_COOKIE, sessionValue } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

/** Only same-site paths are allowed as the return address. */
const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/queue");

export async function signInAs(formData: FormData) {
  const user = DEMO_USERS.find((u) => u.id === formData.get("userId"));
  if (!user) throw new Error("Unknown demo user.");
  const db = getDb();
  await ensureDemoRoles(db);
  (await cookies()).set(SESSION_COOKIE, sessionValue(user.id), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8,
  });
  await db.insert(auditLog).values({ actorId: user.id, action: "sign_in", entity: "user", entityId: user.id, after: { role: user.role } });
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}
