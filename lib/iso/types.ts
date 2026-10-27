// Shared types for the synthetic ISO 20022 messages used by the POC.
// Field names follow ISO 20022 element names so XML mapping stays obvious.

export type CountryCode = "IN" | "JP" | "US" | "AE" | "SG" | "DE" | "GB";

/** ISO 20022 PostalAddress24, limited to the elements the POC uses. */
export interface PostalAddress {
  StrtNm?: string;
  BldgNb?: string;
  BldgNm?: string;
  Flr?: string;
  PstBx?: string;
  PstCd?: string;
  TwnNm?: string;
  DstrctNm?: string;
  CtrySubDvsn?: string;
  Ctry?: string;
  /** Free-text lines. Hybrid allows at most 2 lines of 70 chars alongside TwnNm + Ctry. */
  AdrLine?: string[];
}

export interface Account {
  iban?: string;
  /** Non-IBAN account identifier (e.g. US, IN, JP, SG). */
  other?: string;
}

export interface Party {
  name: string;
  address?: PostalAddress;
  account: Account;
}

export interface Agent {
  bic: string;
}

/** A single customer credit transfer, the common shape behind pacs.008 and pain.001. */
export interface CreditTransfer {
  msgId: string;
  creDtTm: string; // ISO date-time
  instrId: string;
  endToEndId: string;
  uetr: string;
  amount: string; // decimal string, e.g. "1250.00"
  currency: string;
  valueDate: string; // YYYY-MM-DD
  chargeBearer: "SHAR" | "DEBT" | "CRED";
  debtor: Party;
  debtorAgent: Agent;
  creditor: Party;
  creditorAgent: Agent;
  purposeCode?: string;
  remittanceInfo?: string;
}

export type MsgType = "pacs.008" | "pain.001";
