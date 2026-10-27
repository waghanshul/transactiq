# ISO 20022 schemas (needed for Sprint 2, task S2-02)

Download these XSD files from the ISO 20022 message catalogue
(https://www.iso20022.org/iso-20022-message-definitions) and save them here
with exactly these names:

| File | Message |
| --- | --- |
| `pacs.008.001.08.xsd` | FI-to-FI customer credit transfer |
| `pacs.002.001.10.xsd` | FI-to-FI payment status report |
| `pain.001.001.09.xsd` | Customer credit transfer initiation |

They are free to download. Commit them so CI and Vercel builds can validate
messages without network access.
