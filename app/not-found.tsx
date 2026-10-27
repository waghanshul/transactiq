import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 py-10">
      <h1 className="text-xl font-bold">Page not found</h1>
      <p className="text-sm text-muted">The demo data may have been reset since this link was made.</p>
      <Link href="/queue" className="font-semibold text-accent underline-offset-4 hover:underline">Go to the queue</Link>
    </div>
  );
}
