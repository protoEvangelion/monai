import { describe, expect, test } from "vitest";
import { ruleMatches, rulePatternMatches } from "./rules.match";

describe("rule text matching", () => {
  test("is case insensitive", () => {
    expect(rulePatternMatches("AMAZON", "amazon marketplace")).toBe(true);
    expect(rulePatternMatches("disney plus", "DISNEY PLUS")).toBe(true);
    expect(rulePatternMatches("Starbucks", "STARBUCKS COFFEE")).toBe(true);
  });
});

describe("rule amount matching", () => {
  test("requires both text and amount when both are set", () => {
    expect(
      ruleMatches(
        { pattern: "netflix", amount: 15.99 },
        { merchantName: "NETFLIX.COM", amount: -15.99 },
      ),
    ).toBe(true);
    expect(
      ruleMatches(
        { pattern: "netflix", amount: 15.99 },
        { merchantName: "NETFLIX.COM", amount: 9.99 },
      ),
    ).toBe(false);
  });

  test("amount-only rules ignore merchant text", () => {
    expect(
      ruleMatches(
        { pattern: "", amount: 4.5 },
        { merchantName: "Corner Store", amount: 4.5 },
      ),
    ).toBe(true);
  });

  test("blank amount matches any dollars", () => {
    expect(
      ruleMatches(
        { pattern: "uber", amount: null },
        { merchantName: "Uber", amount: 32.1 },
      ),
    ).toBe(true);
  });
});
