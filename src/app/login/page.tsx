"use client";

import { useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { button, buttonGhost, input, label } from "@/lib/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  // false on the server, reads the URL in the browser (avoids a hydration mismatch)
  const expired = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("error") === "expired",
    () => false,
  );

  async function google() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <div className="mx-auto max-w-sm space-y-5">
      <h1 className="text-2xl font-semibold">Log in</h1>
      {expired && (
        <p className="text-sm text-red-600">
          The link has expired. Please request a new one.
        </p>
      )}
      <button onClick={google} className={`${buttonGhost} w-full`}>
        Continue with Google
      </button>
      <form onSubmit={magicLink} className="space-y-3">
        <div>
          <label htmlFor="email" className={label}>
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </div>
        <button type="submit" className={`${button} w-full`}>
          Send login link
        </button>
      </form>
      {status === "sent" && (
        <p className="text-sm text-green-700">
          We sent an email. Open the link to log in.
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">Could not send. Please try again.</p>
      )}
    </div>
  );
}
