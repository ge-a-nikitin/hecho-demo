import type { QaseCase } from "../types.js";

const sessionSuite = ["API", "Access control"] as const;

export const authCases = [
  {
    key: "auth.session-guard.rejects-anonymous",
    suite: sessionSuite,
    title: "refuses a request without a session",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Every protected route resolves its session through this guard, so an anonymous request that got past " +
      "it would expose the whole API. `401` is also what tells the web client to send the visitor to the " +
      "sign-in page instead of showing an empty list.",
    preconditions: "No session cookie in the request and no valid API credential.",
    steps: [
      {
        action: "Call `canActivate` while the session lookup resolves `null`.",
        expected: "The guard throws `UnauthorizedException` and the request handler never runs.",
      },
    ],
  },
  {
    key: "auth.session-guard.rejects-deactivated-account",
    suite: sessionSuite,
    title: "refuses a session whose account was deactivated",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Disabling a user is the product's way of revoking access, and better-auth keeps the existing " +
      "sessions alive. Without this check a deactivated executor would keep working until the cookie " +
      "expired, so the guard refuses the session even though it is technically valid. The message names " +
      "the reason so support can explain the refused login.",
    preconditions: "A valid session belonging to a user with `isActive=false`.",
    steps: [
      {
        action: "Call `canActivate` with that session.",
        expected: "The guard throws `UnauthorizedException(\"This account is deactivated\")`.",
      },
    ],
  },
  {
    key: "auth.session-guard.forwards-request-headers",
    suite: sessionSuite,
    title: "resolves the session from the incoming request headers",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The session lives in a cookie, so the guard has to hand the raw request headers to better-auth. If " +
      "the conversion dropped or rewrote them every browser request would look anonymous and the API would " +
      "answer `401` to signed-in users.",
    steps: [
      {
        action: "Call `canActivate` for a request carrying `authorization: Bearer <token>`.",
        expected:
          "The session lookup receives a `Headers` instance that still carries the original " +
          "`authorization` value.",
      },
    ],
  },
  {
    key: "auth.session-guard.enforces-required-role",
    suite: sessionSuite,
    title: "refuses a role outside the decorator's list",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "`@Roles()` marks the endpoints only some roles may call, and a customer reaching the executor " +
      "board or an executor reaching the user list would break both the workflow and the data " +
      "boundaries. The check also has to hold for a session without any role, which the schema allows.",
    preconditions: "A handler decorated with `@Roles(\"ADMIN\")`.",
    steps: [
      {
        action: "Call `canActivate` with an active executor session.",
        expected: "The guard throws `ForbiddenException`, distinct from the `401` of a missing session.",
      },
      {
        action: "Call `canActivate` with an active session that carries no role at all.",
        expected: "The guard throws the same `ForbiddenException`.",
      },
    ],
  },
  {
    key: "auth.session-guard.admits-required-role",
    suite: sessionSuite,
    title: "admits a role from the decorator's list",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The role check must not be so strict that it locks out the role it names. The guard also stores " +
      "the resolved session on the request, which is how the controllers learn who is acting without " +
      "resolving the session a second time.",
    preconditions: "A handler decorated with `@Roles(\"ADMIN\")` and an active administrator session.",
    steps: [
      {
        action: "Call `canActivate`.",
        expected: "The guard returns `true` and exposes the session as `request.authSession`.",
      },
    ],
  },
  {
    key: "auth.session-guard.allows-any-active-user",
    suite: sessionSuite,
    title: "admits any active user when no role is required",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Routes without `@Roles()` - the own-profile endpoints, for instance - are open to every signed-in " +
      "user regardless of role. Reading the decorator metadata is what makes the guard usable on both " +
      "kinds of route, so an empty requirement must mean \"authenticated is enough\" rather than " +
      "\"nobody\".",
    steps: [
      {
        action: "Call `canActivate` on an undecorated handler with an active customer session.",
        expected: "The guard returns `true`.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
