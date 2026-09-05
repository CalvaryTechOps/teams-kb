"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui";

// Approve / deny buttons for the OAuth consent page. The oauthProviderClient
// plugin on authClient attaches the signed authorization query from this
// page's URL to the request, which is how the provider knows which
// authorization is being decided. The response names where to send the
// browser next (back to the agent, with a code or an access_denied error).
export function ConsentActions() {
  const [pending, setPending] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setPending(accept ? "accept" : "deny");
    setError(null);
    const { data, error } = await authClient.$fetch<{ redirect_uri: string }>(
      "/oauth2/consent",
      { method: "POST", body: { accept } },
    );
    if (error || !data?.redirect_uri) {
      setError(
        error?.message ??
          "This request has expired. Start the connection again from your AI agent.",
      );
      setPending(null);
      return;
    }
    window.location.assign(data.redirect_uri);
  }

  return (
    <div className="mt-7 flex flex-col gap-3">
      <Button size="lg" onClick={() => decide(true)} disabled={pending !== null}>
        {pending === "accept" ? "Connecting…" : "Allow access"}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        onClick={() => decide(false)}
        disabled={pending !== null}
      >
        {pending === "deny" ? "Cancelling…" : "Deny"}
      </Button>
      {error && (
        <p className="text-center text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
