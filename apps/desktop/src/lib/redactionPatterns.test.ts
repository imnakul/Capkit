import { describe, expect, it } from "vitest";
import type { RecognizedLine } from "../domain/capture";
import {
  findSensitiveSpans,
  maskPreview,
  passesLuhn,
  shannonEntropy,
  suggestRedactions,
  suggestRedactionsFromWeb,
} from "./redactionPatterns";

function kinds(text: string): string[] {
  return findSensitiveSpans(text).map((span) => `${span.kind}:${text.slice(span.start, span.end)}`);
}

function lineOf(text: string, wordWidth = 40): RecognizedLine {
  return {
    text,
    words: text.split(" ").map((word, index) => ({
      text: word,
      bounds: { x: 10 + index * (wordWidth + 5), y: 20, width: wordWidth, height: 14 },
    })),
  };
}

describe("passesLuhn", () => {
  it("accepts valid card numbers and rejects near misses", () => {
    expect(passesLuhn("4111111111111111")).toBe(true);
    expect(passesLuhn("4111111111111112")).toBe(false);
    expect(passesLuhn("411111")).toBe(false);
  });
});

describe("shannonEntropy", () => {
  it("is zero for repeats and high for random strings", () => {
    expect(shannonEntropy("aaaa")).toBe(0);
    expect(shannonEntropy("Zq8xR2mLp9VbT4nWk7HsD3fG")).toBeGreaterThan(4);
  });
});

describe("findSensitiveSpans", () => {
  it("finds emails, spaced card numbers and phone numbers", () => {
    expect(kinds("Mail nakul@example.co.in now")).toEqual(["email:nakul@example.co.in"]);
    expect(kinds("Card 4111 1111 1111 1111 exp")).toEqual(["card:4111 1111 1111 1111"]);
    expect(kinds("Call +91 98765 43210 today")).toEqual(["phone:+91 98765 43210"]);
  });

  it("finds provider tokens and JWTs before the generic secret check", () => {
    expect(kinds("key sk-proj-abcdEFGH1234ijklMNOP")).toEqual(["token:sk-proj-abcdEFGH1234ijklMNOP"]);
    expect(kinds("AKIAIOSFODNN7EXAMPLE")).toEqual(["token:AKIAIOSFODNN7EXAMPLE"]);
    expect(kinds("ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345")).toEqual([
      "token:ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345",
    ]);
    expect(kinds("Bearer eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4")).toEqual([
      "token:eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4",
    ]);
    expect(kinds("secret Zq8xR2mLp9VbT4nWk7HsD3fG")).toEqual(["secret:Zq8xR2mLp9VbT4nWk7HsD3fG"]);
  });

  it("ignores ordinary text, dates, short numbers and failed checksums", () => {
    expect(findSensitiveSpans("Released 2026-10-29 at 21:59, build 4821")).toEqual([]);
    expect(findSensitiveSpans("Order 4111 1111 1111 1112 shipped")).toEqual([]);
    expect(findSensitiveSpans("getElementByIdOrThrowWhenMissing")).toEqual([]);
  });
});

describe("maskPreview", () => {
  it("keeps only the ends of long values", () => {
    expect(maskPreview("nakul@example.com")).toBe("na••••••••om");
    expect(maskPreview("12345")).toBe("•••••");
  });
});

describe("suggestRedactions", () => {
  it("covers every word a multi-word match touches, padded inside the selection", () => {
    const suggestions = suggestRedactions(
      { text: "", language: "en-US", lines: [lineOf("Call +91 98765 43210 today")] },
      { width: 400, height: 100 },
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      kind: "phone",
      bounds: { x: 52, y: 17, width: 136, height: 20 },
    });
  });

  it("clamps padding to the selection edges", () => {
    const suggestions = suggestRedactions(
      {
        text: "",
        language: "en-US",
        lines: [{
          text: "nakul@example.com",
          words: [{ text: "nakul@example.com", bounds: { x: 1, y: 1, width: 98, height: 12 } }],
        }],
      },
      { width: 100, height: 14 },
    );
    expect(suggestions[0]?.bounds).toEqual({ x: 0, y: 0, width: 100, height: 14 });
  });

  it("returns nothing for text without sensitive content", () => {
    expect(
      suggestRedactions(
        { text: "", language: "en-US", lines: [lineOf("Quarterly report draft")] },
        { width: 400, height: 100 },
      ),
    ).toEqual([]);
  });
});

describe("suggestRedactionsFromWeb", () => {
  const selection = { x: 100, y: 50, width: 200, height: 100 };

  it("maps display-local rects into the selection and pads them", () => {
    const [first] = suggestRedactionsFromWeb(
      [{ kind: "email", preview: "ada@example.com", rects: [{ x: 120, y: 70, width: 60, height: 12 }] }],
      selection,
    );
    expect(first?.bounds).toEqual({ x: 17, y: 17, width: 66, height: 18 });
    expect(first?.kind).toBe("email");
    expect(first?.preview).not.toContain("ada@example.com");
  });

  it("clamps to the selection and drops rects outside it", () => {
    const suggestions = suggestRedactionsFromWeb(
      [
        {
          kind: "token",
          preview: "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
          rects: [
            { x: 280, y: 140, width: 80, height: 30 },
            { x: 400, y: 70, width: 20, height: 10 },
            { x: 100, y: 10, width: 20, height: 10 },
          ],
        },
      ],
      selection,
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.bounds).toEqual({ x: 177, y: 87, width: 23, height: 13 });
  });

  it("gives every rectangle of a wrapped match its own id", () => {
    const suggestions = suggestRedactionsFromWeb(
      [{ kind: "card", preview: "4111111111111111", rects: [{ x: 110, y: 60, width: 40, height: 10 }, { x: 110, y: 80, width: 40, height: 10 }] }],
      selection,
    );
    expect(new Set(suggestions.map((s) => s.id)).size).toBe(2);
  });
});
