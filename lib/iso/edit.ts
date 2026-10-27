// Applies a repair to the pretty-printed XML in place: only the changed
// element's lines are replaced, so everything else in the message (and the
// before/after diff) stays exactly as it was.
import type { RepairField, RepairValue } from "@/lib/suggest/types";
import { addressXml, esc } from "./build";
import type { PostalAddress } from "./types";

interface Range { start: number; end: number; indent: string }

/** Line range of the first element whose open-tag path ends with `segs`. */
function find(lines: string[], segs: string[], within?: Range): Range | undefined {
  const stack: string[] = [];
  const from = within ? within.start : 0;
  const to = within ? within.end : lines.length - 1;
  let open: { depth: number; start: number; indent: string } | undefined;
  for (let i = from; i <= to; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith("<?")) continue;
    const close = t.match(/^<\/([\w.]+)>/);
    if (close) {
      if (open && stack.length === open.depth) return { start: open.start, end: i, indent: open.indent };
      stack.pop();
      continue;
    }
    const tag = t.match(/^<([\w.]+)[\s>/]/)?.[1];
    if (!tag) continue;
    stack.push(tag);
    const endsWith = segs.every((s, k) => stack[stack.length - segs.length + k] === s);
    const selfClosing = t.endsWith("/>") || new RegExp(`</${tag}>$`).test(t);
    if (!open && stack.length >= segs.length && endsWith) {
      const indent = lines[i].match(/^\s*/)![0];
      if (selfClosing) return { start: i, end: i, indent };
      open = { depth: stack.length, start: i, indent };
    }
    if (selfClosing) stack.pop();
  }
  return undefined;
}

const leaf = (indent: string, tag: string, value: string) => `${indent}<${tag}>${esc(value)}</${tag}>`;
const toLines = (block: string) => block.replace(/\n$/, "").split("\n");

function replace(lines: string[], r: Range, newLines: string[]) {
  lines.splice(r.start, r.end - r.start + 1, ...newLines);
}

function setLeaf(lines: string[], path: string[], value: string): boolean {
  const r = find(lines, path);
  if (!r) return false;
  replace(lines, r, [leaf(r.indent, path[path.length - 1], value)]);
  return true;
}

function setPartyChild(lines: string[], party: "Dbtr" | "Cdtr", child: "Nm" | "PstlAdr", value: string | PostalAddress) {
  const p = find(lines, [party]);
  if (!p) throw new Error(`No ${party} element in the message`);
  const inner = p.indent + "  ";
  const block = child === "Nm" ? [leaf(inner, "Nm", value as string)] : toLines(addressXml(value as PostalAddress, inner));
  const existing = find(lines, [party, child], p);
  if (existing) return replace(lines, existing, block);
  // Insert: Nm first in the party, PstlAdr right after Nm.
  const nm = child === "PstlAdr" ? find(lines, [party, "Nm"], p) : undefined;
  lines.splice((nm ? nm.end : p.start) + 1, 0, ...block);
}

function setPurpose(lines: string[], code: string) {
  if (setLeaf(lines, ["Purp", "Cd"], code)) return;
  const tx = find(lines, ["CdtTrfTxInf"]);
  if (!tx) throw new Error("No CdtTrfTxInf element in the message");
  const indent = tx.indent + "  ";
  const block = [`${indent}<Purp>`, leaf(indent + "  ", "Cd", code), `${indent}</Purp>`];
  const rmt = find(lines, ["CdtTrfTxInf", "RmtInf"], tx);
  lines.splice(rmt ? rmt.start : tx.end, 0, ...block);
}

export function applyChange(xml: string, msgType: string, field: RepairField, value: RepairValue): string {
  const lines = xml.replace(/\n$/, "").split("\n");
  switch (field) {
    case "Dbtr/Nm": setPartyChild(lines, "Dbtr", "Nm", value); break;
    case "Cdtr/Nm": setPartyChild(lines, "Cdtr", "Nm", value); break;
    case "Dbtr/PstlAdr": setPartyChild(lines, "Dbtr", "PstlAdr", value); break;
    case "Cdtr/PstlAdr": setPartyChild(lines, "Cdtr", "PstlAdr", value); break;
    case "CdtrAgt/FinInstnId/BICFI":
    case "DbtrAgt/FinInstnId/BICFI":
      if (!setLeaf(lines, field.split("/"), value as string)) throw new Error(`No ${field} in the message`);
      break;
    case "Purp/Cd": setPurpose(lines, value as string); break;
    case "PmtId/EndToEndId":
      if (!setLeaf(lines, ["PmtId", "EndToEndId"], value as string)) throw new Error("No EndToEndId in the message");
      break;
    case "ValueDate": {
      const path = msgType === "pacs.008" ? ["IntrBkSttlmDt"] : ["ReqdExctnDt", "Dt"];
      if (!setLeaf(lines, path, value as string)) throw new Error("No value date in the message");
      break;
    }
  }
  return lines.join("\n") + "\n";
}

export function applyChanges(xml: string, msgType: string, changes: { fieldPath: RepairField; newValue: RepairValue }[]): string {
  return changes.reduce((x, c) => applyChange(x, msgType, c.fieldPath, c.newValue), xml);
}

/** Line-by-line diff (longest common subsequence), for the side-by-side view. */
export function diffLines(before: string, after: string): { a?: string; b?: string; kind: "same" | "del" | "add" }[] {
  const A = before.replace(/\n$/, "").split("\n");
  const B = after.replace(/\n$/, "").split("\n");
  const dp = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { a?: string; b?: string; kind: "same" | "del" | "add" }[] = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { out.push({ a: A[i], b: B[j], kind: "same" }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ a: A[i++], kind: "del" });
    else out.push({ b: B[j++], kind: "add" });
  }
  while (i < A.length) out.push({ a: A[i++], kind: "del" });
  while (j < B.length) out.push({ b: B[j++], kind: "add" });
  return out;
}
