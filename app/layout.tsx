import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "@fontsource/atkinson-hyperlegible-next/400.css";
import "@fontsource/atkinson-hyperlegible-next/600.css";
import "@fontsource/atkinson-hyperlegible-next/700.css";
import "@fontsource/atkinson-hyperlegible-mono/400.css";
import "./globals.css";
import { CutoffClock } from "@/components/cutoff-clock";

export const metadata: Metadata = {
  title: "Repair Desk – payment repair POC",
  description: "Catches ISO 20022 payment errors before sending, suggests fixes, and runs maker-checker repair. Synthetic data only.",
};

const NAV = [
  { href: "/payments", label: "Payments", ready: true },
  { href: "#", label: "Queue", ready: false },
  { href: "#", label: "Insights", ready: false },
  { href: "#", label: "Metrics", ready: false },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="bg-accent-soft px-4 py-1.5 text-center text-xs text-ink">
          Proof of concept. Every client, bank and payment here is synthetic.
        </div>
        <header className="border-b border-rule bg-surface">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Repair Desk
            </Link>
            <nav aria-label="Main" className="flex gap-5 text-sm">
              {NAV.map((item) =>
                item.ready ? (
                  <Link key={item.label} href={item.href} className="font-semibold hover:text-accent">
                    {item.label}
                  </Link>
                ) : (
                  <span key={item.label} className="text-muted" title="Coming in a later sprint">
                    {item.label}
                  </span>
                ),
              )}
            </nav>
            <div className="ml-auto">
              <Suspense fallback={<span className="text-sm text-muted">Loading cut-offs…</span>}>
                <CutoffClock />
              </Suspense>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
