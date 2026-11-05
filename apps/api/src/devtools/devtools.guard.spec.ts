import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { DevToolsGuard } from "./devtools.guard.js";

const originalEnabled = process.env.DEVTOOLS_ENABLED;
const originalKey = process.env.DEVTOOLS_API_KEY;

afterEach(() => {
  restoreEnvironmentValue("DEVTOOLS_ENABLED", originalEnabled);
  restoreEnvironmentValue("DEVTOOLS_API_KEY", originalKey);
});

describe("DevToolsGuard", () => {
  it("hides devtools endpoints when the feature flag is disabled", () => {
    process.env.DEVTOOLS_ENABLED = "false";
    process.env.DEVTOOLS_API_KEY = "test-key";

    assert.throws(() => guard().canActivate(context("test-key")), NotFoundException);
  });

  it("fails explicitly when enabled without an API key", () => {
    process.env.DEVTOOLS_ENABLED = "true";
    delete process.env.DEVTOOLS_API_KEY;

    assert.throws(
      () => guard().canActivate(context("test-key")),
      InternalServerErrorException,
    );
  });

  it("rejects a missing or incorrect API key", () => {
    process.env.DEVTOOLS_ENABLED = "true";
    process.env.DEVTOOLS_API_KEY = "expected-development-key-at-least-32";

    assert.throws(() => guard().canActivate(context(undefined)), UnauthorizedException);
    assert.throws(() => guard().canActivate(context("wrong-development-key-at-least-32")), UnauthorizedException);
  });

  it("accepts the configured API key", () => {
    process.env.DEVTOOLS_ENABLED = "true";
    process.env.DEVTOOLS_API_KEY = "expected-development-key-at-least-32";

    assert.equal(guard().canActivate(context("expected-development-key-at-least-32")), true);
  });

  it("fails explicitly when configured with a weak API key", () => {
    process.env.DEVTOOLS_ENABLED = "true";
    process.env.DEVTOOLS_API_KEY = "too-short";

    assert.throws(
      () => guard().canActivate(context("too-short")),
      InternalServerErrorException,
    );
  });
});

function guard(): DevToolsGuard {
  return new DevToolsGuard();
}

function context(apiKey: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => name === "x-devtools-api-key" ? apiKey : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function restoreEnvironmentValue(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
