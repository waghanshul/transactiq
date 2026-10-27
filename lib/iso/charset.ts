// Character set accepted in CBPR+ text fields.
// Based on the CBPR+ "extended" Latin set: letters, digits, space and common
// punctuation. Accented and non-Latin characters are not allowed and must be
// transliterated. Verify against the current CBPR+ usage guidelines before
// relying on this in production.
export const CBPR_ALLOWED = /^[A-Za-z0-9/\-?:().,'+ !#$%&*=^_`{|}~";<>@[\\\]]*$/;

export function isAllowedText(value: string): boolean {
  return CBPR_ALLOWED.test(value);
}

const TRANSLIT: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss",
  é: "e", è: "e", ê: "e", É: "E", á: "a", à: "a", â: "a", ó: "o", ô: "o",
  í: "i", ú: "u", ñ: "n", ç: "c", ø: "o", å: "a", æ: "ae",
  "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "™": "",
};

/** Best-effort transliteration to the allowed set; unknown characters become "?". */
export function transliterate(value: string): string {
  return Array.from(value)
    .map((ch) => (isAllowedText(ch) ? ch : TRANSLIT[ch] ?? "?"))
    .join("");
}
