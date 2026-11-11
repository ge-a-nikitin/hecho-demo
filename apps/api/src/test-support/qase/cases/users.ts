import type { QaseCase } from "../types.js";

const profileSuite = ["Users", "Profile"] as const;
const rateSuite = ["Users", "Executor rates"] as const;
const accountSuite = ["Users", "Accounts"] as const;
const directorySuite = ["Users", "Executors and customers"] as const;
const validationSuite = ["Users", "Request validation"] as const;

export const usersCases = [
  {
    key: "users.profile.update-normalizes",
    suite: profileSuite,
    title: "stores a trimmed name and marks a changed email unverified",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Changing the profile is a credential change, so it is gated by the current password even though the " +
      "user is already signed in: a hijacked session must not take the account over silently. The stored " +
      "fields are normalized on the way in - trimmed name, lower-cased email - and the new address has to " +
      "lose its verification, because the case asserts the saved row rather than the arguments of the write.",
    preconditions: "A stored credential account whose password hash matches `current-password`.",
    steps: [
      {
        action: "Seed a verified customer and call `updateOwnProfile` with the current password.",
        expected: "The call succeeds and returns the profile without a password field.",
      },
      {
        action: "Pass `name: \"  New Name  \"` and `email: \"NEW@example.test\"`.",
        expected:
          "The stored user reads back with `name: \"New Name\"`, `email: \"new@example.test\"` and " +
          "`emailVerified: false`.",
      },
    ],
  },
  {
    key: "users.profile.wrong-password",
    suite: profileSuite,
    title: "leaves the profile untouched when the current password is wrong",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "The current-password check is the only thing between a stolen session and a full account takeover. " +
      "A wrong password has to fail with `400` before the user row is touched, and the case asserts the " +
      "unchanged row as well as the exception, so a check that ran after the write would still fail it.",
    preconditions: "A stored credential account whose password hash matches `current-password`.",
    steps: [
      {
        action: "Call `updateOwnProfile` with `currentPassword: \"wrong-password\"` and a new name.",
        expected: "The call rejects with `BadRequestException`.",
      },
      {
        action: "Read the stored user row.",
        expected: "The name, email and verification flag are exactly what the seed contained.",
      },
    ],
  },
  {
    key: "users.executor-rates.self-service",
    suite: rateSuite,
    title: "stores the hourly rate an executor sets for themselves",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Executors price their own work, and the rate multiplies every invoice line total, so it is stored " +
      "as a `Decimal` instead of a float. The write is scoped by id, role and active flag rather than by " +
      "id alone, so the same endpoint cannot put a rate onto another account; the case reads the saved " +
      "rate back and checks the returned profile renders it with two decimals.",
    preconditions: "An active executor account whose hourly rate is empty.",
    steps: [
      {
        action: "Call `updateOwnHourlyRate(\"executor-1\", 45.5)`.",
        expected: "The call succeeds and returns the executor profile.",
      },
      {
        action: "Read the stored user row.",
        expected: "The rate is a `Prisma.Decimal` with the value `45.5`.",
      },
      {
        action: "Format the returned rate for an invoice.",
        expected: "The value renders as `45.50`.",
      },
    ],
  },
  {
    key: "users.executor-rates.inactive-rejected",
    suite: rateSuite,
    title: "refuses a rate update for anyone who is not an active executor",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Customers and deactivated executors have no hourly rate, and the scoped update matches no row for " +
      "them. Reporting that as `404` keeps the response honest - the rate resource does not exist for " +
      "this caller - instead of a silent `200` that leaves the client believing it saved something. The " +
      "case covers a customer, a deactivated executor and an unknown id, then checks that no rate was " +
      "written anywhere.",
    preconditions: "A customer, an active executor and a deactivated executor, all without a rate.",
    steps: [
      {
        action: "Call `updateOwnHourlyRate` as the customer, the deactivated executor and an unknown id.",
        expected: "Every call rejects with `NotFoundException`.",
      },
      {
        action: "Read the stored user rows.",
        expected: "All three rates are still empty.",
      },
    ],
  },
  {
    key: "users.executor-rates.active-only-list",
    suite: rateSuite,
    title: "offers customers only the active executors, without rates or emails",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The customer picks a preferred executor from this list when creating an order, so it must not " +
      "contain deactivated accounts or other roles - assigning new work to them would fail later. Only " +
      "public fields are selected, which keeps emails and rates out of a customer-facing response, and the " +
      "order is fixed by name so the picker is stable between requests.",
    steps: [
      {
        action: "Seed two active executors, a deactivated executor and a customer, then call " +
          "`listAvailableExecutors`.",
        expected:
          "Exactly the two active executors come back, ordered by name and carrying only `id` and `name`.",
      },
    ],
  },
  {
    key: "users.accounts.deactivate-guard",
    suite: accountSuite,
    title: "keeps an executor active while unfinished orders remain",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Deactivating an executor who still works on an order would leave that order assigned to an account " +
      "that can no longer sign in, so the transition is refused until the work is reassigned. The guard " +
      "runs inside the transaction that locks the row, which means a refusal has to leave the account, its " +
      "sessions and the timestamp exactly as they were - a case that only checks the exception would miss a " +
      "half-applied lock.",
    preconditions: "An active executor with one session and one order that is not finished.",
    steps: [
      {
        action: "Call `setActive(\"executor-1\", false)`.",
        expected: "The call rejects with `ConflictException`.",
      },
      {
        action: "Read the account and its sessions.",
        expected: "The account is still active, its timestamp is untouched and the session survives.",
      },
    ],
  },
  {
    key: "users.accounts.deactivate",
    suite: accountSuite,
    title: "ends every session of a deactivated account",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "A deactivated account has to lose its access at once, which means the stored sessions - not only " +
      "the flag - are what makes the difference: a client holding a cookie keeps working until the session " +
      "rows are gone. The case also checks that the sessions of another account survive, and that a " +
      "customer with unfinished orders is still deactivated, because that guard only concerns executors.",
    preconditions: "An active customer with two sessions, an executor with one session and an open order.",
    steps: [
      {
        action: "Call `setActive(\"customer-1\", false)`.",
        expected: "The call returns the account with `isActive: false`.",
      },
      {
        action: "Read the sessions table.",
        expected: "Only the executor session remains; both customer sessions are gone.",
      },
      {
        action: "Read the orders table.",
        expected: "The open order of the customer is untouched.",
      },
    ],
  },
  {
    key: "users.accounts.password-reset",
    suite: accountSuite,
    title: "replaces the stored password hash and ends the sessions of the account",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "An administrator resets a password when an account is compromised, so the previous password has to " +
      "stop working and every session opened with it has to end; otherwise the attacker keeps both. The " +
      "case verifies the stored hash with the real crypto of Better Auth instead of comparing strings, " +
      "because only that proves which password the account now accepts.",
    preconditions: "An active executor whose stored hash matches `old-password`, with two sessions.",
    steps: [
      {
        action: "Call `resetPassword(\"executor-1\", \"new-password\")`.",
        expected: "The call resolves with `{ success: true }`.",
      },
      {
        action: "Verify `new-password` and `old-password` against the stored hash.",
        expected: "The new password verifies, the old one does not, and the hash itself changed.",
      },
      {
        action: "Read the sessions table.",
        expected: "Both sessions of the account are gone.",
      },
    ],
  },
  {
    key: "users.accounts.reset-scope",
    suite: accountSuite,
    title: "refuses a password reset for an administrator or an account without a password",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "The reset endpoint belongs to the administrator panel for customer and executor accounts, so it is " +
      "scoped by role and active flag: an administrator account is not a target, and an account that has " +
      "no credential provider cannot be given a password through this path. Both branches report a " +
      "distinct error and write nothing.",
    preconditions: "An active administrator and an active executor without a credential account.",
    steps: [
      {
        action: "Call `resetPassword` for the administrator.",
        expected: "The call rejects with `NotFoundException`.",
      },
      {
        action: "Call `resetPassword` for the executor without a password account.",
        expected: "The call rejects with `BadRequestException`.",
      },
      {
        action: "Read the accounts table.",
        expected: "No credential account was created or changed.",
      },
    ],
  },
  {
    key: "users.executors.create",
    suite: directorySuite,
    title: "creates an active executor and drops the session its sign-up opened",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The administrator creates executors from the panel, and the account is born as a customer of the " +
      "sign-up endpoint, so the role has to be set afterwards. The session that sign-up opened belongs to " +
      "the administrator's browser request, not to the new executor, and leaving it would sign the " +
      "administrator into the account they just created. The case asserts the stored account and the " +
      "session table, with the sign-up itself replaced as the boundary.",
    preconditions: "No account yet for the address that is about to be created.",
    steps: [
      {
        action: "Call `createExecutor` with a padded name and an upper-case email.",
        expected: "The returned account is an active executor with trimmed and lower-cased values.",
      },
      {
        action: "Read the user and session tables.",
        expected: "One executor row exists and no session was left behind.",
      },
      {
        action: "Inspect the sign-up the service asked Better Auth for.",
        expected: "It received the trimmed name and the lower-cased email.",
      },
    ],
  },
  {
    key: "users.executors.create-duplicate",
    suite: directorySuite,
    title: "refuses a second executor for an email that already has an account",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "One address, one account: the email is the login, so a duplicate would make sign-in ambiguous and " +
      "split the work history of a person between two rows. The check runs before Better Auth is asked to " +
      "create anything, which is why the case asserts that no sign-up happened and no row was added - the " +
      "unique index alone would report the same error, but after a half-finished creation.",
    preconditions: "A customer account that already uses the address.",
    steps: [
      {
        action: "Call `createExecutor` with the same address in another case.",
        expected: "The call rejects with `ConflictException`.",
      },
      {
        action: "Inspect the sign-up and the user table.",
        expected: "Better Auth was never called and the only row is the original customer.",
      },
    ],
  },
  {
    key: "users.executors.create-rollback",
    suite: directorySuite,
    title: "removes the half-created account when the executor role cannot be stored",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Creation spans two systems: Better Auth owns the account, the API owns the role. When the second " +
      "step fails, the first one has to be undone, otherwise the address stays taken by a customer account " +
      "that nobody can use or recreate. The case makes the role update fail and checks that the account is " +
      "gone rather than only that the request failed.",
    preconditions: "The database rejects every update of a user row.",
    steps: [
      {
        action: "Call `createExecutor` with a fresh address.",
        expected: "The call fails with the database error.",
      },
      {
        action: "Read the user table.",
        expected: "No account remains for the address.",
      },
    ],
  },
  {
    key: "users.executors.update",
    suite: directorySuite,
    title: "renames an executor and reports anyone else as not found",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The administrator renames an executor, and the same write is scoped by role so it cannot be used to " +
      "rewrite a customer through the executor endpoint. Prisma answers a scoped update that matches " +
      "nothing with `P2025`, which has to reach the client as `404` instead of a server error - the case " +
      "covers the successful rename and both miss cases, because only the mapping of that error is easy to " +
      "lose.",
    preconditions: "An executor and a customer, plus an id that belongs to nobody.",
    steps: [
      {
        action: "Call `updateExecutor` for the executor with a padded name.",
        expected: "The stored name is the trimmed one.",
      },
      {
        action: "Call `updateExecutor` for the customer and for the unknown id.",
        expected: "Both calls reject with `NotFoundException`.",
      },
    ],
  },
  {
    key: "users.customers.list",
    suite: directorySuite,
    title: "lists customers separately from executors",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The panel keeps customers and executors on separate screens, so the customer list must not leak " +
      "executors and must be able to include deactivated accounts, because the administrator needs them to " +
      "reactivate someone. Customer rows carry no hourly rate, and the case checks the payload does not " +
      "grow an executor-only field.",
    preconditions: "Two customers, one of them deactivated, and one executor.",
    steps: [
      {
        action: "Call `listCustomers(false)`.",
        expected: "Only the active customer is returned.",
      },
      {
        action: "Call `listCustomers(true)`.",
        expected: "Both customers are returned, ordered by name, and the executor is not among them.",
      },
      {
        action: "Inspect a returned row.",
        expected: "The payload has no `hourlyRate` field.",
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
