import { describe, expect, it } from "vitest";
import { isOAuthSignIn, oauthResumeUrl } from "./oauth-resume";

describe("isOAuthSignIn", () => {
  it("needs both a client_id and a signature", () => {
    expect(isOAuthSignIn(new URLSearchParams("callbackURL=/"))).toBe(false);
    expect(isOAuthSignIn(new URLSearchParams("client_id=abc"))).toBe(false);
    expect(isOAuthSignIn(new URLSearchParams("client_id=abc&sig=x"))).toBe(true);
  });
});

describe("oauthResumeUrl", () => {
  it("keeps the authorization request and drops the signature envelope", () => {
    const url = oauthResumeUrl(
      new URLSearchParams(
        "client_id=abc&redirect_uri=http%3A%2F%2Flocalhost%3A1234%2Fcb&response_type=code" +
          "&code_challenge=xyz&code_challenge_method=S256&state=s1&scope=guides%3Aread" +
          "&exp=123&ba_iat=456&ba_param=client_id&ba_param=exp&sig=deadbeef",
      ),
    );
    const parsed = new URL(url, "http://localhost:3000");
    expect(parsed.pathname).toBe("/api/auth/oauth2/authorize");
    const q = parsed.searchParams;
    expect(q.get("client_id")).toBe("abc");
    expect(q.get("redirect_uri")).toBe("http://localhost:1234/cb");
    expect(q.get("state")).toBe("s1");
    expect(q.get("scope")).toBe("guides:read");
    for (const gone of ["sig", "exp", "ba_iat", "ba_param"]) {
      expect(q.has(gone)).toBe(false);
    }
  });

  it("removes prompt=login and max_age but keeps other prompts", () => {
    const q = new URL(
      oauthResumeUrl(
        new URLSearchParams("client_id=a&sig=s&prompt=login%20consent&max_age=0"),
      ),
      "http://localhost:3000",
    ).searchParams;
    expect(q.get("prompt")).toBe("consent");
    expect(q.has("max_age")).toBe(false);
  });

  it("drops a bare prompt=login entirely", () => {
    const q = new URL(
      oauthResumeUrl(new URLSearchParams("client_id=a&sig=s&prompt=login")),
      "http://localhost:3000",
    ).searchParams;
    expect(q.has("prompt")).toBe(false);
  });
});
