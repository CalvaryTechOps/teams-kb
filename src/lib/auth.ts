import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { sso } from "@better-auth/sso";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { refreshUserGroups, shouldRefreshGroups } from "@/lib/graph-sync";
import { fetchClientMetadataResource } from "@/lib/mcp/cimd-fetch";
import {
  MCP_ACCESS_TOKEN_SECONDS,
  MCP_ALLOW_DCR,
  MCP_REFRESH_TOKEN_SECONDS,
  MCP_RESOURCE_URL,
  MCP_SCOPE,
  MCP_WRITE_SCOPE,
} from "@/lib/mcp/config";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const SSO_PROVIDER_ID = "entra";

// Claim URIs Entra ID emits in SAML assertions by default.
const ENTRA_CLAIMS = {
  email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  givenName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
  surname: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  // The Entra object id — our join key to Microsoft Graph group data.
  objectId: "http://schemas.microsoft.com/identity/claims/objectidentifier",
} as const;

const acsUrl = `${appUrl}/api/auth/sso/saml2/sp/acs/${SSO_PROVIDER_ID}`;

// Minimal SP metadata; Entra doesn't require signed AuthnRequests, so no SP key pair.
const spMetadataXml = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${appUrl}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService index="1" isDefault="true" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

const samlEnvReady = Boolean(
  process.env.SAML_ENTRY_POINT &&
    process.env.SAML_EMAIL_DOMAIN &&
    process.env.SAML_IDP_CERT &&
    process.env.SAML_IDP_ENTITY_ID,
);
if (!samlEnvReady) {
  console.warn(
    "SAML SSO disabled: set SAML_ENTRY_POINT, SAML_IDP_CERT, SAML_IDP_ENTITY_ID and SAML_EMAIL_DOMAIN.",
  );
}

// SAML attribute values can arrive as string or string[].
function asString(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

export const auth = betterAuth({
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: false },
  user: {
    additionalFields: {
      entraObjectId: {
        type: "string",
        required: false,
        input: false,
      },
      groupsSyncedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    sso({
      provisionUserOnEveryLogin: true,
      async provisionUser({ user, userInfo }) {
        // The `extraFields` mapping below surfaces the objectidentifier claim
        // directly on userInfo as `entraObjectId` (there is no userInfo.attributes).
        const entraObjectId = asString(
          (userInfo as Record<string, unknown>).entraObjectId,
        );
        if (!entraObjectId) {
          console.warn(
            "SAML assertion had no objectidentifier claim; got userInfo keys:",
            Object.keys(userInfo),
          );
          return;
        }

        const [dbUser] = await db
          .update(schema.user)
          .set({ entraObjectId })
          .where(eq(schema.user.id, user.id))
          .returning({ groupsSyncedAt: schema.user.groupsSyncedAt });

        // Awaited so the first-ever login already sees correct group-based
        // permissions (~1s). Never fail the login over a Graph hiccup.
        if (shouldRefreshGroups(dbUser?.groupsSyncedAt)) {
          try {
            await refreshUserGroups(user.id, entraObjectId);
          } catch (err) {
            console.error("group refresh on login failed", err);
          }
        }
      },
      defaultSSO: samlEnvReady
        ? [
            {
              providerId: SSO_PROVIDER_ID,
              domain: process.env.SAML_EMAIL_DOMAIN!,
              samlConfig: {
                issuer: appUrl,
                entryPoint: process.env.SAML_ENTRY_POINT!,
                cert: process.env.SAML_IDP_CERT!,
                audience: appUrl,
                wantAssertionsSigned: true,
                signatureAlgorithm: "sha256",
                digestAlgorithm: "sha256",
                identifierFormat:
                  "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
                idpMetadata: {
                  entityID: process.env.SAML_IDP_ENTITY_ID!,
                },
                spMetadata: {
                  entityID: appUrl,
                  metadata: spMetadataXml,
                },
                mapping: {
                  email: ENTRA_CLAIMS.email,
                  name: ENTRA_CLAIMS.name,
                  firstName: ENTRA_CLAIMS.givenName,
                  lastName: ENTRA_CLAIMS.surname,
                  extraFields: {
                    entraObjectId: ENTRA_CLAIMS.objectId,
                  },
                },
              },
            },
          ]
        : [],
    }),
    // --- MCP (plans/mcp-server.md) ---------------------------------------
    // The KB is the OAuth 2.1 authorization server *and* the protected
    // resource for its own MCP endpoint. Agents discover us via
    // /.well-known/oauth-protected-resource, send staff through the normal
    // SAML sign-in plus a consent page, and receive JWTs audience-bound to
    // MCP_RESOURCE_URL that src/app/api/mcp/route.ts verifies against /jwks.
    jwt(),
    mcp({
      loginPage: "/sign-in",
      consentPage: "/connect/consent",
      resource: MCP_RESOURCE_URL,
      // The OIDC defaults stay so clients that ask for them aren't refused;
      // the protected-resource metadata advertises guides:read and
      // guides:write. Connections approved before the write scope existed
      // keep read-only tokens until the person reconnects.
      scopes: ["openid", "profile", "email", "offline_access", MCP_SCOPE, MCP_WRITE_SCOPE],
      allowDynamicClientRegistration: MCP_ALLOW_DCR,
      allowUnauthenticatedClientRegistration: MCP_ALLOW_DCR,
      accessTokenExpiresIn: MCP_ACCESS_TOKEN_SECONDS,
      refreshTokenExpiresIn: MCP_REFRESH_TOKEN_SECONDS,
    }),
    cimd({
      // Our own transport: the package's Node fetcher can't connect on
      // Node ≥ 20 (see src/lib/mcp/cimd-fetch.ts).
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
    // Must be last: makes server actions set cookies correctly in Next.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
