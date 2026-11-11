import type { QaseCase } from "../types.js";

const profileSuite = ["Users", "Profile"] as const;
const rateSuite = ["Users", "Executor rates"] as const;
const validationSuite = ["Users", "Request validation"] as const;

export const usersCases = [
  {
    key: "users.profile.update-normalizes",
    suite: profileSuite,
    title: "requires the current password and normalizes updated profile data",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Changing the profile is a credential change, so it is gated by the current password even though the " +
      "user is already signed in: a hijacked session must not be able to take the account over silently. " +
      "The stored fields are normalized on the way in - trimmed name, lower-cased email - and an email " +
      "change clears `emailVerified`, because the new address has not been proven yet.",
    preconditions: "A stored credential account whose password hash matches `current-password`.",
    steps: [
      {
        action:
          "Call `updateOwnProfile` with `currentPassword: \"current-password\"`, `name: \"  New Name  \"` and " +
          "`email: \"NEW@example.test\"`.",
        expected:
          "The user update receives `name: \"New Name\"`, `email: \"new@example.test\"` and " +
          "`emailVerified: false`.",
      },
    ],
  },
  {
    key: "users.profile.wrong-password",
    suite: profileSuite,
    title: "does not update profile data when the current password is incorrect",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "The current-password check is the only thing standing between a stolen session and a full account " +
      "takeover. A wrong password must fail with `400` before the user row is touched, and the case asserts " +
      "the absence of the write rather than only the exception.",
    preconditions: "A stored credential account whose password hash matches `current-password`.",
    steps: [
      {
        action: "Call `updateOwnProfile` with `currentPassword: \"wrong-password\"` and a new name.",
        expected:
          "The call rejects with `BadRequestException` and the profile update is never executed.",
      },
    ],
  },
  {
    key: "users.executor-rates.self-service",
    suite: rateSuite,
    title: "lets an active executor set their own hourly rate",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Executors price their own work, and the rate feeds every estimate amount, so it is stored as a " +
      "`Decimal` instead of a float. The update is scoped by `id`, `role: EXECUTOR` and `isActive: true` " +
      "rather than by ID alone, so the same endpoint cannot be used to write a rate onto another account.",
    preconditions: "An active executor account with the existing rate `45.5`.",
    steps: [
      {
        action: "Call `updateOwnHourlyRate(\"executor-1\", 45.5)`.",
        expected:
          "The update is scoped to `{ id: executor-1, role: EXECUTOR, isActive: true }` and writes a " +
          "`Prisma.Decimal` rate.",
      },
      {
        action: "Inspect the returned profile.",
        expected: "The returned `hourlyRate` reads back as `45.5`.",
      },
    ],
  },
  {
    key: "users.executor-rates.inactive-rejected",
    suite: rateSuite,
    title: "rejects a rate update when the account is not an active executor",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Customers and deactivated executors have no hourly rate, and the scoped `updateMany` simply matches " +
      "no row for them. Reporting that as `404` keeps the response honest - the rate resource does not " +
      "exist for this caller - instead of a silent `200` that makes the client believe it saved something.",
    preconditions: "A caller whose account is a customer, so the scoped update matches zero rows.",
    steps: [
      {
        action: "Call `updateOwnHourlyRate(\"customer-1\", 45)`.",
        expected: "The call rejects with `NotFoundException`.",
      },
    ],
  },
  {
    key: "users.executor-rates.active-only-list",
    suite: rateSuite,
    title: "lists only active executors for customer selection",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The customer picks a preferred executor from this list when creating an order, so it must not " +
      "contain deactivated accounts or users of other roles - assigning new work to them would fail later. " +
      "Only public fields are selected, keeping emails and rates out of a customer-facing response.",
    steps: [
      {
        action: "Call `listAvailableExecutors`.",
        expected:
          "The query filters by `{ role: EXECUTOR, isActive: true }` and selects only `id` and `name`.",
      },
    ],
  },
  {
    key: "users.validation.executor-name",
    suite: validationSuite,
    title: "rejects an executor name that is blank or longer than 120 characters",
    severity: "normal",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The executor name is what customers see on their order and on the invoice, so an unnamed executor " +
      "or one with a 20-word name breaks both layouts. Create and update are separate DTOs, and the update " +
      "must stay optional because the panel sends only the fields that changed.",
    steps: [
      {
        action: "Validate a 120- and a 121-character name on create, then a whitespace name on update.",
        expected:
          "The 120-character name and the empty update pass; the 121-character and whitespace names report " +
          "an error for `name`.",
      },
    ],
  },
  {
    key: "users.validation.hourly-rate",
    suite: validationSuite,
    title: "keeps the hourly rate positive with at most four decimals",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The rate multiplies invoice line totals, so a zero, a negative or a five-decimal value produces " +
      "amounts that cannot be rendered with two decimals. The pipe transforms the JSON value before " +
      "validation, which is why a numeric string has to reach the service as a number and a non-numeric " +
      "one has to fail instead of becoming `NaN` inside the amount.",
    preconditions: "The request body is transformed the way the global `ValidationPipe` does it.",
    steps: [
      {
        action:
          "Validate `0.0001`, `1000000`, `0`, `0.00001`, `45.12345`, `1000001`, `\"45.5\"` and " +
          "`\"not-a-rate\"`.",
        expected:
          "Both boundary values and the numeric string pass; zero, the amount below the minimum, the five " +
          "decimals inside the range, the amount above the limit and the non-numeric string report an " +
          "error for `hourlyRate`.",
      },
    ],
  },
  {
    key: "users.validation.profile",
    suite: validationSuite,
    title: "requires the current password and a real change in the profile update",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Changing the login email or the display name is confirmed with the current password, so a stolen " +
      "session alone cannot take over the account. The password field is required even when the payload " +
      "carries nothing else, and a whitespace name is refused because it would render as an empty header.",
    steps: [
      {
        action: "Validate a name-and-email payload with the current password, then a payload without it.",
        expected:
          "The complete payload passes; the payload without `currentPassword` reports an error for it.",
      },
      {
        action: "Validate a whitespace-only `name` with a valid `currentPassword`.",
        expected: "The result reports an error for `name`.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
