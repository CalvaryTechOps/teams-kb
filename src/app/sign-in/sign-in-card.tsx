"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { isOAuthSignIn, oauthResumeUrl } from "@/lib/oauth-resume";
import { Button } from "@/components/ui";

// Copy comes from the admin-editable site settings (src/lib/site-settings.ts)
// via the server page, so this stays a thin client shell around the SSO call.
//
// Two ways to arrive here: a plain page visit (?callbackURL=/where/to/go) or
// an MCP client's OAuth authorization that found no session (the signed
// authorize query is in the URL). In the second case the user must land back
// on the authorize endpoint after SAML — see src/lib/oauth-resume.ts.
export function SignInCard({
  helpText,
  buttonLabel,
  redirectNote,
}: {
  helpText: string;
  buttonLabel: string;
  redirectNote: string;
}) {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthSignIn = isOAuthSignIn(searchParams);
  const callbackURL = oauthSignIn
    ? oauthResumeUrl(searchParams)
    : (searchParams.get("callbackURL") ?? "/");

  async function handleSignIn() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.sso({
      providerId: "entra",
      callbackURL,
    });
    if (error) {
      setError(error.message ?? "Sign-in failed. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-[396px] rounded-2xl border border-grey-200 bg-white px-9 py-10 shadow-md">
      <h2 className="text-[28px] font-black tracking-tight text-ink">
        Sign in
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-grey-500">
        {helpText}
      </p>
      {oauthSignIn && (
        <p className="mt-3 rounded-lg bg-cyan-50 px-3 py-2 text-[13px] leading-relaxed text-grey-700">
          An AI agent is asking to connect to the knowledge base on your behalf.
          Sign in, then review what it may access.
        </p>
      )}
      <div className="mt-7 flex flex-col gap-3">
        <Button size="lg" onClick={handleSignIn} disabled={pending}>
          {pending ? "Redirecting…" : buttonLabel}
        </Button>
        <p className="text-center text-xs text-grey-500">{redirectNote}</p>
        {error && (
          <p className="text-center text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
