// Builds ISO 20022 XML for the POC: pacs.008.001.08, pain.001.001.09 and pacs.002.001.10.
// Element order follows the published schemas so messages can be XSD-validated
// in Sprint 2. Values are written as given: the error seeder relies on that to
// inject malformed data (e.g. Ctry="India").
import type { Account, CreditTransfer, Party, PostalAddress } from "./types";

export const NS = {
  pacs008: "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08",
  pain001: "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09",
  pacs002: "urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10",
} as const;

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function el(tag: string, value: string | undefined, indent: string): string {
  return value === undefined ? "" : `${indent}<${tag}>${esc(value)}</${tag}>\n`;
}

// PostalAddress24 element order.
const ADDRESS_ORDER: (keyof PostalAddress)[] = [
  "StrtNm", "BldgNb", "BldgNm", "Flr", "PstBx", "PstCd",
  "TwnNm", "DstrctNm", "CtrySubDvsn", "Ctry",
];

export function addressXml(addr: PostalAddress | undefined, indent: string): string {
  if (!addr) return "";
  const inner = indent + "  ";
  let out = `${indent}<PstlAdr>\n`;
  for (const key of ADDRESS_ORDER) out += el(key, addr[key] as string | undefined, inner);
  for (const line of addr.AdrLine ?? []) out += el("AdrLine", line, inner);
  return out + `${indent}</PstlAdr>\n`;
}

function partyXml(tag: string, party: Party, indent: string): string {
  const inner = indent + "  ";
  return (
    `${indent}<${tag}>\n` +
    el("Nm", party.name, inner) +
    addressXml(party.address, inner) +
    `${indent}</${tag}>\n`
  );
}

function accountXml(tag: string, acct: Account, indent: string): string {
  const i1 = indent + "  ";
  const i2 = i1 + "  ";
  const i3 = i2 + "  ";
  const id = acct.iban !== undefined
    ? el("IBAN", acct.iban, i2)
    : `${i2}<Othr>\n${el("Id", acct.other ?? "", i3)}${i2}</Othr>\n`;
  return `${indent}<${tag}>\n${i1}<Id>\n${id}${i1}</Id>\n${indent}</${tag}>\n`;
}

function agentXml(tag: string, bic: string, indent: string): string {
  const i1 = indent + "  ";
  return `${indent}<${tag}>\n${i1}<FinInstnId>\n${el("BICFI", bic, i1 + "  ")}${i1}</FinInstnId>\n${indent}</${tag}>\n`;
}

function purposeXml(code: string | undefined, indent: string): string {
  return code === undefined ? "" : `${indent}<Purp>\n${el("Cd", code, indent + "  ")}${indent}</Purp>\n`;
}

function remittanceXml(text: string | undefined, indent: string): string {
  return text === undefined ? "" : `${indent}<RmtInf>\n${el("Ustrd", text, indent + "  ")}${indent}</RmtInf>\n`;
}

/** pacs.008.001.08 FI-to-FI customer credit transfer (CBPR+ style, one transaction). */
export function buildPacs008(t: CreditTransfer, instructingBic: string, instructedBic: string): string {
  const i2 = "      ";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Document xmlns="${NS.pacs008}">\n` +
    `  <FIToFICstmrCdtTrf>\n` +
    `    <GrpHdr>\n` +
    el("MsgId", t.msgId, i2) +
    el("CreDtTm", t.creDtTm, i2) +
    el("NbOfTxs", "1", i2) +
    `      <SttlmInf>\n        <SttlmMtd>INDA</SttlmMtd>\n      </SttlmInf>\n` +
    `    </GrpHdr>\n` +
    `    <CdtTrfTxInf>\n` +
    `      <PmtId>\n` +
    el("InstrId", t.instrId, i2 + "  ") +
    el("EndToEndId", t.endToEndId, i2 + "  ") +
    el("UETR", t.uetr, i2 + "  ") +
    `      </PmtId>\n` +
    `      <IntrBkSttlmAmt Ccy="${esc(t.currency)}">${esc(t.amount)}</IntrBkSttlmAmt>\n` +
    el("IntrBkSttlmDt", t.valueDate, i2) +
    el("ChrgBr", t.chargeBearer, i2) +
    agentXml("InstgAgt", instructingBic, i2) +
    agentXml("InstdAgt", instructedBic, i2) +
    partyXml("Dbtr", t.debtor, i2) +
    accountXml("DbtrAcct", t.debtor.account, i2) +
    agentXml("DbtrAgt", t.debtorAgent.bic, i2) +
    agentXml("CdtrAgt", t.creditorAgent.bic, i2) +
    partyXml("Cdtr", t.creditor, i2) +
    accountXml("CdtrAcct", t.creditor.account, i2) +
    purposeXml(t.purposeCode, i2) +
    remittanceXml(t.remittanceInfo, i2) +
    `    </CdtTrfTxInf>\n` +
    `  </FIToFICstmrCdtTrf>\n` +
    `</Document>\n`
  );
}

/** pain.001.001.09 customer credit transfer initiation (one payment, one transaction). */
export function buildPain001(t: CreditTransfer): string {
  const i3 = "      ";
  const i4 = "        ";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Document xmlns="${NS.pain001}">\n` +
    `  <CstmrCdtTrfInitn>\n` +
    `    <GrpHdr>\n` +
    el("MsgId", t.msgId, i3) +
    el("CreDtTm", t.creDtTm, i3) +
    el("NbOfTxs", "1", i3) +
    `      <InitgPty>\n` + el("Nm", t.debtor.name, i4) + `      </InitgPty>\n` +
    `    </GrpHdr>\n` +
    `    <PmtInf>\n` +
    el("PmtInfId", t.instrId, i3) +
    el("PmtMtd", "TRF", i3) +
    `      <ReqdExctnDt>\n` + el("Dt", t.valueDate, i4) + `      </ReqdExctnDt>\n` +
    partyXml("Dbtr", t.debtor, i3) +
    accountXml("DbtrAcct", t.debtor.account, i3) +
    agentXml("DbtrAgt", t.debtorAgent.bic, i3) +
    el("ChrgBr", t.chargeBearer, i3) +
    `      <CdtTrfTxInf>\n` +
    `        <PmtId>\n` +
    el("EndToEndId", t.endToEndId, i4 + "  ") +
    el("UETR", t.uetr, i4 + "  ") +
    `        </PmtId>\n` +
    `        <Amt>\n` +
    `          <InstdAmt Ccy="${esc(t.currency)}">${esc(t.amount)}</InstdAmt>\n` +
    `        </Amt>\n` +
    agentXml("CdtrAgt", t.creditorAgent.bic, i4) +
    partyXml("Cdtr", t.creditor, i4) +
    accountXml("CdtrAcct", t.creditor.account, i4) +
    purposeXml(t.purposeCode, i4) +
    remittanceXml(t.remittanceInfo, i4) +
    `      </CdtTrfTxInf>\n` +
    `    </PmtInf>\n` +
    `  </CstmrCdtTrfInitn>\n` +
    `</Document>\n`
  );
}

export interface RejectInput {
  msgId: string;
  creDtTm: string;
  originalMsgId: string;
  originalEndToEndId: string;
  originalUetr: string;
  reasonCode: string;
  additionalInfo: string;
  rejectingBic: string;
}

/** pacs.002.001.10 payment status report rejecting one pacs.008 transaction. */
export function buildPacs002(r: RejectInput): string {
  const i3 = "      ";
  const i4 = "        ";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Document xmlns="${NS.pacs002}">\n` +
    `  <FIToFIPmtStsRpt>\n` +
    `    <GrpHdr>\n` +
    el("MsgId", r.msgId, i3) +
    el("CreDtTm", r.creDtTm, i3) +
    `    </GrpHdr>\n` +
    `    <OrgnlGrpInfAndSts>\n` +
    el("OrgnlMsgId", r.originalMsgId, i3) +
    el("OrgnlMsgNmId", "pacs.008.001.08", i3) +
    `    </OrgnlGrpInfAndSts>\n` +
    `    <TxInfAndSts>\n` +
    el("OrgnlEndToEndId", r.originalEndToEndId, i3) +
    el("OrgnlUETR", r.originalUetr, i3) +
    el("TxSts", "RJCT", i3) +
    `      <StsRsnInf>\n` +
    `        <Orgtr>\n          <Id>\n            <OrgId>\n              <AnyBIC>${esc(r.rejectingBic)}</AnyBIC>\n            </OrgId>\n          </Id>\n        </Orgtr>\n` +
    `        <Rsn>\n` + el("Cd", r.reasonCode, i4 + "  ") + `        </Rsn>\n` +
    el("AddtlInf", r.additionalInfo.slice(0, 105), i4) +
    `      </StsRsnInf>\n` +
    `    </TxInfAndSts>\n` +
    `  </FIToFIPmtStsRpt>\n` +
    `</Document>\n`
  );
}
