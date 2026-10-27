# Rule catalogue

Generated from `lib/rules/` by `npm run rules:catalogue`. Do not edit by hand.

22 rules across 9 problem types. Every rule is a pure function with a vitest fixture in `tests/rules.test.ts`.

## 1. Unstructured or malformed address

Next step: Suggest a fix, human approves.

| Rule | What it checks | Source |
| --- | --- | --- |
| `ADDR-UNSTRUCTURED` Address is free text only | Party address uses AdrLine without town and country in their own fields. | Swift CBPR+ postal address requirements (14 Nov 2026); PMPG hybrid address guidance |
| `ADDR-TOWN-COUNTRY-MISSING` Town or country missing | Structured address has no TwnNm or no Ctry (and no free-text lines). | Swift CBPR+ postal address requirements (14 Nov 2026); PMPG hybrid address guidance |
| `ADDR-COUNTRY-CODE` Country is not an ISO code | Ctry is not a two-letter ISO 3166-1 alpha-2 code. | ISO 20022 PostalAddress24: Ctry is CountryCode ([A-Z]{2}, ISO 3166-1) |
| `ADDR-HYBRID-DUPLICATE` Town or country repeated in a free-text line | Hybrid address repeats TwnNm or the country in an AdrLine. | PMPG hybrid address guidance: structured data takes precedence and must not be repeated in AdrLine |
| `ADDR-LINE-LIMITS` Too many or too long address lines | More than 2 AdrLine in a hybrid address, or any AdrLine over 70 characters. | Swift CBPR+ postal address requirements (14 Nov 2026); PMPG hybrid address guidance |

## 2. Missing party name or address

Next step: Suggest a fix, human approves.

| Rule | What it checks | Source |
| --- | --- | --- |
| `PARTY-NAME-MISSING` Party name missing | Debtor or creditor name (Nm) is missing or empty. | CBPR+ usage guidelines: debtor and creditor name are mandatory |
| `PARTY-ADDRESS-MISSING` Party address missing | Debtor or creditor has no postal address at all. | CBPR+ / FATF Recommendation 16: originator and beneficiary information must travel with the payment |

## 3. Account problem

Next step: Never guess: ask the client.

| Rule | What it checks | Source |
| --- | --- | --- |
| `ACCT-IBAN-CHECKSUM` IBAN fails its checksum | IBAN fails the ISO 13616 mod-97 check or the country's length and format. | ISO 13616 (IBAN) |
| `ACCT-FORMAT` Account number malformed or missing | Non-IBAN account is missing or contains characters other than digits. | Corridor account formats (IN, JP, US, SG domestic accounts are numeric) |

## 4. Bank identifier problem

Next step: Suggest a fix, human approves.

| Rule | What it checks | Source |
| --- | --- | --- |
| `BIC-FORMAT` BIC has the wrong format | Agent BIC is not 8 or 11 characters in the ISO 9362 pattern. | ISO 9362 (BIC) |
| `BIC-NOT-IN-DIRECTORY` BIC not in the directory | Well-formed agent BIC that is not in the BIC directory. | BIC directory (SwiftRef in production; synthetic directory in this demo) |
| `BIC-COUNTRY-MISMATCH` Creditor's bank is in a different country | Country in the creditor agent BIC (characters 5-6) differs from the creditor's address country. | ISO 9362: characters 5-6 of a BIC are the ISO country code |

## 5. Regulatory or purpose data missing

Next step: Suggest a fix, human approves.

| Rule | What it checks | Source |
| --- | --- | --- |
| `PURPOSE-REQUIRED` Purpose code missing | Corridor requires a purpose code and Purp/Cd is empty. | Corridor rules (illustrative): e.g. inward remittances to India and UAE need a purpose |
| `PURPOSE-INVALID` Purpose code not recognised | Purp/Cd is not in the ISO ExternalPurpose1Code list. | ISO 20022 External Code Sets: ExternalPurpose1Code |

## 6. Format or schema error

Next step: Safe formatting fix, logged.

| Rule | What it checks | Source |
| --- | --- | --- |
| `FMT-CHARSET` Characters outside the allowed set | Party names contain characters outside the CBPR+ Latin character set. | CBPR+ usage guidelines: extended Latin character set |
| `FMT-E2E-LENGTH` Reference too long | EndToEndId longer than 35 characters. | ISO 20022 Max35Text |
| `FMT-DATE` Date not in ISO format | Settlement or execution date not in YYYY-MM-DD. | ISO 20022 ISODate |
| `FMT-AMOUNT` Amount has the wrong number of decimals | Amount is not a plain decimal, or has decimals the currency doesn't allow (JPY has none). | ISO 4217 minor units; ISO 20022 ActiveCurrencyAndAmount |

## 7. Possible duplicate

Next step: Hold and confirm.

| Rule | What it checks | Source |
| --- | --- | --- |
| `DUP-POSSIBLE` Possible duplicate payment | Same client, creditor, amount, currency and remittance text as a payment received in the previous 30 minutes. | Payments operations duplicate controls |

## 8. Amount or currency not allowed

Next step: Route to payments desk.

| Rule | What it checks | Source |
| --- | --- | --- |
| `AMT-CURRENCY` Currency not accepted on this corridor | Currency is not in the corridor's allowed list. | Corridor rules (illustrative) |
| `AMT-LIMIT` Amount above the corridor limit | Amount exceeds the corridor's single-payment maximum (same currency only). | Corridor rules (illustrative) |

## 9. Possible sanctions match

Next step: Route to compliance, unchanged.

| Rule | What it checks | Source |
| --- | --- | --- |
| `SCREEN-NAME-MATCH` Possible sanctions match | Debtor or creditor name scores 0.9 or higher (Jaro-Winkler) against a watchlist name or alias. | Screening stub over a synthetic watchlist (optionally the public OFAC SDN list) |
