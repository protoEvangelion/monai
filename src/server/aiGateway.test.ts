import { describe, expect, test } from "vitest";
import {
  DEFAULT_AI_CATEGORIZE_MODEL,
  GATEWAY_AUTH_ERROR_MESSAGE,
  isGatewayAuthenticationError,
  mapGatewayError,
  resolveCategorizeModel,
} from "./aiGateway";

describe("resolveCategorizeModel", () => {
  test("defaults to the live DeepSeek flash slug", () => {
    expect(resolveCategorizeModel({})).toBe(DEFAULT_AI_CATEGORIZE_MODEL);
    expect(DEFAULT_AI_CATEGORIZE_MODEL).toBe("deepseek/deepseek-v4.1-flash");
  });

  test("honors AI_CATEGORIZE_MODEL when set", () => {
    expect(resolveCategorizeModel({ AI_CATEGORIZE_MODEL: "openai/gpt-5.4" })).toBe(
      "openai/gpt-5.4",
    );
  });

  test("ignores blank overrides", () => {
    expect(resolveCategorizeModel({ AI_CATEGORIZE_MODEL: "  " })).toBe(DEFAULT_AI_CATEGORIZE_MODEL);
  });
});

describe("isGatewayAuthenticationError", () => {
  test("maps GatewayAuthenticationError by name", () => {
    const error = new Error("Authentication failed");
    error.name = "GatewayAuthenticationError";
    expect(isGatewayAuthenticationError(error)).toBe(true);
  });

  test("maps wrapped production GatewayError messages", () => {
    const error = new Error(
      "Unauthenticated. Configure AI_GATEWAY_API_KEY or use a provider module.",
    );
    error.name = "GatewayError";
    expect(isGatewayAuthenticationError(error)).toBe(true);
  });

  test("maps missing OIDC / key mentions", () => {
    expect(isGatewayAuthenticationError(new Error("Set VERCEL_OIDC_TOKEN"))).toBe(true);
  });

  test("does not treat unrelated failures as auth", () => {
    expect(isGatewayAuthenticationError(new Error("rate limited"))).toBe(false);
  });
});

describe("mapGatewayError", () => {
  test("replaces auth failures with a setup message", () => {
    const error = new Error("Authentication failed");
    error.name = "GatewayAuthenticationError";
    expect(() => mapGatewayError(error)).toThrow(GATEWAY_AUTH_ERROR_MESSAGE);
  });

  test("rethrows other errors", () => {
    expect(() => mapGatewayError(new Error("provider down"))).toThrow("provider down");
  });
});
