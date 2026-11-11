import {
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { DevToolsGuard } from "./devtools.guard.js";

const originalEnabled = process.env.DEVTOOLS_ENABLED;
const originalKey = process.env.DEVTOOLS_API_KEY;

describe("DevTools", () => {
  describe("Access guard", () => {
    afterEach(() => {
      restoreEnvironmentValue("DEVTOOLS_ENABLED", originalEnabled);
      restoreEnvironmentValue("DEVTOOLS_API_KEY", originalKey);
    });

    it(qc("devtools.access-guard.flag-off", "hides devtools endpoints when the feature flag is disabled"), () => {
      process.env.DEVTOOLS_ENABLED = "false";
      process.env.DEVTOOLS_API_KEY = "test-key";

      expect(() => guard().canActivate(context("test-key"))).toThrow(NotFoundException);
    });

    it(qc("devtools.access-guard.missing-key-config", "fails explicitly when enabled without an API key"), () => {
      process.env.DEVTOOLS_ENABLED = "true";
      delete process.env.DEVTOOLS_API_KEY;

      expect(() => guard().canActivate(context("test-key"))).toThrow(InternalServerErrorException);
    });

    it(qc("devtools.access-guard.rejects-wrong-key", "rejects a missing or incorrect API key"), () => {
      process.env.DEVTOOLS_ENABLED = "true";
      process.env.DEVTOOLS_API_KEY = "expected-development-key-at-least-32";

      expect(() => guard().canActivate(context(undefined))).toThrow(UnauthorizedException);
      expect(() => guard().canActivate(context("wrong-development-key-at-least-32"))).toThrow(
        UnauthorizedException,
      );
    });

    it(qc("devtools.access-guard.accepts-key", "accepts the configured API key"), () => {
      process.env.DEVTOOLS_ENABLED = "true";
      process.env.DEVTOOLS_API_KEY = "expected-development-key-at-least-32";

      expect(guard().canActivate(context("expected-development-key-at-least-32"))).toBe(true);
    });

    it(qc("devtools.access-guard.weak-key", "fails explicitly when configured with a weak API key"), () => {
      process.env.DEVTOOLS_ENABLED = "true";
      process.env.DEVTOOLS_API_KEY = "too-short";

      expect(() => guard().canActivate(context("too-short"))).toThrow(InternalServerErrorException);
    });
  });
});

function guard(): DevToolsGuard {
  return new DevToolsGuard();
}

function context(apiKey: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => (name === "x-devtools-api-key" ? apiKey : undefined),
      }),
    }),
  } as unknown as ExecutionContext;
}

function restoreEnvironmentValue(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
