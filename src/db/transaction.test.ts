import { beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();
const end = vi.fn();
const clientCtor = vi.fn();

vi.mock("@neondatabase/serverless", () => ({
  neonConfig: {},
  Client: class {
    constructor(config: unknown) {
      clientCtor(config);
    }
    connect = connect;
    end = end;
  },
}));

const transaction = vi.fn();
vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: () => ({ transaction }),
}));

vi.mock("ws", () => ({ default: class {} }));

const { withTransaction } = await import("./transaction");

describe("withTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue(undefined);
    end.mockResolvedValue(undefined);
    // Mirror drizzle: hand the callback a transaction handle and return its result.
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ tag: "tx" }),
    );
  });

  it("connects, runs the callback in a transaction, and closes the client", async () => {
    const fn = vi.fn().mockResolvedValue("done");

    await expect(withTransaction(fn)).resolves.toBe("done");

    expect(clientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeoutMillis: expect.any(Number) }),
    );
    expect(connect).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledWith(fn);
    expect(fn).toHaveBeenCalledWith({ tag: "tx" });
    expect(end).toHaveBeenCalledOnce();
    // The client must outlive the callback: end() is called after fn resolves.
    expect(end.mock.invocationCallOrder[0]).toBeGreaterThan(
      fn.mock.invocationCallOrder[0],
    );
  });

  it("closes the client and rethrows when the callback fails", async () => {
    const boom = new Error("boom");
    const fn = vi.fn().mockRejectedValue(boom);

    await expect(withTransaction(fn)).rejects.toBe(boom);

    expect(end).toHaveBeenCalledOnce();
  });

  it("does not try to close a client that never connected", async () => {
    connect.mockRejectedValue(new Error("connect timeout"));

    await expect(withTransaction(vi.fn())).rejects.toThrow("connect timeout");

    expect(transaction).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
