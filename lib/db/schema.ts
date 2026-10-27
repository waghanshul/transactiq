// Neon Postgres schema for the POC (Drizzle ORM).
// Tables follow the data model in the build plan. Users themselves live in
// Neon Auth's own schema (Sprint 3); `user_roles` maps them to maker/checker.
import {
  boolean, index, integer, jsonb, numeric, pgTable, real, serial, smallint, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- Reference data ----------

export const countries = pgTable("countries", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
});

export const reasonCodes = pgTable("reason_codes", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  definition: text("definition").notNull(),
});

export const purposeCodes = pgTable("purpose_codes", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  definition: text("definition").notNull(),
});

export const bicDirectory = pgTable("bic_directory", {
  bic: text("bic").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  country: text("country").notNull(),
  /** "synthetic" (demo banks) or "gleif" (imported real BICs). */
  source: text("source").notNull().default("synthetic"),
}, (t) => [index("bic_directory_country_idx").on(t.country)]);

export const corridorRules = pgTable("corridor_rules", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  debtorCountries: jsonb("debtor_countries").$type<string[]>().notNull(),
  creditorCountry: text("creditor_country").notNull(),
  currency: text("currency").notNull(),
  allowedCurrencies: jsonb("allowed_currencies").$type<string[]>().notNull(),
  purposeRequired: boolean("purpose_required").notNull(),
  maxAmount: numeric("max_amount", { precision: 18, scale: 2 }).notNull(),
  cutoffHourUtc: smallint("cutoff_hour_utc").notNull(),
  notes: text("notes").notNull(),
  illustrative: boolean("illustrative").notNull(),
});

export const screeningNames = pgTable("screening_names", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  program: text("program"),
  /** "synthetic" or "ofac". */
  source: text("source").notNull().default("synthetic"),
});

// ---------- Clients and beneficiaries ----------

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortCode: text("short_code").notNull(),
  country: text("country").notNull(),
  channel: text("channel").notNull(),
  corridors: jsonb("corridors").$type<string[]>().notNull(),
  masterAddress: jsonb("master_address").notNull(),
  account: jsonb("account").notNull(),
  agentBic: text("agent_bic").notNull(),
});

export const beneficiaries = pgTable("beneficiaries", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  country: text("country").notNull(),
  address: jsonb("address").notNull(),
  account: jsonb("account").notNull(),
  agentBic: text("agent_bic").notNull(),
  purposeCode: text("purpose_code"),
}, (t) => [index("beneficiaries_client_idx").on(t.clientId)]);

// ---------- Payments and work ----------

/**
 * Status flow: new -> flagged -> in_repair -> pending_check -> approved -> released_sim,
 * or held (duplicates) / compliance (screening hits). Repair-mode items start as rejected.
 */
export const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  msgType: text("msg_type").notNull(),
  mode: text("mode").notNull(),
  clientId: text("client_id").notNull().references(() => clients.id),
  beneficiaryId: text("beneficiary_id").references(() => beneficiaries.id),
  corridor: text("corridor").notNull().references(() => corridorRules.id),
  amount: text("amount").notNull(),
  currency: text("currency").notNull(),
  debtorName: text("debtor_name"),
  creditorName: text("creditor_name"),
  endToEndId: text("end_to_end_id"),
  uetr: text("uetr"),
  rawXml: text("raw_xml").notNull(),
  parsed: jsonb("parsed").notNull(),
  rejectXml: text("reject_xml"),
  rejectReasonCode: text("reject_reason_code"),
  status: text("status").notNull(),
  needsRescreen: boolean("needs_rescreen").notNull().default(false),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  cutoffAt: timestamp("cutoff_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("payments_mode_status_idx").on(t.mode, t.status),
  index("payments_client_idx").on(t.clientId),
  index("payments_corridor_idx").on(t.corridor),
]);

export const validationResults = pgTable("validation_results", {
  id: serial("id").primaryKey(),
  paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").notNull(),
  bucket: smallint("bucket").notNull(),
  severity: text("severity").notNull(),
  xpath: text("xpath"),
  reasonCode: text("reason_code"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("validation_results_payment_idx").on(t.paymentId)]);

export const suggestions = pgTable("suggestions", {
  id: serial("id").primaryKey(),
  resultId: integer("result_id").notNull().references(() => validationResults.id, { onDelete: "cascade" }),
  fieldPath: text("field_path").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  /** rule | directory | history | llm | swift_model */
  source: text("source").notNull(),
  confidence: real("confidence").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const repairs = pgTable("repairs", {
  id: serial("id").primaryKey(),
  paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  makerId: text("maker_id").notNull(),
  checkerId: text("checker_id"),
  /** draft | submitted | approved | rejected */
  state: text("state").notNull(),
  diff: jsonb("diff"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId)]);

/** Ground truth for every seeded error; drives the metrics page. */
export const answerKey = pgTable("answer_key", {
  id: serial("id").primaryKey(),
  paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  bucket: smallint("bucket").notNull(),
  variant: text("variant").notNull(),
  fieldPath: text("field_path").notNull(),
  expectedReasonCode: text("expected_reason_code"),
  description: text("description").notNull(),
  expectedFix: jsonb("expected_fix"),
  autoSuggestable: boolean("auto_suggestable").notNull(),
  detectablePreSend: boolean("detectable_pre_send").notNull(),
  difficulty: text("difficulty").notNull(),
  relatedPaymentId: text("related_payment_id"),
}, (t) => [uniqueIndex("answer_key_payment_variant_idx").on(t.paymentId, t.variant)]);

export const userRoles = pgTable("user_roles", {
  userId: text("user_id").primaryKey(),
  /** maker | checker | viewer | admin */
  role: text("role").notNull(),
});

export const clientNotes = pgTable("client_notes", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  body: text("body").notNull(),
  approvedBy: text("approved_by"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const benchmarkResults = pgTable("benchmark_results", {
  id: serial("id").primaryKey(),
  addressId: text("address_id").notNull(),
  engine: text("engine").notNull(),
  townPred: text("town_pred"),
  countryPred: text("country_pred"),
  confidence: real("confidence"),
  correct: boolean("correct"),
});

/** Cache for LLM and geocoder calls (Sprint 3) so free-tier quotas last. */
export const apiCache = pgTable("api_cache", {
  key: text("key").primaryKey(),
  provider: text("provider").notNull(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
