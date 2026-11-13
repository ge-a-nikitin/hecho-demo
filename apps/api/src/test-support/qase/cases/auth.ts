import type { QaseCase } from "../types.js";

const sessionSuite = ["API", "Access control"] as const;
const configurationSuite = ["Auth", "Configuration"] as const;
const rateLimitSuite = ["Auth", "Rate limiting"] as const;

export const authCases = [
  {
    key: "auth.config.mounts-handler",
    suite: configurationSuite,
    title: "answers the handler probe the node adapter mounts it with",
    severity: "blocker",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "`toNodeHandler` decides how to mount the authentication routes by asking `\"handler\" in auth`: " +
      "the property is used when the probe answers true, and the argument itself is treated as the handler " +
      "otherwise. A lazily built instance behind a proxy answers `false` unless the proxy forwards the " +
      "probe, and every `/api/auth/*` request then fails with `handler is not a function` - which is what " +
      "the integration suite reported the first time the instance became lazy. The case keeps the mount " +
      "path honest, because no unit case would otherwise notice a sign-in route that cannot be mounted.",
    preconditions:
      "`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and `DATABASE_URL` set, with a fresh module registry.",
    steps: [
      {
        action: "Import `auth.ts` and ask it whether it carries a `handler`.",
        expected: "The probe answers true, so the node adapter mounts the property instead of the object.",
      },
      {
        action: "Read `auth.handler`.",
        expected: "The property is a function, ready to receive a request.",
      },
    ],
  },
  {
    key: "auth.config.lazy",
    suite: configurationSuite,
    title: "loads the auth and database modules without their settings",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The Better Auth instance and the Prisma client used to be built while their modules were imported, " +
      "so importing anything that reached them required `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and " +
      "`DATABASE_URL`. That made the offline unit suite carry invented placeholders for settings it never " +
      "uses. Building both on first use removes that requirement without weakening it: a deployment that " +
      "forgets the settings still fails on the first sign-in attempt instead of accepting requests.",
    preconditions:
      "`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and `DATABASE_URL` removed from the environment.",
    steps: [
      {
        action: "Import `auth.ts` and `prisma.service.ts` with a fresh module registry.",
        expected: "Both imports resolve and neither throws.",
      },
      {
        action: "Resolve a session through `auth.api.getSession`.",
        expected:
          "The call fails with `BETTER_AUTH_URL is required`, so the missing setting is reported where " +
          "it is used.",
      },
    ],
  },
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
  {
    key: "auth.rate-limit.defaults",
    suite: rateLimitSuite,
    title: "keeps the limiter on with the defaults the application documents",
    severity: "blocker",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "Better Auth enables its own limiter only when `NODE_ENV` is \"production\", and the API image ran " +
      "without `NODE_ENV`: `/api/auth/sign-in/email` accepted unlimited password guesses and " +
      "`/api/auth/sign-up/email` unlimited registrations, each paying for a password hash and database " +
      "rows. The settings are now resolved from the environment with the limiter explicitly on, so the " +
      "control no longer depends on how the container happens to be started. The case pins the documented " +
      "defaults: 60 requests per minute per client for `/api/auth/*`, and 5 per minute for the credential " +
      "endpoints, because guessing a password is the cheapest thing an anonymous caller can do.",
    steps: [
      {
        action: "Resolve the settings with an empty environment.",
        expected:
          "The limiter is enabled with a 60-second window and 60 requests, and `/sign-in/*` and " +
          "`/sign-up/*` carry their own 60-second, 5-request rule.",
      },
    ],
  },
  {
    key: "auth.rate-limit.environment",
    suite: rateLimitSuite,
    title: "reads the switch, the window and the limit from the environment",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "An operator has to be able to raise a limit for a busy office IP or switch the limiter off while " +
      "debugging, without editing code and rebuilding the image. Every knob therefore comes from the " +
      "environment, and the credential rule shares one window and one limit so the two sign-in and " +
      "sign-up paths cannot drift apart.",
    steps: [
      {
        action:
          "Resolve the settings with `AUTH_RATE_LIMIT_ENABLED=false`, `AUTH_RATE_LIMIT_WINDOW=30`, " +
          "`AUTH_RATE_LIMIT_MAX=120`, `AUTH_SIGN_IN_RATE_LIMIT_WINDOW=10` and " +
          "`AUTH_SIGN_IN_RATE_LIMIT_MAX=3`.",
        expected:
          "The switch, the window, the limit and both credential rules carry those values, and setting " +
          "the switch to `false` keeps the rules in place for the next run.",
      },
    ],
  },
  {
    key: "auth.rate-limit.invalid",
    suite: rateLimitSuite,
    title: "refuses a value it cannot read instead of silently ignoring the setting",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "A rate limit that a typo turns into `0`, a negative window or a word would either block every " +
      "sign-in or disable the limit without a trace, and a deployment with a broken limiter looks " +
      "exactly like a healthy one. The resolver therefore fails with the variable name in the message, " +
      "so the container stops at startup where the operator can see it.",
    steps: [
      {
        action: "Resolve the settings with `AUTH_RATE_LIMIT_MAX=0`.",
        expected: "The resolver throws and names `AUTH_RATE_LIMIT_MAX`.",
      },
      {
        action: "Resolve the settings with `AUTH_RATE_LIMIT_WINDOW=-5`, `AUTH_SIGN_IN_RATE_LIMIT_MAX=soon` and `AUTH_RATE_LIMIT_ENABLED=maybe`.",
        expected: "Each call throws and names the variable that carries the unreadable value.",
      },
    ],
  },
  {
    key: "auth.rate-limit.wired-into-instance",
    suite: rateLimitSuite,
    title: "hands the credential rule to the Better Auth instance",
    severity: "blocker",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "Resolving the settings is worthless if the instance drops them: the option has to reach " +
      "`betterAuth()`. The case builds the real instance from the environment and reads the rule back, " +
      "which is what the sign-in path consults before it verifies a password.",
    preconditions:
      "`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and `DATABASE_URL` set, with `AUTH_SIGN_IN_RATE_LIMIT_MAX=7`.",
    steps: [
      {
        action: "Import the auth module with a fresh registry and read `auth.options.rateLimit`.",
        expected:
          "The limiter is enabled and the `/sign-in/*` rule carries the configured window and a limit of 7.",
      },
    ],
  },
  {
    key: "auth.rate-limit.enforced",
    suite: rateLimitSuite,
    title: "answers the fourth password change within ten seconds with a 429",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "security",
    behavior: "negative",
    description:
      "Settings and a running limiter are two different things, and only the real API shows the second: " +
      "a case that stops at the resolved options would stay green even if the handler never consulted " +
      "them. The case drives the password endpoint, whose built-in rule of 3 attempts per 10 seconds is " +
      "stricter than the configured limits, so it stays valid while the suite raises the sign-in limits " +
      "for its own sign-ups. Three failed attempts prove the request reached the handler; the fourth " +
      "must be refused by the limiter, not by a missing session.",
    preconditions:
      "The ephemeral stack from `docker-compose.test.yml` with a freshly created customer session.",
    steps: [
      {
        action:
          "Send `POST /api/auth/change-password` with a wrong `currentPassword` from a signed-in customer.",
        expected: "The API answers `400`, so the request reached the handler and was not refused earlier.",
      },
      {
        action: "Send the same request twice more within ten seconds.",
        expected: "Both attempts answer `400` as well: three attempts of the ten-second window are spent.",
      },
      {
        action: "Send the fourth request within the same window.",
        expected:
          "The API answers `429` with `Too many requests` in the body, while the same session still " +
          "reaches other endpoints: the limiter is scoped to the path, not to the account.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
