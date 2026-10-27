// Parses the POC's ISO 20022 messages into a flat, typed summary.
// Values are kept as strings exactly as they appear in the XML, so validation
// rules (Sprint 2) see malformed data rather than a cleaned-up version of it.
import { XMLParser } from "fast-xml-parser";
import type { PostalAddress } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === "AdrLine",
});

type Node = Record<string, unknown> | undefined;

const get = (node: Node, ...path: string[]): unknown => {
  let cur: unknown = node;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
};
const str = (v: unknown): string | undefined =>
  v === undefined || v === null ? undefined : typeof v === "object" ? undefined : String(v);

export interface ParsedParty {
  name?: string;
  address?: PostalAddress;
  iban?: string;
  account?: string;
}

export interface ParsedTransfer {
  msgType: "pacs.008" | "pain.001";
  msgId?: string;
  endToEndId?: string;
  uetr?: string;
  amount?: string;
  currency?: string;
  valueDate?: string;
  debtor: ParsedParty;
  creditor: ParsedParty;
  debtorAgentBic?: string;
  creditorAgentBic?: string;
  purposeCode?: string;
  remittanceInfo?: string;
}

export interface ParsedReject {
  msgType: "pacs.002";
  msgId?: string;
  originalMsgId?: string;
  originalEndToEndId?: string;
  originalUetr?: string;
  status?: string;
  reasonCode?: string;
  additionalInfo?: string;
}

function parseAddress(node: Node): PostalAddress | undefined {
  if (!node || typeof node !== "object") return undefined;
  const out: PostalAddress = {};
  for (const key of ["StrtNm", "BldgNb", "BldgNm", "Flr", "PstBx", "PstCd", "TwnNm", "DstrctNm", "CtrySubDvsn", "Ctry"] as const) {
    const v = str(get(node, key));
    if (v !== undefined) out[key] = v;
  }
  const lines = get(node, "AdrLine");
  if (Array.isArray(lines)) out.AdrLine = lines.map((l) => String(l));
  return out;
}

function parseParty(party: Node, account: Node): ParsedParty {
  return {
    name: str(get(party, "Nm")),
    address: parseAddress(get(party, "PstlAdr") as Node),
    iban: str(get(account, "Id", "IBAN")),
    account: str(get(account, "Id", "Othr", "Id")),
  };
}

function amountOf(node: unknown): { amount?: string; currency?: string } {
  if (node && typeof node === "object") {
    const n = node as Record<string, unknown>;
    return { amount: str(n["#text"]), currency: str(n["@Ccy"]) };
  }
  return { amount: str(node) };
}

export function parseMessage(xml: string): ParsedTransfer | ParsedReject {
  const doc = parser.parse(xml)?.Document as Node;
  if (!doc) throw new Error("Not an ISO 20022 Document");

  const pacs008 = get(doc, "FIToFICstmrCdtTrf") as Node;
  if (pacs008) {
    const tx = get(pacs008, "CdtTrfTxInf") as Node;
    return {
      msgType: "pacs.008",
      msgId: str(get(pacs008, "GrpHdr", "MsgId")),
      endToEndId: str(get(tx, "PmtId", "EndToEndId")),
      uetr: str(get(tx, "PmtId", "UETR")),
      ...amountOf(get(tx, "IntrBkSttlmAmt")),
      valueDate: str(get(tx, "IntrBkSttlmDt")),
      debtor: parseParty(get(tx, "Dbtr") as Node, get(tx, "DbtrAcct") as Node),
      creditor: parseParty(get(tx, "Cdtr") as Node, get(tx, "CdtrAcct") as Node),
      debtorAgentBic: str(get(tx, "DbtrAgt", "FinInstnId", "BICFI")),
      creditorAgentBic: str(get(tx, "CdtrAgt", "FinInstnId", "BICFI")),
      purposeCode: str(get(tx, "Purp", "Cd")),
      remittanceInfo: str(get(tx, "RmtInf", "Ustrd")),
    };
  }

  const pain001 = get(doc, "CstmrCdtTrfInitn") as Node;
  if (pain001) {
    const pmt = get(pain001, "PmtInf") as Node;
    const tx = get(pmt, "CdtTrfTxInf") as Node;
    return {
      msgType: "pain.001",
      msgId: str(get(pain001, "GrpHdr", "MsgId")),
      endToEndId: str(get(tx, "PmtId", "EndToEndId")),
      uetr: str(get(tx, "PmtId", "UETR")),
      ...amountOf(get(tx, "Amt", "InstdAmt")),
      valueDate: str(get(pmt, "ReqdExctnDt", "Dt")),
      debtor: parseParty(get(pmt, "Dbtr") as Node, get(pmt, "DbtrAcct") as Node),
      creditor: parseParty(get(tx, "Cdtr") as Node, get(tx, "CdtrAcct") as Node),
      debtorAgentBic: str(get(pmt, "DbtrAgt", "FinInstnId", "BICFI")),
      creditorAgentBic: str(get(tx, "CdtrAgt", "FinInstnId", "BICFI")),
      purposeCode: str(get(tx, "Purp", "Cd")),
      remittanceInfo: str(get(tx, "RmtInf", "Ustrd")),
    };
  }

  const pacs002 = get(doc, "FIToFIPmtStsRpt") as Node;
  if (pacs002) {
    const tx = get(pacs002, "TxInfAndSts") as Node;
    return {
      msgType: "pacs.002",
      msgId: str(get(pacs002, "GrpHdr", "MsgId")),
      originalMsgId: str(get(pacs002, "OrgnlGrpInfAndSts", "OrgnlMsgId")),
      originalEndToEndId: str(get(tx, "OrgnlEndToEndId")),
      originalUetr: str(get(tx, "OrgnlUETR")),
      status: str(get(tx, "TxSts")),
      reasonCode: str(get(tx, "StsRsnInf", "Rsn", "Cd")),
      additionalInfo: str(get(tx, "StsRsnInf", "AddtlInf")),
    };
  }

  throw new Error("Unsupported message type");
}
