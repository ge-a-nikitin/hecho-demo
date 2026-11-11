import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { SessionGuard } from "./session.guard.js";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("./auth.js", () => ({
  auth: { api: { getSession: (options: unknown) => getSession(options) } },
}));

type Session = { user: { id: string; isActive: boolean; role?: string } };
type TestRequest = { headers: Record<string, string>; authSession?: Session };

describe("Auth", () => {
  describe("Session guard", () => {
    beforeEach(() => {
      getSession.mockReset();
    });

    it(qc("auth.session-guard.rejects-anonymous", "refuses a request without a session"), async () => {
      getSession.mockResolvedValue(null);

      await expect(guard().canActivate(context(request()))).rejects.toThrow(UnauthorizedException);
    });

    it(
      qc("auth.session-guard.rejects-deactivated-account", "refuses a session whose account was deactivated"),
      async () => {
        getSession.mockResolvedValue(session({ isActive: false }));

        await expect(guard().canActivate(context(request()))).rejects.toThrow("This account is deactivated");
      },
    );

    it(
      qc("auth.session-guard.forwards-request-headers", "resolves the session from the incoming request headers"),
      async () => {
        getSession.mockResolvedValue(session());

        await guard().canActivate(context(request({ authorization: "Bearer token" })));

        const options = getSession.mock.calls[0]?.[0] as { headers: Headers };
        expect(options.headers).toBeInstanceOf(Headers);
        expect(options.headers.get("authorization")).toBe("Bearer token");
      },
    );

    it(qc("auth.session-guard.enforces-required-role", "refuses a role outside the decorator's list"), async () => {
      getSession.mockResolvedValue(session({ role: "EXECUTOR" }));
      await expect(guard(["ADMIN"]).canActivate(context(request()))).rejects.toThrow(ForbiddenException);

      getSession.mockResolvedValue(session({ role: undefined }));
      await expect(guard(["ADMIN"]).canActivate(context(request()))).rejects.toThrow(ForbiddenException);
    });

    it(qc("auth.session-guard.admits-required-role", "admits a role from the decorator's list"), async () => {
      const active = session({ role: "ADMIN" });
      getSession.mockResolvedValue(active);
      const incoming = request();

      await expect(guard(["ADMIN"]).canActivate(context(incoming))).resolves.toBe(true);
      expect(incoming.authSession).toBe(active);
    });

    it(qc("auth.session-guard.allows-any-active-user", "admits any active user when no role is required"), async () => {
      getSession.mockResolvedValue(session({ role: "CUSTOMER" }));

      await expect(guard().canActivate(context(request()))).resolves.toBe(true);
    });
  });
});

function session(user: Partial<Session["user"]> = {}): Session {
  return { user: { id: "user-1", isActive: true, role: "CUSTOMER", ...user } };
}

function request(headers: Record<string, string> = {}): TestRequest {
  return { headers };
}

function guard(requiredRoles?: string[]): SessionGuard {
  return new SessionGuard({ getAllAndOverride: () => requiredRoles } as unknown as Reflector);
}

function context(incoming: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => incoming as unknown as Request }),
    getHandler: () => handler,
    getClass: () => Handler,
  } as unknown as ExecutionContext;
}

class Handler {}

function handler(): void {}
