// Curated subsets of the ISO 20022 external code sets used by the POC.
// Source: ISO 20022 External Code Sets (iso20022.org). Only the codes the POC
// needs are included; confirm definitions against the current release.

export interface Code {
  code: string;
  name: string;
  definition: string;
}

/** ExternalStatusReason1Code: reasons a payment is rejected (pacs.002). */
export const REASON_CODES: Code[] = [
  { code: "AC01", name: "IncorrectAccountNumber", definition: "Account number is invalid or missing." },
  { code: "AC03", name: "InvalidCreditorAccountNumber", definition: "Creditor account number is invalid or missing." },
  { code: "AC04", name: "ClosedAccountNumber", definition: "Account number specified has been closed on the bank of account's books." },
  { code: "AC06", name: "BlockedAccount", definition: "Account specified is blocked, prohibiting posting of transactions against it." },
  { code: "AG01", name: "TransactionForbidden", definition: "Transaction forbidden on this type of account." },
  { code: "AM02", name: "NotAllowedAmount", definition: "Specific transaction or message amount is greater than allowed maximum." },
  { code: "AM03", name: "NotAllowedCurrency", definition: "Specified message amount is a non-processable currency or outside of the allowed range." },
  { code: "AM05", name: "Duplication", definition: "Duplication." },
  { code: "BE04", name: "MissingCreditorAddress", definition: "Specification of creditor's address, which is required for payment, is missing or not correct." },
  { code: "FF01", name: "InvalidFileFormat", definition: "File format incomplete or invalid." },
  { code: "MS03", name: "NotSpecifiedReasonAgentGenerated", definition: "Reason has not been specified by agent." },
  { code: "NARR", name: "Narrative", definition: "Reason is provided as narrative information in the additional reason information." },
  { code: "RC01", name: "BankIdentifierIncorrect", definition: "Bank identifier code specified in the message has an incorrect format." },
  { code: "RR02", name: "MissingDebtorNameOrAddress", definition: "Specification of the debtor's name and/or address needed for regulatory requirements is insufficient or missing." },
  { code: "RR03", name: "MissingCreditorNameOrAddress", definition: "Specification of the creditor's name and/or address needed for regulatory requirements is insufficient or missing." },
  { code: "RR04", name: "RegulatoryReason", definition: "Regulatory reason." },
];

/** ExternalPurpose1Code: why the payment is being made. */
export const PURPOSE_CODES: Code[] = [
  { code: "SUPP", name: "SupplierPayment", definition: "Transaction is related to a payment to a supplier." },
  { code: "GDDS", name: "PurchaseSaleOfGoods", definition: "Transaction is related to purchase and sale of goods." },
  { code: "SCVE", name: "PurchaseSaleOfServices", definition: "Transaction is related to purchase and sale of services." },
  { code: "TRAD", name: "TradeServices", definition: "Transaction is related to a trade services operation." },
  { code: "INTC", name: "IntraCompanyPayment", definition: "Transaction is an intra-company payment." },
  { code: "LICF", name: "LicenseFee", definition: "Transaction is the payment of a license fee." },
  { code: "RENT", name: "Rent", definition: "Transaction is the payment of rent." },
  { code: "INSU", name: "InsurancePremium", definition: "Transaction is payment of an insurance premium." },
  { code: "TAXS", name: "TaxPayment", definition: "Transaction is the payment of taxes." },
  { code: "LOAN", name: "Loan", definition: "Transaction is related to transfer of loan to borrower." },
  { code: "SALA", name: "SalaryPayment", definition: "Transaction is the payment of salaries." },
  { code: "OTHR", name: "Other", definition: "Other payment purpose." },
];

export const REASON_CODE_SET = new Set(REASON_CODES.map((c) => c.code));
export const PURPOSE_CODE_SET = new Set(PURPOSE_CODES.map((c) => c.code));
