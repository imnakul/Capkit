"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

export function EmailCaptureForm(): React.JSX.Element {
  const [status, setStatus] = useState<"idle" | "submitted">("idle");
  const [email, setEmail] = useState("");

  // TODO: wire to the real waitlist endpoint once one exists — this only
  // simulates the confirmed state locally, no request is sent.
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!email) return;
    setStatus("submitted");
  }

  if (status === "submitted") {
    return (
      <p
        role="status"
        className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-[0.08em] text-focus"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-focus" aria-hidden="true" />
        You&rsquo;re on the list — we&rsquo;ll email you at launch.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-3 sm:flex-row"
      aria-label="Join the Windows beta waitlist"
    >
      <label htmlFor="email" className="sr-only">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@company.com"
        autoComplete="email"
        className="w-full flex-1 rounded-full border border-ink/20 bg-paper px-5 py-3 font-sans text-[15px] text-ink placeholder:text-ink/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <Button type="submit" variant="primary" className="!bg-ink !border-ink !text-paper hover:!bg-transparent hover:!text-ink">
        Notify me
      </Button>
    </form>
  );
}
