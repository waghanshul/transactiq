// Demo sign-in with roles (S3-09). Four fictitious users so a single presenter
// can switch between maker and checker in one click during a demo. The
// session is a signed cookie; the ROLE is always read from the user_roles
// table on the server, and every action checks it again. Replacing this with
// Neon Auth only changes how the user id is obtained (see DECISIONS.md).
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { DB } from "@/lib/db/client";
import { userRoles } from "@/lib/db/schema";

export type Role = "maker" | "checker" | "viewer";

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
  blurb: string;
}

export const DEMO_USERS: DemoUser[] = [
  { id: "maker@demo", name: "Asha Kulkarni", role: "maker", blurb: "Payments operations analyst. Repairs payments and submits them." },
  { id: "maker2@demo", name: "Rohan Mehta", role: "maker", blurb: "Second analyst, to show that any maker can pick up a repair." },
  { id: "checker@demo", name: "Kenji Sato", role: "checker", blurb: "Team lead. Approves or sends back repairs made by someone else." },
  { id: "viewer@demo", name: "Priya Nair", role: "viewer", blurb: "Read-only, for audit and management. Can't change anything." },
];

export const SESSION_COOKIE = "tiq_session";

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.RESET_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("Set AUTH_SECRET (or RESET_SECRET) to sign sessions.");
  return "local-dev-only-secret";
}

const sign = (userId: string) => createHmac("sha256", secret()).update(userId).digest("base64url");

export function sessionValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function userIdFromSession(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return undefined;
  const id = value.slice(0, dot);
  const a = Buffer.from(value.slice(dot + 1));
  const b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : undefined;
}

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

/** Makes sure the four demo users have their roles in user_roles. */
export async function ensureDemoRoles(db: DB) {
  await db.insert(userRoles).values(DEMO_USERS.map((u) => ({ userId: u.id, role: u.role }))).onConflictDoNothing();
}

/** The signed-in user, with the role taken from the database. */
export async function currentUser(db: DB): Promise<SessionUser | undefined> {
  const id = userIdFromSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return undefined;
  const demo = DEMO_USERS.find((u) => u.id === id);
  if (!demo) return undefined;
  const [row] = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, id));
  if (!row) return undefined;
  return { id, name: demo.name, role: row.role as Role };
}

export class AuthError extends Error {}

export function requireRole(user: SessionUser | undefined, role: Role): SessionUser {
  if (!user) throw new AuthError("Sign in first.");
  if (user.role !== role) throw new AuthError(`Only a ${role} can do this. You are signed in as ${user.name} (${user.role}).`);
  return user;
}
