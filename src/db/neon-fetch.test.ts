import { describe, expect, it, vi } from "vitest";
import {
  classifyFetchFailure,
  createFetchWithRetry,
  isReadOnlyBody,
  isReadOnlySql,
} from "./neon-fetch";

/** Mirror undici: `TypeError: fetch failed` with the real error on `cause`. */
function fetchFailed(cause: unknown): TypeError {
  return new TypeError("fetch failed", { cause });
}

function coded(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe("classifyFetchFailure", () => {
  it("treats connect timeouts, refused and DNS failures as connect-phase", () => {
    for (const code of ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]) {
      expect(classifyFetchFailure(fetchFailed(coded(code)))).toEqual({
        phase: "connect",
        codes: [code],
      });
    }
  });

  it("treats resets and closed sockets as socket-phase", () => {
    const closed = coded("UND_ERR_SOCKET", "other side closed");
    expect(classifyFetchFailure(fetchFailed(closed)).phase).toBe("socket");
    expect(classifyFetchFailure(fetchFailed(coded("ECONNRESET"))).phase).toBe("socket");
  });

  it("reads codes out of an AggregateError from happy-eyeballs connects", () => {
    const agg = new AggregateError([coded("ECONNREFUSED"), coded("ECONNREFUSED")]);
    expect(classifyFetchFailure(fetchFailed(agg))).toEqual({
      phase: "connect",
      codes: ["ECONNREFUSED", "ECONNREFUSED"],
    });
  });

  it("downgrades a mixed AggregateError to socket-phase", () => {
    const agg = new AggregateError([coded("ECONNREFUSED"), coded("ECONNRESET")]);
    expect(classifyFetchFailure(fetchFailed(agg)).phase).toBe("socket");
  });

  it("follows nested causes", () => {
    const nested = new Error("wrapper", { cause: coded("EAI_AGAIN") });
    expect(classifyFetchFailure(fetchFailed(nested)).phase).toBe("connect");
  });

  it("classifies unknown codes, missing codes and non-errors as other", () => {
    expect(classifyFetchFailure(fetchFailed(coded("UND_ERR_ABORTED"))).phase).toBe("other");
    expect(classifyFetchFailure(fetchFailed(new Error("no code"))).phase).toBe("other");
    expect(classifyFetchFailure(new TypeError("fetch failed")).phase).toBe("other");
    expect(classifyFetchFailure("string").phase).toBe("other");
    expect(classifyFetchFailure(undefined).phase).toBe("other");
  });

  it("keeps a certificate error out of both retryable phases", () => {
    const agg = new AggregateError([coded("ECONNREFUSED"), coded("CERT_HAS_EXPIRED")]);
    expect(classifyFetchFailure(fetchFailed(agg)).phase).toBe("other");
  });
});

describe("isReadOnlySql", () => {
  it("accepts SELECT and CTE selects, with comments and whitespace", () => {
    expect(isReadOnlySql('select "id" from "guide"')).toBe(true);
    expect(isReadOnlySql("  \n SELECT 1")).toBe(true);
    expect(isReadOnlySql("-- note\nselect 1")).toBe(true);
    expect(isReadOnlySql("/* note */ select 1")).toBe(true);
    expect(isReadOnlySql('with "s" as (select 1) select * from "s"')).toBe(true);
  });

  it("rejects writes, including data-modifying CTEs", () => {
    expect(isReadOnlySql('insert into "guide" values (1)')).toBe(false);
    expect(isReadOnlySql('update "guide" set "x" = 1')).toBe(false);
    expect(isReadOnlySql('delete from "guide"')).toBe(false);
    expect(
      isReadOnlySql('with "d" as (delete from "guide" returning *) select * from "d"'),
    ).toBe(false);
    expect(isReadOnlySql("")).toBe(false);
    expect(isReadOnlySql("-- only a comment")).toBe(false);
  });
});

describe("isReadOnlyBody", () => {
  it("reads the driver's single-statement body", () => {
    expect(isReadOnlyBody(JSON.stringify({ query: "select 1", params: [] }))).toBe(true);
    expect(isReadOnlyBody(JSON.stringify({ query: "insert into t values (1)", params: [] }))).toBe(false);
  });

  it("requires every statement of a batch to be read-only", () => {
    const ok = { queries: [{ query: "select 1", params: [] }, { query: "select 2", params: [] }] };
    const mixed = { queries: [{ query: "select 1", params: [] }, { query: "update t set a = 1", params: [] }] };
    expect(isReadOnlyBody(JSON.stringify(ok))).toBe(true);
    expect(isReadOnlyBody(JSON.stringify(mixed))).toBe(false);
    expect(isReadOnlyBody(JSON.stringify({ queries: [] }))).toBe(false);
  });

  it("treats anything unparseable as a write", () => {
    expect(isReadOnlyBody(undefined)).toBe(false);
    expect(isReadOnlyBody("not json")).toBe(false);
    expect(isReadOnlyBody(JSON.stringify(null))).toBe(false);
    expect(isReadOnlyBody(JSON.stringify({ other: 1 }))).toBe(false);
    expect(isReadOnlyBody(new Uint8Array(2))).toBe(false);
  });
});

describe("createFetchWithRetry", () => {
  const url = "https://example.neon.tech/sql";
  const readBody = JSON.stringify({ query: "select 1", params: [] });
  const writeBody = JSON.stringify({ query: "insert into t values (1)", params: [] });
  const closed = () => fetchFailed(coded("UND_ERR_SOCKET", "other side closed"));
  const refused = () => fetchFailed(coded("ECONNREFUSED"));

  function build(fetch: ReturnType<typeof vi.fn>) {
    const sleep = vi.fn(async () => {});
    const warn = vi.fn();
    const wrapped = createFetchWithRetry({
      fetch: fetch as never,
      sleep,
      warn,
      delays: [10, 20],
    });
    return { wrapped, sleep, warn };
  }

  it("returns any HTTP response untouched, without retrying", async () => {
    const res = new Response("{}", { status: 400 });
    const fetch = vi.fn(async () => res);
    const { wrapped, sleep } = build(fetch);

    await expect(wrapped(url, { method: "POST", body: readBody })).resolves.toBe(res);
    expect(fetch).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a read on a closed socket and succeeds on the third attempt", async () => {
    const res = new Response("{}");
    const fetch = vi.fn().mockRejectedValueOnce(closed()).mockRejectedValueOnce(closed()).mockResolvedValueOnce(res);
    const { wrapped, sleep, warn } = build(fetch);

    await expect(wrapped(url, { method: "POST", body: readBody })).resolves.toBe(res);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith(
      "db fetch retry",
      expect.objectContaining({
        attempt: 2,
        phase: "socket",
        codes: ["UND_ERR_SOCKET"],
        readOnly: true,
        message: "other side closed",
      }),
    );
  });

  it("passes the same input and init to every attempt", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(refused()).mockResolvedValueOnce(new Response("{}"));
    const { wrapped } = build(fetch);
    const init = { method: "POST", body: readBody, headers: { a: "b" } };

    await wrapped(url, init);
    expect(fetch).toHaveBeenNthCalledWith(1, url, init);
    expect(fetch).toHaveBeenNthCalledWith(2, url, init);
  });

  it("does not retry a write on a closed socket", async () => {
    const err = closed();
    const fetch = vi.fn().mockRejectedValue(err);
    const { wrapped, sleep, warn } = build(fetch);

    await expect(wrapped(url, { method: "POST", body: writeBody })).rejects.toBe(err);
    expect(fetch).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("retries a write when the connection never opened", async () => {
    const res = new Response("{}");
    const fetch = vi.fn().mockRejectedValueOnce(refused()).mockResolvedValueOnce(res);
    const { wrapped, warn } = build(fetch);

    await expect(wrapped(url, { method: "POST", body: writeBody })).resolves.toBe(res);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      "db fetch retry",
      expect.objectContaining({ phase: "connect", readOnly: false }),
    );
  });

  it("does not retry an unclassified failure", async () => {
    const err = fetchFailed(coded("UND_ERR_ABORTED"));
    const fetch = vi.fn().mockRejectedValue(err);
    const { wrapped } = build(fetch);

    await expect(wrapped(url, { method: "POST", body: readBody })).rejects.toBe(err);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("gives up after the budget and rethrows the last error unchanged", async () => {
    const last = closed();
    const fetch = vi.fn().mockRejectedValueOnce(closed()).mockRejectedValueOnce(closed()).mockRejectedValueOnce(last);
    const { wrapped, sleep } = build(fetch);

    await expect(wrapped(url, { method: "POST", body: readBody })).rejects.toBe(last);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("never logs SQL or params", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(refused()).mockResolvedValueOnce(new Response("{}"));
    const { wrapped, warn } = build(fetch);
    const body = JSON.stringify({ query: "select secret from t where x = $1", params: ["user@example.com"] });

    await wrapped(url, { method: "POST", body });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("user@example.com");
  });
});
