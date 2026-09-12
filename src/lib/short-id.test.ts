import { describe, expect, it } from "vitest";
import {
  generateShortId,
  normalizeShortId,
  permalinkPath,
  permalinkUrl,
  qrLabelPath,
  SHORT_ID_ALPHABET,
  SHORT_ID_LENGTH,
} from "./short-id";

const ALPHABET_RE = new RegExp(`^[${SHORT_ID_ALPHABET}]{${SHORT_ID_LENGTH}}$`);

describe("generateShortId", () => {
  it("produces ids of the configured length from the alphabet only", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateShortId()).toMatch(ALPHABET_RE);
    }
  });

  it("collides only about as often as chance allows", () => {
    // Birthday bound: 10 000 draws from ~14.3 M ids collide ~3.5 times on
    // average; a biased or stuck generator collides hundreds of times.
    const draws = 10_000;
    const seen = new Set<string>();
    for (let i = 0; i < draws; i++) seen.add(generateShortId());
    expect(draws - seen.size).toBeLessThanOrEqual(25);
  });

  it("skips bytes that would bias the distribution", () => {
    // A source that only ever yields 255 must be rejected until it yields
    // something usable; 0 maps to the first symbol.
    let calls = 0;
    const random = (buf: Uint8Array) => {
      calls++;
      buf.fill(calls === 1 ? 255 : 0);
      return buf;
    };
    expect(generateShortId(random)).toBe(SHORT_ID_ALPHABET[0].repeat(SHORT_ID_LENGTH));
    expect(calls).toBe(2);
  });

  it("uses every symbol of the alphabet", () => {
    const used = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      for (const ch of generateShortId()) used.add(ch);
    }
    expect([...used].sort().join("")).toBe([...SHORT_ID_ALPHABET].sort().join(""));
  });
});

describe("normalizeShortId", () => {
  it("lowercases and trims", () => {
    expect(normalizeShortId("  7KQ4X ")).toBe("7kq4x");
  });

  it("accepts characters outside today's alphabet so older or future ids still resolve", () => {
    expect(normalizeShortId("1lo0a")).toBe("1lo0a");
  });

  it("rejects what can never be an id", () => {
    expect(normalizeShortId("")).toBeNull();
    expect(normalizeShortId("x")).toBeNull();
    expect(normalizeShortId("ab cd")).toBeNull();
    expect(normalizeShortId("7kq-4x")).toBeNull();
    expect(normalizeShortId("a".repeat(40))).toBeNull();
    expect(normalizeShortId("../..")).toBeNull();
  });
});

describe("permalink paths", () => {
  it("builds the site-relative and absolute forms", () => {
    expect(permalinkPath("7kq4x")).toBe("/a/7kq4x");
    expect(permalinkUrl("https://kb.example.com", "7kq4x")).toBe(
      "https://kb.example.com/a/7kq4x",
    );
    expect(permalinkUrl("https://kb.example.com///", "7kq4x")).toBe(
      "https://kb.example.com/a/7kq4x",
    );
    expect(qrLabelPath("7kq4x")).toBe("/a/7kq4x/qr");
  });
});
