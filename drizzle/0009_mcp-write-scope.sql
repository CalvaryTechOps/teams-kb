-- MCP clients get the server's scope list snapshotted onto their row when they
-- register, and the authorize endpoint validates every request against that
-- row. Clients registered before guides:write existed would therefore be
-- refused (invalid_scope) the moment they ask for it. Backfill the new scope
-- so existing agents only need a reconnect, not a re-registration.
UPDATE "oauth_client"
SET "scopes" = array_append("scopes", 'guides:write')
WHERE "scopes" IS NOT NULL
  AND 'guides:read' = ANY("scopes")
  AND NOT ('guides:write' = ANY("scopes"));
