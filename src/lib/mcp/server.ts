import "server-only";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MCP_MAX_MARKDOWN_BYTES, MCP_MAX_TITLE_LENGTH } from "./config";
import {
  GENERAL_CATEGORY,
  createDraft,
  getGuide,
  listGuides,
  listSpaces,
  searchGuidesTool,
  type McpToolContext,
} from "./tools";

// One McpServer per request (the handler is stateless), built for the
// authenticated caller. Four read-only tools plus create_draft (which only
// ever writes an unpublished draft); each returns the same JSON as
// `structuredContent` and as a text block, so every client can use it.

const SERVER_NAME = "teams-kb";
const SERVER_VERSION = "0.2.0";

const MAX_QUERY_LENGTH = 200;
const MAX_TAGS = 12;

const slug = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe("URL slug, as returned by other tools");

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const creates = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

function ok(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

export function buildKbServer(ctx: McpToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: ctx.settings.instructions },
  );

  server.registerTool(
    "list_spaces",
    {
      title: "List departments",
      description:
        "Departments (spaces) in the knowledge base that have published guides the signed-in person can read, plus their own departments. Use the slug with list_guides or search_guides.",
      inputSchema: z.object({}),
      outputSchema: z.object({ spaces: z.array(z.looseObject({})) }),
      annotations: readOnly,
    },
    async () => ok({ spaces: await listSpaces(ctx) }),
  );

  server.registerTool(
    "list_guides",
    {
      title: "List guides in a department",
      description:
        `Published guides in one department, newest first. Optional category slug narrows it; "${GENERAL_CATEGORY}" means uncategorized guides. Returns metadata only — call get_guide for content.`,
      inputSchema: z.object({
        space: slug.describe("Department slug from list_spaces"),
        category: slug.optional().describe(`Category slug, or "${GENERAL_CATEGORY}"`),
        limit: z.number().int().min(1).optional().describe("Max results (capped by the server)"),
      }),
      outputSchema: z.object({
        space: z.object({ slug: z.string(), name: z.string() }),
        guides: z.array(z.looseObject({})),
      }),
      annotations: readOnly,
    },
    async (input) => {
      const result = await listGuides(ctx, input);
      if (!result.ok) return fail(result.error);
      return ok({ space: result.space, guides: result.guides });
    },
  );

  server.registerTool(
    "search_guides",
    {
      title: "Search guides",
      description:
        "Full-text search across published guides the signed-in person can read, ranked by relevance. Supports plain words, quoted phrases and -excluded terms. Returns metadata plus a short snippet; call get_guide for the full content.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(MAX_QUERY_LENGTH).describe("Search words"),
        space: slug.optional().describe("Restrict to one department slug"),
        tags: z
          .array(z.string().trim().min(1).max(100))
          .max(MAX_TAGS)
          .optional()
          .describe("Tag slugs; a guide matches when it carries any of them"),
        limit: z.number().int().min(1).optional().describe("Max results (capped by the server)"),
      }),
      outputSchema: z.object({ query: z.string(), guides: z.array(z.looseObject({})) }),
      annotations: readOnly,
    },
    async (input) =>
      ok({ query: input.query, guides: await searchGuidesTool(ctx, input) }),
  );

  server.registerTool(
    "get_guide",
    {
      title: "Get a guide",
      description:
        "One published guide with its metadata and raw content. Identify it by `id`, or by `space` + `slug`. `content` is a BlockNote document (JSON array of blocks); `url` is the page to cite.",
      inputSchema: z.object({
        id: z.string().trim().min(1).max(100).optional().describe("Guide id"),
        space: slug.optional().describe("Department slug (with slug)"),
        slug: slug.optional().describe("Guide slug (with space)"),
      }),
      outputSchema: z.looseObject({
        id: z.string(),
        content: z.array(z.unknown()),
        contentVersion: z.number(),
      }),
      annotations: readOnly,
    },
    async (input) => {
      if (!input.id && !(input.space && input.slug)) {
        return fail("Provide either `id`, or both `space` and `slug`.");
      }
      const doc = await getGuide(ctx, input);
      if (!doc) return fail("No published guide matches that reference, or you don't have access to it.");
      return ok(doc);
    },
  );

  server.registerTool(
    "create_draft",
    {
      title: "Create a draft guide",
      description:
        "Create a NEW guide as an unpublished draft from Markdown, in a department the signed-in person belongs to (admins: any department). " +
        "The draft is visible only to its author, the department's owners and admins; a person must review it in the knowledge base and submit or publish it there — this tool never publishes. " +
        "Supported Markdown: headings, paragraphs, bold/italic/strikethrough/inline code, links, bullet/numbered/task lists, quotes, tables, fenced code (```mermaid becomes a diagram), images by https URL, horizontal rules. No file uploads. " +
        "Do not repeat the title as a first heading (it is shown by the page). Calling twice with the same title makes two drafts, so don't retry a call that succeeded. " +
        "Returns the draft's `url` (view) and `editUrl` for the person to open.",
      inputSchema: z.object({
        space: slug.describe("Department slug from list_spaces"),
        title: z
          .string()
          .trim()
          .min(1)
          .max(MCP_MAX_TITLE_LENGTH)
          .describe("Guide title"),
        markdown: z
          .string()
          .min(1)
          .max(MCP_MAX_MARKDOWN_BYTES)
          .describe("Guide body as Markdown"),
        category: slug
          .optional()
          .describe(`Optional category slug in that department (see list_guides); omit or "${GENERAL_CATEGORY}" for none`),
      }),
      outputSchema: z.looseObject({
        id: z.string(),
        slug: z.string(),
        status: z.literal("draft"),
        url: z.string(),
        editUrl: z.string(),
      }),
      annotations: creates,
    },
    async (input) => {
      const result = await createDraft(ctx, input);
      if (!result.ok) return fail(result.error);
      return ok(result.draft);
    },
  );

  return server;
}
