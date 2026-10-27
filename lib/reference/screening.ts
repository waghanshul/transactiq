// Synthetic watchlist for the screening stub. These names are invented for the
// demo and do not refer to any real person or company. The stub only routes a
// look-alike to compliance; it never decides a sanctions case.
// `npm run import:sdn` can add names from the public OFAC SDN list (source "ofac").

export interface WatchlistName {
  name: string;
  aliases: string[];
  program: string;
}

export const SYNTHETIC_WATCHLIST: WatchlistName[] = [
  { name: "Zorvex Maritime Holdings", aliases: ["Zorvex Maritime", "ZMH Shipping"], program: "SYNTHETIC-A" },
  { name: "Qelmara Trading FZE", aliases: ["Qelmara General Trading"], program: "SYNTHETIC-A" },
  { name: "Vantorek Industrial Group", aliases: ["Vantorek Industries"], program: "SYNTHETIC-B" },
  { name: "Brisval Shipping Ltd", aliases: ["Brisval Lines"], program: "SYNTHETIC-B" },
  { name: "Corvanth Metals Co", aliases: ["Corvanth Metal Trading"], program: "SYNTHETIC-C" },
];
