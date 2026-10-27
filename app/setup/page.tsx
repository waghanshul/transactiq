import { SetupForm } from "./setup-form";

export default function SetupPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6 py-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Set up or reset the demo</h1>
        <p className="mt-2 text-sm text-muted">
          Creates the database tables if they don’t exist yet, then loads the synthetic dataset: 300 messages to check
          before sending, 40 rejected payments and the answer key. Running it again resets everything to the same
          starting state, so use it before each demo.
        </p>
      </div>
      <SetupForm />
      <p className="text-xs text-muted">
        The reset secret is the <code className="font-mono">RESET_SECRET</code> value set in Vercel under Settings &gt;
        Environment Variables.
      </p>
    </div>
  );
}
