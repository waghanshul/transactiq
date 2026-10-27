import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { signOut } from "@/app/sign-in/actions";

const ROLE = { maker: "Maker", checker: "Checker", viewer: "Viewer" } as const;

/** Signed-in demo user in the header, with a one-click switch. */
export async function UserBadge() {
  let user;
  try {
    user = await currentUser(getDb());
  } catch {
    return null;
  }
  if (!user) {
    return <Link href="/sign-in" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold hover:border-accent">Sign in</Link>;
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>
        <span className="font-semibold">{user.name}</span>{" "}
        <span className="rounded bg-accent-soft px-1.5 py-px text-xs font-semibold text-accent">{ROLE[user.role]}</span>
      </span>
      <Link href="/sign-in" className="text-accent underline-offset-4 hover:underline">Switch</Link>
      <form action={signOut}><button className="text-muted hover:text-ink">Sign out</button></form>
    </div>
  );
}
