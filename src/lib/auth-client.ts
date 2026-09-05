import { createAuthClient } from "better-auth/react";
import { ssoClient } from "@better-auth/sso/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
  plugins: [
    ssoClient(),
    // Attaches the signed OAuth query from the current page URL to auth
    // requests, which is how the consent page's decision reaches the
    // provider (src/app/connect/consent).
    oauthProviderClient(),
  ],
});

export const { useSession, signIn, signOut } = authClient;
