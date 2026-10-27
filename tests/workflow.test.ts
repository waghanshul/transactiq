// Maker-checker workflow against a real Postgres database. Runs when
// DATABASE_URL points at a local or test database; skipped otherwise (CI has
// no database). Run locally with: DATABASE_URL=... npx vitest run tests/workflow.test.ts
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { AuthError, type SessionUser } from "@/lib/auth";
import { createDb, type DB } from "@/lib/db/client";
import { auditLog, payments } from "@/lib/db/schema";
import { runChecks } from "@/lib/data/checks";
import { suggestionsFor } from "@/lib/data/suggestions";
import { decideRepair, setChange, startRepair, submitRepair, WorkflowError } from "@/lib/repair/workflow";
import { GuardrailError } from "@/lib/suggest/guardrails";
import { seedDatabase } from "@/lib/seed/seed";

const url = process.env.DATABASE_URL;
const local = !!url && !/neon\.(tech|build)/.test(url);

const maker: SessionUser = { id: "maker@demo", name: "Asha", role: "maker" };
const maker2: SessionUser = { id: "maker2@demo", name: "Rohan", role: "maker" };
const checker: SessionUser = { id: "checker@demo", name: "Kenji", role: "checker" };
const viewer: SessionUser = { id: "viewer@demo", name: "Priya", role: "viewer" };

describe.skipIf(!local)("maker-checker workflow (local database)", () => {
  let db: DB;
  let addressPayment: string;
  beforeAll(async () => {
    db = createDb(url!);
    await seedDatabase(db, new Date());
    await runChecks(db, "test");
    const flagged = await db.select({ id: payments.id }).from(payments).where(eq(payments.status, "flagged"));
    for (const f of flagged) {
      const s = await suggestionsFor(db, f.id);
      if (s.length === 1 && s[0].fieldPath === "Cdtr/PstlAdr" && s[0].confidence >= 0.9) { addressPayment = f.id; break; }
    }
  }, 60_000);

  it("a viewer or a checker cannot start a repair", async () => {
    await expect(startRepair(db, viewer, addressPayment)).rejects.toThrow(AuthError);
    await expect(startRepair(db, checker, addressPayment)).rejects.toThrow(AuthError);
  });

  it("refuses edits to accounts and amounts on the server", async () => {
    await expect(setChange(db, maker, addressPayment, { fieldPath: "CdtrAcct/Id/IBAN", newValue: "X", how: "manual" })).rejects.toThrow(GuardrailError);
    await expect(setChange(db, maker, addressPayment, { fieldPath: "Amt/InstdAmt", newValue: "1", how: "manual" })).rejects.toThrow(GuardrailError);
  });

  it("blocks a repair that introduces a new error", async () => {
    await setChange(db, maker, addressPayment, { fieldPath: "Cdtr/PstlAdr", newValue: { TwnNm: "Pune", Ctry: "India" }, how: "manual" });
    await expect(submitRepair(db, maker, addressPayment)).rejects.toThrow(WorkflowError);
  });

  it("maker fixes, the same maker can't approve, a different checker approves", async () => {
    const [s] = await suggestionsFor(db, addressPayment);
    await setChange(db, maker, addressPayment, { fieldPath: s.fieldPath, newValue: s.newValue, how: "accepted", suggestionId: s.id });
    await submitRepair(db, maker, addressPayment);
    let [p] = await db.select().from(payments).where(eq(payments.id, addressPayment));
    expect(p.status).toBe("pending_check");
    expect(p.needsRescreen).toBe(true);
    await expect(decideRepair(db, maker, addressPayment, "approve")).rejects.toThrow(AuthError);
    await expect(decideRepair(db, checker, addressPayment, "send_back")).rejects.toThrow(WorkflowError); // comment required
    await decideRepair(db, checker, addressPayment, "approve", "Matches beneficiary record");
    [p] = await db.select().from(payments).where(eq(payments.id, addressPayment));
    expect(p.status).toBe("approved");
    const actions = (await db.select({ a: auditLog.action }).from(auditLog).where(eq(auditLog.entityId, addressPayment))).map((r) => r.a);
    expect(actions).toEqual(expect.arrayContaining(["start_repair", "accept_suggestion", "submit", "approve"]));
  });

  it("a checker who never touched it can't be the maker; a maker who edited can't check", async () => {
    const flagged = await db.select({ id: payments.id }).from(payments).where(eq(payments.status, "flagged"));
    for (const f of flagged) {
      const [s] = await suggestionsFor(db, f.id);
      if (!s || s.confidence < 0.9) continue;
      await setChange(db, maker2, f.id, { fieldPath: s.fieldPath, newValue: s.newValue, how: "accepted", suggestionId: s.id });
      try { await submitRepair(db, maker2, f.id); } catch { continue; }
      // A checker account that also edited would be refused; simulate by a checker id in editors:
      await expect(decideRepair(db, { ...maker2, role: "checker" }, f.id, "approve")).rejects.toThrow(AuthError);
      await decideRepair(db, checker, f.id, "send_back", "Please double-check the town");
      const [p] = await db.select().from(payments).where(eq(payments.id, f.id));
      expect(p.status).toBe("in_repair");
      return;
    }
    throw new Error("no suitable payment found");
  });

  it("never lets anyone start a repair on a compliance payment", async () => {
    const [c] = await db.select({ id: payments.id }).from(payments).where(eq(payments.status, "compliance"));
    await expect(startRepair(db, maker, c.id)).rejects.toThrow(GuardrailError);
  });
});
