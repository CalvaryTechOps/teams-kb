import { createAuthClient } from "better-auth/react";
import { ssoClient } from "@better-auth/sso/client";

export const authClient = createAuthClient({
  plugins: [ssoClient()],
});

export const { useSession, signIn, signOut } = authClient;
