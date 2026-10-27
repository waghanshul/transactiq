CREATE TABLE "answer_key" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"bucket" smallint NOT NULL,
	"variant" text NOT NULL,
	"field_path" text NOT NULL,
	"expected_reason_code" text,
	"description" text NOT NULL,
	"expected_fix" jsonb,
	"auto_suggestable" boolean NOT NULL,
	"detectable_pre_send" boolean NOT NULL,
	"difficulty" text NOT NULL,
	"related_payment_id" text
);
--> statement-breakpoint
CREATE TABLE "api_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"address_id" text NOT NULL,
	"engine" text NOT NULL,
	"town_pred" text,
	"country_pred" text,
	"confidence" real,
	"correct" boolean
);
--> statement-breakpoint
CREATE TABLE "beneficiaries" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"address" jsonb NOT NULL,
	"account" jsonb NOT NULL,
	"agent_bic" text NOT NULL,
	"purpose_code" text
);
--> statement-breakpoint
CREATE TABLE "bic_directory" (
	"bic" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"country" text NOT NULL,
	"source" text DEFAULT 'synthetic' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"body" text NOT NULL,
	"approved_by" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_code" text NOT NULL,
	"country" text NOT NULL,
	"channel" text NOT NULL,
	"corridors" jsonb NOT NULL,
	"master_address" jsonb NOT NULL,
	"account" jsonb NOT NULL,
	"agent_bic" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corridor_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"debtor_countries" jsonb NOT NULL,
	"creditor_country" text NOT NULL,
	"currency" text NOT NULL,
	"allowed_currencies" jsonb NOT NULL,
	"purpose_required" boolean NOT NULL,
	"max_amount" numeric(18, 2) NOT NULL,
	"cutoff_hour_utc" smallint NOT NULL,
	"notes" text NOT NULL,
	"illustrative" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"msg_type" text NOT NULL,
	"mode" text NOT NULL,
	"client_id" text NOT NULL,
	"beneficiary_id" text,
	"corridor" text NOT NULL,
	"amount" text NOT NULL,
	"currency" text NOT NULL,
	"debtor_name" text,
	"creditor_name" text,
	"end_to_end_id" text,
	"uetr" text,
	"raw_xml" text NOT NULL,
	"parsed" jsonb NOT NULL,
	"reject_xml" text,
	"reject_reason_code" text,
	"status" text NOT NULL,
	"needs_rescreen" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purpose_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"definition" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reason_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"definition" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repairs" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"maker_id" text NOT NULL,
	"checker_id" text,
	"state" text NOT NULL,
	"diff" jsonb,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "screening_names" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"program" text,
	"source" text DEFAULT 'synthetic' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"result_id" integer NOT NULL,
	"field_path" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"source" text NOT NULL,
	"confidence" real NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"bucket" smallint NOT NULL,
	"severity" text NOT NULL,
	"xpath" text,
	"reason_code" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_key" ADD CONSTRAINT "answer_key_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_corridor_corridor_rules_id_fk" FOREIGN KEY ("corridor") REFERENCES "public"."corridor_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_result_id_validation_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."validation_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_key_payment_variant_idx" ON "answer_key" USING btree ("payment_id","variant");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "beneficiaries_client_idx" ON "beneficiaries" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bic_directory_country_idx" ON "bic_directory" USING btree ("country");--> statement-breakpoint
CREATE INDEX "payments_mode_status_idx" ON "payments" USING btree ("mode","status");--> statement-breakpoint
CREATE INDEX "payments_client_idx" ON "payments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payments_corridor_idx" ON "payments" USING btree ("corridor");--> statement-breakpoint
CREATE INDEX "validation_results_payment_idx" ON "validation_results" USING btree ("payment_id");