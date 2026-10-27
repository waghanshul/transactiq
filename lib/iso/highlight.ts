// Finds which lines of a pretty-printed ISO 20022 message belong to a field
// path such as "Cdtr/PstlAdr/Ctry", so the viewer can highlight them.
// If the element is missing (e.g. no Ctry), the nearest existing parent is
// highlighted instead, which is where the analyst needs to add it.

function segmentsOf(path: string): string[] {
  return path.split("/").filter((s) => s && !s.startsWith("@"));
}

function containsRun(stack: string[], segs: string[]): boolean {
  outer: for (let i = 0; i + segs.length <= stack.length; i++) {
    for (let j = 0; j < segs.length; j++) if (stack[i + j] !== segs[j]) continue outer;
    return true;
  }
  return false;
}

/** 1-based line numbers whose element sits inside the given path. */
export function linesForPath(xml: string, path: string): number[] {
  const lines = xml.replace(/\n$/, "").split("\n");
  let segs = segmentsOf(path);
  while (segs.length) {
    const hits: number[] = [];
    const stack: string[] = [];
    lines.forEach((line, i) => {
      const t = line.trim();
      const close = t.match(/^<\/([\w.]+)>/);
      const open = t.match(/^<([\w.]+)[\s>]/);
      if (close) {
        if (containsRun(stack, segs)) hits.push(i + 1);
        stack.pop();
        return;
      }
      if (!open || t.startsWith("<?")) return;
      stack.push(open[1]);
      if (containsRun(stack, segs)) hits.push(i + 1);
      if (t.endsWith("/>") || new RegExp(`</${open[1]}>$`).test(t)) stack.pop();
    });
    if (hits.length) return hits;
    segs = segs.slice(0, -1);
  }
  return [];
}

export function linesForPaths(xml: string, paths: string[]): number[] {
  return Array.from(new Set(paths.flatMap((p) => linesForPath(xml, p)))).sort((a, b) => a - b);
}
