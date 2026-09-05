// When an MCP client's authorization request finds no session, better-auth
// sends the browser to /sign-in with the *signed* authorization query
// appended. Its built-in resume keeps that query in request state, which the
// SAML round-trip (browser → Entra → ACS callback) can't carry, so the sign-in
// card instead sends the user back to the authorize endpoint after SAML with
// the original request. Pure so it can be unit-tested.

/** Parameters the provider adds when it signs the redirect; not part of the request. */
const SIGNATURE_PARAMS = new Set(["sig", "exp", "ba_iat", "ba_pl", "ba_param"]);

/** True when the sign-in page was reached from an OAuth authorize redirect. */
export function isOAuthSignIn(search: URLSearchParams): boolean {
  return search.has("client_id") && search.has("sig");
}

/**
 * The URL to land on after sign-in so authorization continues with the new
 * session. Drops the signature envelope, and any `prompt=login` / `max_age`
 * the client sent — those were satisfied by the sign-in that just happened,
 * and leaving them in would bounce the user straight back to /sign-in.
 */
export function oauthResumeUrl(search: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of search.entries()) {
    if (SIGNATURE_PARAMS.has(key) || key === "max_age") continue;
    if (key === "prompt") {
      const kept = value
        .split(" ")
        .filter((p) => p && p !== "login" && p !== "select_account");
      if (kept.length > 0) params.append(key, kept.join(" "));
      continue;
    }
    params.append(key, value);
  }
  return `/api/auth/oauth2/authorize?${params.toString()}`;
}
