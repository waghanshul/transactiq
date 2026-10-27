// Generates the POC's synthetic dataset: 300 outgoing messages to check before
// sending (Prevent mode) and 40 sent payments that came back rejected (Repair
// mode), with an answer key recording every seeded error and its correct fix.
// Output is fully deterministic for a given seed and base date.
import { isValidIBAN } from "ibantools";
import { buildPacs002, buildPacs008, buildPain001 } from "@/lib/iso/build";
import { transliterate } from "@/lib/iso/charset";
import type { CreditTransfer, MsgType, PostalAddress } from "@/lib/iso/types";
import type { Bucket } from "@/lib/reference/buckets";
import { CORRIDOR_BY_ID, type Corridor } from "@/lib/reference/corridors";
import { SYNTHETIC_WATCHLIST } from "@/lib/reference/screening";
import { makeBeneficiaries, makeClients, type Beneficiary, type Client } from "./clients";
import { COUNTRY_DISPLAY, streetLine, toAmbiguousJapaneseLine, toUnstructuredLines } from "./places";
import { Rng } from "./rng";

export interface SynthPayment {
  id: string;
  batchId: string;
  msgType: MsgType;
  mode: "prevent" | "repair";
  clientId: string;
  beneficiaryId: string | null;
  corridor: string;
  transfer: CreditTransfer;
  xml: string;
  rejectXml?: string;
  rejectReasonCode?: string;
  /** Minutes before the base time the message arrived. */
  createdOffsetMin: number;
  /** Minutes after the base time the payment must be released. */
  cutoffOffsetMin: number;
}

export interface AnswerKeyRow {
  paymentId: string;
  bucket: Bucket;
  variant: string;
  fieldPath: string;
  expectedReasonCode: string | null;
  description: string;
  expectedFix: unknown;
  autoSuggestable: boolean;
  /** False when nothing in the message shows the problem (e.g. a closed account). */
  detectablePreSend: boolean;
  difficulty: "easy" | "hard";
  /** For duplicates: the earlier payment this one repeats. */
  relatedPaymentId?: string;
}

export interface SynthDataset {
  baseDate: Date;
  clients: Client[];
  beneficiaries: Beneficiary[];
  payments: SynthPayment[];
  answerKey: AnswerKeyRow[];
}

interface Ctx {
  t: CreditTransfer;
  client: Client;
  ben: Beneficiary;
  corridor: Corridor;
}

type Fix = Omit<AnswerKeyRow, "paymentId" | "bucket" | "variant">;

interface Variant {
  bucket: Bucket;
  key: string;
  weight: number;
  repairOnly?: boolean;
  eligible: (c: Ctx) => boolean;
  apply: (c: Ctx, rng: Rng) => Fix;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const minimal = (a: PostalAddress) => ({ TwnNm: a.TwnNm, Ctry: a.Ctry });

function breakIban(iban: string, rng: Rng): string {
  // Change one BBAN digit; the check digits no longer match.
  for (let attempt = 0; attempt < 20; attempt++) {
    const pos = rng.int(4, iban.length - 1);
    if (!/\d/.test(iban[pos])) continue;
    const next = String((Number(iban[pos]) + rng.int(1, 8)) % 10);
    const broken = iban.slice(0, pos) + next + iban.slice(pos + 1);
    if (!isValidIBAN(broken)) return broken;
  }
  return iban.slice(0, -1) + (iban.endsWith("0") ? "1" : "0");
}

const VARIANTS: Variant[] = [
  // Bucket 1: unstructured or malformed address
  {
    bucket: 1, key: "creditor_address_unstructured", weight: 45, eligible: () => true,
    apply: ({ t, ben }) => {
      t.creditor.address = { AdrLine: toUnstructuredLines(ben.address) };
      return { fieldPath: "Cdtr/PstlAdr", expectedReasonCode: "RR03", description: "Creditor address is free text only; town and country are not in their own fields.", expectedFix: { address: ben.address, minimum: minimal(ben.address) }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 1, key: "debtor_address_unstructured", weight: 8, eligible: () => true,
    apply: ({ t, client }) => {
      t.debtor.address = { AdrLine: toUnstructuredLines(client.address) };
      return { fieldPath: "Dbtr/PstlAdr", expectedReasonCode: "RR02", description: "Debtor address is free text only; town and country are not in their own fields.", expectedFix: { address: client.address, minimum: minimal(client.address) }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 1, key: "country_name_not_code", weight: 10, eligible: () => true,
    apply: ({ t, ben }) => {
      t.creditor.address = { ...ben.address, Ctry: COUNTRY_DISPLAY[ben.country] };
      return { fieldPath: "Cdtr/PstlAdr/Ctry", expectedReasonCode: "RR03", description: `Country is written as "${COUNTRY_DISPLAY[ben.country]}" instead of the ISO code ${ben.country}.`, expectedFix: { Ctry: ben.country }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 1, key: "town_repeated_in_line", weight: 10, eligible: () => true,
    apply: ({ t, ben }) => {
      t.creditor.address = { TwnNm: ben.address.TwnNm, Ctry: ben.address.Ctry, AdrLine: [`${streetLine(ben.address)}, ${ben.address.TwnNm}`] };
      return { fieldPath: "Cdtr/PstlAdr/AdrLine", expectedReasonCode: "RR03", description: "Hybrid address repeats the town in a free-text line as well as in TwnNm.", expectedFix: { AdrLine: [streetLine(ben.address)] }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 1, key: "address_line_too_long", weight: 9, eligible: () => true,
    apply: ({ t, ben }) => {
      const long = `${streetLine(ben.address)}, Attn Accounts Payable Department, Vendor Master Ref 2024-118`;
      t.creditor.address = { TwnNm: ben.address.TwnNm, Ctry: ben.address.Ctry, AdrLine: [long] };
      return { fieldPath: "Cdtr/PstlAdr/AdrLine", expectedReasonCode: "RR03", description: `Hybrid address line is ${long.length} characters; the limit is 70.`, expectedFix: { AdrLine: [streetLine(ben.address)] }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 1, key: "country_missing", weight: 8, eligible: () => true,
    apply: ({ t, ben }) => {
      const a = { ...ben.address };
      delete a.Ctry;
      t.creditor.address = a;
      return { fieldPath: "Cdtr/PstlAdr/Ctry", expectedReasonCode: "RR03", description: "Creditor address has a town but no country.", expectedFix: { Ctry: ben.country }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 1, key: "japanese_block_address", weight: 10, eligible: ({ ben }) => ben.country === "JP",
    apply: ({ t, ben }) => {
      t.creditor.address = { AdrLine: toAmbiguousJapaneseLine(ben.address) };
      return { fieldPath: "Cdtr/PstlAdr", expectedReasonCode: "RR03", description: "Japanese block-style address with no town or country words.", expectedFix: { address: ben.address, minimum: minimal(ben.address) }, autoSuggestable: true, detectablePreSend: true, difficulty: "hard" };
    },
  },

  // Bucket 2: missing party name or address
  {
    bucket: 2, key: "creditor_address_missing", weight: 6, eligible: () => true,
    apply: ({ t, ben }) => {
      delete t.creditor.address;
      return { fieldPath: "Cdtr/PstlAdr", expectedReasonCode: "RR03", description: "Creditor has no postal address and no identifier.", expectedFix: { address: ben.address, source: "beneficiary history" }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 2, key: "debtor_name_missing", weight: 4, eligible: () => true,
    apply: ({ t, client }) => {
      t.debtor.name = "";
      return { fieldPath: "Dbtr/Nm", expectedReasonCode: "RR02", description: "Debtor name is empty.", expectedFix: { name: client.name, source: "client master" }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },

  // Bucket 3: account problems (never auto-fixed)
  {
    bucket: 3, key: "creditor_iban_checksum", weight: 4, eligible: ({ t }) => !!t.creditor.account.iban,
    apply: ({ t }, rng) => {
      t.creditor.account = { iban: breakIban(t.creditor.account.iban!, rng) };
      return { fieldPath: "CdtrAcct/Id/IBAN", expectedReasonCode: "AC01", description: "Creditor IBAN fails its checksum.", expectedFix: { action: "contact_client" }, autoSuggestable: false, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 3, key: "debtor_iban_checksum", weight: 2, eligible: ({ t }) => !!t.debtor.account.iban,
    apply: ({ t }, rng) => {
      t.debtor.account = { iban: breakIban(t.debtor.account.iban!, rng) };
      return { fieldPath: "DbtrAcct/Id/IBAN", expectedReasonCode: "AC01", description: "Debtor IBAN fails its checksum.", expectedFix: { action: "contact_client" }, autoSuggestable: false, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 3, key: "creditor_account_format", weight: 4, eligible: ({ ben }) => ben.country === "IN",
    apply: ({ t }) => {
      const acct = t.creditor.account.other!;
      t.creditor.account = { other: acct.slice(0, 3) + "O" + acct.slice(4, -2) + "Il" };
      return { fieldPath: "CdtrAcct/Id/Othr/Id", expectedReasonCode: "AC03", description: "Indian account number contains letters (likely O/0 and l/1 typos).", expectedFix: { action: "contact_client" }, autoSuggestable: false, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 3, key: "creditor_account_closed", weight: 8, repairOnly: true, eligible: () => true,
    apply: () => ({ fieldPath: "CdtrAcct", expectedReasonCode: "AC04", description: "Beneficiary bank reports the account is closed. Nothing in the message shows this.", expectedFix: { action: "contact_client" }, autoSuggestable: false, detectablePreSend: false, difficulty: "hard" }),
  },

  // Bucket 4: bank identifier problems
  {
    bucket: 4, key: "bic_bad_format", weight: 4, eligible: () => true,
    apply: ({ t, ben }) => {
      t.creditorAgent.bic = ben.agentBic.slice(0, 7);
      return { fieldPath: "CdtrAgt/FinInstnId/BICFI", expectedReasonCode: "RC01", description: "Creditor bank BIC has 7 characters; a BIC has 8 or 11.", expectedFix: { bic: ben.agentBic }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 4, key: "bic_not_in_directory", weight: 3, eligible: () => true,
    apply: ({ t, ben }) => {
      t.creditorAgent.bic = "QXTR" + ben.agentBic.slice(4);
      return { fieldPath: "CdtrAgt/FinInstnId/BICFI", expectedReasonCode: "RC01", description: "Creditor bank BIC is well formed but not in the BIC directory.", expectedFix: { bic: ben.agentBic }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 4, key: "bic_country_mismatch", weight: 3, eligible: () => true,
    apply: ({ t, ben }) => {
      t.creditorAgent.bic = ben.country === "SG" ? "LKSHUS40" : "MRLNSGS0";
      return { fieldPath: "CdtrAgt/FinInstnId/BICFI", expectedReasonCode: "RC01", description: `Creditor bank BIC is in a different country from the creditor (${ben.country}).`, expectedFix: { bic: ben.agentBic }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },

  // Bucket 5: purpose code
  {
    bucket: 5, key: "purpose_missing", weight: 6, eligible: ({ corridor }) => corridor.purposeRequired,
    apply: ({ t, ben, corridor }) => {
      delete t.purposeCode;
      return { fieldPath: "Purp/Cd", expectedReasonCode: "RR04", description: `Corridor ${corridor.label} needs a purpose code and none is given.`, expectedFix: { purposeCode: ben.purposeCode, source: "client history" }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 5, key: "purpose_invalid", weight: 3, eligible: ({ corridor }) => corridor.purposeRequired,
    apply: ({ t, ben }) => {
      t.purposeCode = "SUPPLIER";
      return { fieldPath: "Purp/Cd", expectedReasonCode: "RR04", description: 'Purpose code "SUPPLIER" is not an ISO purpose code.', expectedFix: { purposeCode: ben.purposeCode, source: "client history" }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },

  // Bucket 6: format and schema
  {
    bucket: 6, key: "name_invalid_characters", weight: 3, eligible: () => true,
    apply: ({ t, ben }) => {
      const parts = ben.name.split(" ");
      t.creditor.name = `${parts[0]}’s ${parts.slice(1).join(" ")} – Accounts`;
      return { fieldPath: "Cdtr/Nm", expectedReasonCode: "FF01", description: "Creditor name contains characters outside the CBPR+ character set (curly apostrophe, en dash).", expectedFix: { name: transliterate(t.creditor.name) }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 6, key: "name_in_japanese_script", weight: 2, eligible: ({ ben }) => ben.country === "JP",
    apply: ({ t, ben }) => {
      t.creditor.name = "朝日精機株式会社";
      return { fieldPath: "Cdtr/Nm", expectedReasonCode: "FF01", description: "Creditor name is in Japanese script; CBPR+ needs Latin characters.", expectedFix: { name: ben.name, source: "beneficiary history" }, autoSuggestable: true, detectablePreSend: true, difficulty: "hard" };
    },
  },
  {
    bucket: 6, key: "end_to_end_id_too_long", weight: 2, eligible: () => true,
    apply: ({ t }) => {
      const original = t.endToEndId;
      t.endToEndId = `${original}-RESUBMITTED-AFTER-REVIEW`;
      return { fieldPath: "PmtId/EndToEndId", expectedReasonCode: "FF01", description: `EndToEndId is ${t.endToEndId.length} characters; the limit is 35.`, expectedFix: { endToEndId: original }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 6, key: "date_wrong_format", weight: 2, eligible: () => true,
    apply: ({ t }) => {
      const iso = t.valueDate;
      const [y, m, d] = iso.split("-");
      t.valueDate = `${d}/${m}/${y}`;
      return { fieldPath: "ValueDate", expectedReasonCode: "FF01", description: `Date "${t.valueDate}" is not in ISO format (YYYY-MM-DD).`, expectedFix: { valueDate: iso }, autoSuggestable: true, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 6, key: "jpy_with_decimals", weight: 2, eligible: ({ t }) => t.currency === "JPY",
    apply: ({ t }) => {
      t.amount = `${t.amount}.50`;
      return { fieldPath: "Amount", expectedReasonCode: "FF01", description: "JPY amount has decimals; JPY has no minor unit. Amounts are never auto-corrected.", expectedFix: { action: "contact_client" }, autoSuggestable: false, detectablePreSend: true, difficulty: "easy" };
    },
  },

  // Bucket 8: amount or currency not allowed
  {
    bucket: 8, key: "currency_not_allowed", weight: 3, eligible: () => true,
    apply: ({ t, corridor }) => {
      t.currency = corridor.creditorCountry === "IN" ? "INR" : "TRY";
      return { fieldPath: "Amount/@Ccy", expectedReasonCode: "AM03", description: `${t.currency} is not accepted on corridor ${corridor.label}.`, expectedFix: { action: "route_desk" }, autoSuggestable: false, detectablePreSend: true, difficulty: "easy" };
    },
  },
  {
    bucket: 8, key: "amount_over_limit", weight: 2, eligible: () => true,
    apply: ({ t, corridor }) => {
      const amt = Math.round(corridor.maxAmount * 1.4);
      t.amount = t.currency === "JPY" ? String(amt) : amt.toFixed(2);
      return { fieldPath: "Amount", expectedReasonCode: "AM02", description: `Amount is above the corridor maximum of ${corridor.maxAmount.toLocaleString("en-US")} ${corridor.currency}.`, expectedFix: { action: "route_desk" }, autoSuggestable: false, detectablePreSend: true, difficulty: "easy" };
    },
  },
];

const PREVENT_COUNTS: Partial<Record<Bucket, number>> = { 1: 34, 2: 10, 3: 9, 4: 9, 5: 9, 6: 9, 8: 5 };
const PREVENT_DUPLICATES = 5;
const PREVENT_SCREENING = 3;
const REPAIR_COUNTS: Partial<Record<Bucket, number>> = { 1: 15, 2: 4, 3: 8, 4: 4, 5: 4, 6: 3, 8: 2 };
const PREVENT_TOTAL = 300;
const REPAIR_TOTAL = 40;

const REJECT_TEXT: Record<string, string> = {
  RR03: "Creditor name or postal address insufficient (CBPR+ requires structured TwnNm and Ctry)",
  RR02: "Debtor name or postal address insufficient (CBPR+ requires structured TwnNm and Ctry)",
  AC01: "Account number invalid",
  AC03: "Creditor account number invalid",
  AC04: "Account closed at beneficiary bank",
  RC01: "Bank identifier incorrect",
  RR04: "Regulatory reporting: purpose of payment missing or invalid",
  FF01: "Message format invalid",
  AM02: "Amount exceeds allowed maximum",
  AM03: "Currency not accepted",
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function cleanTransfer(rng: Rng, client: Client, ben: Beneficiary, corridor: Corridor, seq: number, msgType: MsgType, baseDate: Date): CreditTransfer {
  const amount = corridor.currency === "JPY"
    ? String(rng.int(10, 4000) * 10_000)
    : (rng.int(150_000, 40_000_000) / 100).toFixed(2);
  const s = String(seq).padStart(5, "0");
  const day = ymd(baseDate).replace(/-/g, "");
  const invoice = `INV-${rng.digits(6)}`;
  return {
    msgId: msgType === "pain.001" ? `${client.shortCode}-${day}-${s}` : `SYNO${day}${s}`,
    creDtTm: baseDate.toISOString().slice(0, 19),
    instrId: `${client.shortCode}-PI-${s}`,
    endToEndId: `${client.shortCode}-${invoice}`,
    uetr: rng.uuid(),
    amount,
    currency: corridor.currency,
    valueDate: ymd(addDays(baseDate, rng.int(0, 2))),
    chargeBearer: "SHAR",
    debtor: { name: client.name, address: clone(client.address), account: clone(client.account) },
    debtorAgent: { bic: client.agentBic },
    creditor: { name: ben.name, address: clone(ben.address), account: clone(ben.account) },
    creditorAgent: { bic: ben.agentBic },
    purposeCode: ben.purposeCode,
    remittanceInfo: `${invoice} ${client.shortCode} PO ${rng.digits(5)}`,
  };
}

interface Draft {
  ctx: Ctx;
  msgType: MsgType;
  mode: "prevent" | "repair";
  createdOffsetMin: number;
  cutoffOffsetMin: number;
  answer?: Omit<AnswerKeyRow, "paymentId">;
  relatedDraft?: Draft;
  touched: boolean;
}

function seedErrors(rng: Rng, drafts: Draft[], counts: Partial<Record<Bucket, number>>, mode: "prevent" | "repair") {
  // Buckets with narrow eligibility go first; address errors (always eligible) last.
  const order: Bucket[] = [5, 3, 6, 4, 2, 8, 1];
  for (const bucket of order) {
    const count = counts[bucket] ?? 0;
    for (let n = 0; n < count; n++) {
      const variants = VARIANTS.filter(
        (v) => v.bucket === bucket && (mode === "repair" || !v.repairOnly) && drafts.some((d) => !d.touched && v.eligible(d.ctx)),
      );
      if (variants.length === 0) throw new Error(`No eligible payment left for bucket ${bucket}`);
      const variant = rng.weighted(variants.map((v) => ({ value: v, weight: v.weight })));
      const candidates = drafts.filter((d) => !d.touched && variant.eligible(d.ctx));
      const target = bucket === 1
        ? rng.weighted(candidates.map((d) => ({ value: d, weight: d.ctx.client.addressErrorBias })))
        : rng.pick(candidates);
      const fix = variant.apply(target.ctx, rng);
      target.touched = true;
      target.answer = { bucket, variant: variant.key, ...fix };
    }
  }
}

export function generateDataset(opts: { seed?: number; baseDate?: Date } = {}): SynthDataset {
  const rng = new Rng(opts.seed ?? 20261114);
  const baseDate = opts.baseDate ?? new Date();
  const clients = makeClients(rng);
  const beneficiaries = makeBeneficiaries(rng, clients);
  let seq = 1;

  const makeDraft = (mode: "prevent" | "repair", msgType: MsgType): Draft => {
    const client = rng.weighted(clients.map((c) => ({ value: c, weight: c.volume })));
    const corridor = CORRIDOR_BY_ID[rng.pick(client.corridors)];
    const ben = rng.pick(beneficiaries.filter((b) => b.clientId === client.id && b.country === corridor.creditorCountry));
    const t = cleanTransfer(rng, client, ben, corridor, seq++, msgType, baseDate);
    return { ctx: { t, client, ben, corridor }, msgType, mode, createdOffsetMin: rng.int(5, 240), cutoffOffsetMin: rng.int(20, 600), touched: false };
  };

  // Prevent mode: 295 base messages, then duplicates appended to reach 300.
  const prevent: Draft[] = Array.from({ length: PREVENT_TOTAL - PREVENT_DUPLICATES }, () =>
    makeDraft("prevent", rng.chance(0.6) ? "pain.001" : "pacs.008"),
  );
  seedErrors(rng, prevent, PREVENT_COUNTS, "prevent");

  // Screening look-alikes: names close to the synthetic watchlist.
  const lookAlikes = ["Zorvex Maritim Holding", "Qelmarah Trading FZE", "Vantorek Industrial Grp"];
  for (let i = 0; i < PREVENT_SCREENING; i++) {
    const target = rng.pick(prevent.filter((d) => !d.touched && (i < 2 ? d.ctx.corridor.id === "USD-AED" : true)));
    target.ctx.t.creditor.name = lookAlikes[i];
    target.touched = true;
    target.answer = {
      bucket: 9, variant: "screening_look_alike", fieldPath: "Cdtr/Nm", expectedReasonCode: null,
      description: `Creditor name "${lookAlikes[i]}" is close to watchlist entry "${SYNTHETIC_WATCHLIST[i].name}".`,
      expectedFix: { action: "route_compliance" }, autoSuggestable: false, detectablePreSend: true, difficulty: "easy",
    };
  }

  // Duplicates: a client resends a payment a few minutes later.
  for (let i = 0; i < PREVENT_DUPLICATES; i++) {
    const original = rng.pick(prevent.filter((d) => !d.touched && d.mode === "prevent"));
    original.touched = true; // keep the original clean and unique
    const t = clone(original.ctx.t);
    const s = String(seq++).padStart(5, "0");
    t.msgId = `${t.msgId.slice(0, -5)}${s}`;
    t.instrId = `${original.ctx.client.shortCode}-PI-${s}`;
    t.uetr = rng.uuid();
    if (i >= 3) t.endToEndId = `${t.endToEndId}R`;
    const dup: Draft = {
      ctx: { ...original.ctx, t }, msgType: original.msgType, mode: "prevent",
      createdOffsetMin: Math.max(0, original.createdOffsetMin - rng.int(2, 9)),
      cutoffOffsetMin: original.cutoffOffsetMin, touched: true, relatedDraft: original,
      answer: {
        bucket: 7, variant: i >= 3 ? "duplicate_new_reference" : "duplicate_same_reference",
        fieldPath: "CdtTrfTxInf", expectedReasonCode: "AM05",
        description: "Same debtor, creditor, amount, currency and remittance as a payment received minutes earlier.",
        expectedFix: { action: "hold" }, autoSuggestable: false, detectablePreSend: true, difficulty: "easy",
      },
    };
    prevent.push(dup);
  }

  // Repair mode: payments already sent that came back rejected.
  const repair: Draft[] = Array.from({ length: REPAIR_TOTAL }, () => makeDraft("repair", "pacs.008"));
  seedErrors(rng, repair, REPAIR_COUNTS, "repair");

  // Assign IDs in arrival order and build XML.
  const ordered = [
    ...prevent.sort((a, b) => b.createdOffsetMin - a.createdOffsetMin).map((d, i) => ({ d, id: `PRV-${String(i + 1).padStart(4, "0")}` })),
    ...repair.sort((a, b) => b.createdOffsetMin - a.createdOffsetMin).map((d, i) => ({ d, id: `RPR-${String(i + 1).padStart(4, "0")}` })),
  ];
  const idOf = new Map(ordered.map(({ d, id }) => [d, id]));
  const day = ymd(baseDate).replace(/-/g, "");

  const payments: SynthPayment[] = [];
  const answerKey: AnswerKeyRow[] = [];
  for (const { d, id } of ordered) {
    const { t, client, ben, corridor } = d.ctx;
    const isScreening = d.answer?.bucket === 9;
    const xml = d.msgType === "pain.001"
      ? buildPain001(t)
      : buildPacs008(t, client.agentBic, ben.agentBic);
    const p: SynthPayment = {
      id,
      batchId: d.mode === "prevent" ? `BATCH-${day}-${d.msgType === "pain.001" ? "CLIENT" : "BANK"}` : `RETURNS-${day}`,
      msgType: d.msgType,
      mode: d.mode,
      clientId: client.id,
      beneficiaryId: isScreening ? null : ben.id,
      corridor: corridor.id,
      transfer: t,
      xml,
      createdOffsetMin: d.createdOffsetMin,
      cutoffOffsetMin: d.cutoffOffsetMin,
    };
    if (d.mode === "repair") {
      const code = d.answer!.expectedReasonCode!;
      p.rejectReasonCode = code;
      p.rejectXml = buildPacs002({
        msgId: `RJ${day}${id.slice(4)}`,
        creDtTm: baseDate.toISOString().slice(0, 19),
        originalMsgId: t.msgId,
        originalEndToEndId: t.endToEndId,
        originalUetr: t.uetr,
        reasonCode: code,
        additionalInfo: REJECT_TEXT[code] ?? "Rejected",
        rejectingBic: ben.agentBic,
      });
    }
    payments.push(p);
    if (d.answer) {
      answerKey.push({
        paymentId: id,
        ...d.answer,
        ...(d.relatedDraft ? { relatedPaymentId: idOf.get(d.relatedDraft) } : {}),
      });
    }
  }

  return { baseDate, clients, beneficiaries, payments, answerKey };
}
