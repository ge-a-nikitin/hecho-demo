import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { prisma } from "../database/prisma.service.js";
import { authRateLimitOptions } from "./rate-limit.js";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

type Auth = ReturnType<typeof createAuth>;

function createAuth() {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    baseURL: requiredEnvironmentValue("BETTER_AUTH_URL"),
    secret: requiredEnvironmentValue("BETTER_AUTH_SECRET"),
    trustedOrigins: [process.env.FRONTEND_ORIGIN ?? "http://localhost:6200"],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    // Off by default only outside production, which this image does not set:
    // the limiter is configured explicitly so it cannot be lost that way.
    rateLimit: authRateLimitOptions(),
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "CUSTOMER",
          input: false,
        },
        isActive: {
          type: "boolean",
          required: false,
          defaultValue: true,
          input: false,
        },
      },
    },
  });
}

let instance: Auth | undefined;

function authInstance(): Auth {
  instance ??= createAuth();
  return instance;
}

/**
 * Built on the first call rather than at import, so a module that merely imports
 * the authentication module needs no `BETTER_AUTH_URL` or `BETTER_AUTH_SECRET` -
 * which is what lets the offline unit suite run without invented settings. A
 * deployment that lacks them still fails on the first request instead of
 * answering as if nobody were signed in.
 */
export const auth = new Proxy({} as Auth, {
  get: (_target, property) => {
    const built = authInstance();
    const value = Reflect.get(built, property);

    return typeof value === "function" ? value.bind(built) : value;
  },
  // `toNodeHandler` mounts `auth.handler` only when `"handler" in auth` is true,
  // so the proxy has to answer the same probes as the instance it stands for.
  has: (_target, property) => property in authInstance(),
});

export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
