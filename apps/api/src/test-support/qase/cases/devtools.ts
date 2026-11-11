import type { QaseCase } from "../types.js";

const guardSuite = ["DevTools", "Access guard"] as const;
const seedSuite = ["DevTools", "Seed cleanup"] as const;
const resetSuite = ["DevTools", "Reset"] as const;
const validationSuite = ["DevTools", "Request validation"] as const;
const usersSuite = ["DevTools", "Users"] as const;
const seedImportSuite = ["DevTools", "Seed import"] as const;

export const devtoolsCases = [
  {
    key: "devtools.access-guard.flag-off",
    suite: guardSuite,
    title: "hides devtools endpoints when the feature flag is disabled",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "With `DEVTOOLS_ENABLED=false` the devtools controllers still exist in the bundle, so the guard is " +
      "the only thing keeping reset and seed routes out of reach. It answers `404` rather than `403`: " +
      "outside a development environment the endpoints should not announce their existence at all.",
    preconditions: "`DEVTOOLS_ENABLED=false` with a configured API key.",
    steps: [
      {
        action: "Call `canActivate` with a valid `x-devtools-api-key` header.",
        expected: "The guard throws `NotFoundException`.",
      },
    ],
  },
  {
    key: "devtools.access-guard.missing-key-config",
    suite: guardSuite,
    title: "fails explicitly when enabled without an API key",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Enabling devtools without `DEVTOOLS_API_KEY` is a deployment mistake, not a client error. Answering " +
      "`401` would look like a wrong key and send the operator hunting in the wrong direction, so the guard " +
      "raises `500` and the misconfiguration shows up immediately.",
    preconditions: "`DEVTOOLS_ENABLED=true` and no `DEVTOOLS_API_KEY` in the environment.",
    steps: [
      {
        action: "Call `canActivate` with an arbitrary key header.",
        expected: "The guard throws `InternalServerErrorException`.",
      },
    ],
  },
  {
    key: "devtools.access-guard.rejects-wrong-key",
    suite: guardSuite,
    title: "rejects a missing or incorrect API key",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "The header is compared against the configured key and the comparison is constant-time, so a " +
      "near-miss byte-by-byte guess gains nothing. Both a missing header and a wrong value must end in " +
      "`401` without revealing which of the two conditions failed.",
    preconditions: "`DEVTOOLS_ENABLED=true` with `DEVTOOLS_API_KEY=expected-development-key-at-least-32`.",
    steps: [
      {
        action: "Call `canActivate` without the `x-devtools-api-key` header.",
        expected: "The guard throws `UnauthorizedException`.",
      },
      {
        action: "Call `canActivate` with `x-devtools-api-key: wrong-development-key-at-least-32`.",
        expected: "The guard throws `UnauthorizedException` as well.",
      },
    ],
  },
  {
    key: "devtools.access-guard.accepts-key",
    suite: guardSuite,
    title: "accepts the configured API key",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The guard has to let the documented key through, otherwise the whole suite of devtools tools is " +
      "unusable. Together with the rejection case it pins down both sides of the comparison and catches a " +
      "guard that denies everything.",
    preconditions: "`DEVTOOLS_ENABLED=true` with `DEVTOOLS_API_KEY=expected-development-key-at-least-32`.",
    steps: [
      {
        action: "Call `canActivate` with the configured key in `x-devtools-api-key`.",
        expected: "The guard returns `true` and lets the request continue.",
      },
    ],
  },
  {
    key: "devtools.access-guard.weak-key",
    suite: guardSuite,
    title: "fails explicitly when configured with a weak API key",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "A short key such as `too-short` is guessable, so the guard refuses to run with it instead of " +
      "accepting a weak secret. This is a configuration error too, hence `500` - the operator has to fix " +
      "the environment, and a client cannot influence the outcome.",
    preconditions: "`DEVTOOLS_ENABLED=true` with `DEVTOOLS_API_KEY=too-short`.",
    steps: [
      {
        action: "Call `canActivate` with the same short key.",
        expected: "The guard throws `InternalServerErrorException`.",
      },
    ],
  },
  {
    key: "devtools.seed-cleanup.order",
    suite: seedSuite,
    title: "clears payment reports and invoices before deleting seed orders and users",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "destructive",
    description:
      "The seed reset deletes the demo data without touching the schema, so every foreign key has to be " +
      "respected. Payment reports go before invoices, invoices before orders, and orders before categories, " +
      "sessions and users. Reports created while testing a seed order are picked up as well - they would " +
      "otherwise block the invoice delete - while data that merely lives next to the seed has to survive.",
    preconditions:
      "A fake database seeded with the fixture users, categories and orders, an invoice and a payment " +
      "report created during testing, and an unrelated order with its own invoice, report, category and " +
      "session.",
    steps: [
      {
        action: "Call `clearSeed` on that database.",
        expected:
          "The three fixture users, both fixture orders, the fixture and testing invoices and their " +
          "payment reports are gone, and no foreign-key failure interrupts the transaction.",
      },
      {
        action: "Inspect the rows the cleanup did not own.",
        expected:
          "The unrelated order, its invoice, its payment report, its category and its session are still " +
          "there.",
      },
      {
        action: "Inspect the returned report.",
        expected:
          "`deletedUsers` counts the fixture users, `deletedOrders` counts the fixture order and the " +
          "retired one, and `version` comes from the fixture.",
      },
    ],
  },
  {
    key: "devtools.seed-cleanup.conflict",
    suite: seedSuite,
    title: "reports a conflict when seed records are still referenced elsewhere",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "When a foreign key still points at a seed row the transaction fails with `P2003`, which means the " +
      "environment holds data the cleanup does not know about. Surfacing it as `409` tells the developer " +
      "to look at the leftover reference, while a raw Prisma error would read like a broken tool.",
    preconditions:
      "A fake database whose `workOrder.deleteMany` raises a Prisma `P2003` error, holding seed rows.",
    steps: [
      {
        action: "Call `clearSeed`.",
        expected: "The call rejects with `ConflictException`.",
      },
      {
        action: "Inspect the tables after the failed transaction.",
        expected:
          "The seed user, order and category are still there, because the transaction rolled back and " +
          "left the environment untouched.",
      },
    ],
  },
  {
    key: "devtools.reset.full",
    suite: resetSuite,
    title: "wipes every table in dependency order and recreates the administrator from the environment",
    severity: "blocker",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "destructive",
    description:
      "The reset returns the demo environment to a known state: every table is emptied in dependency " +
      "order, stored files are purged when asked, and a fresh administrator is recreated from `ADMIN_EMAIL` " +
      "and `ADMIN_PASSWORD`, otherwise nobody could sign in afterwards. The password is hashed, and the " +
      "report returns per-table counts so the operator can see what was removed.",
    preconditions:
      "`ADMIN_EMAIL=\" Admin@Example.Test \"`, `ADMIN_PASSWORD=\"reset-password-123\"`, a fake database " +
      "holding rows in every table, and a storage stub that reports `{ deleted: 5, failed: 1 }`.",
    steps: [
      {
        action: "Call `reset({ purgeFiles: true })` on that database.",
        expected:
          "Every business table - sessions, verifications, categories, orders, invoices, payment reports " +
          "and invoice sequences - is empty afterwards, and no foreign-key failure interrupts the " +
          "transaction.",
      },
      {
        action: "Inspect the recreated administrator.",
        expected:
          "The email is normalized to `admin@example.test`, the role is `ADMIN`, the account is active, " +
          "the credential `accountId` matches the user and the stored password verifies against " +
          "`reset-password-123`.",
      },
      {
        action: "Inspect the returned report.",
        expected:
          "It contains the per-table delete counts of the seeded rows, the new administrator ID and " +
          "email, and the file purge result `{ deleted: 5, failed: 1 }` from a single purge call.",
      },
    ],
    postconditions: "The database contains only the freshly created administrator account.",
  },
  {
    key: "devtools.reset.keeps-files",
    suite: resetSuite,
    title: "keeps stored files when the purge is not requested",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "destructive",
    description:
      "The file purge is the slow and irreversible half of the reset, so it stays opt-in: with " +
      "`purgeFiles: false` the database is cleared but object storage is left alone and the report says so " +
      "with a `null` file section. The administrator is still recreated, because a reset without a login is " +
      "a broken environment.",
    preconditions: "`ADMIN_EMAIL` and `ADMIN_PASSWORD` set, with a storage stub that counts purge calls.",
    steps: [
      {
        action: "Call `reset({ purgeFiles: false })`.",
        expected:
          "Object storage is never asked to delete anything, `report.files` is `null` and the administrator " +
          "is still created.",
      },
    ],
  },
  {
    key: "devtools.reset.requires-admin",
    suite: resetSuite,
    title: "refuses to reset when the administrator credentials are not configured",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "A reset that empties every table and then cannot create an administrator would lock everyone out of " +
      "the environment. The credentials are therefore checked before the transaction opens, so the " +
      "database is untouched when the configuration is incomplete.",
    preconditions: "`ADMIN_EMAIL` set and `ADMIN_PASSWORD` missing.",
    steps: [
      {
        action: "Call `reset({ purgeFiles: true })`.",
        expected: "The call rejects with `BadRequestException` and no transaction is opened.",
      },
    ],
  },
  {
    key: "devtools.reset.purge-failure",
    suite: resetSuite,
    title: "reports a failed file purge without undoing the reset",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The database is the source of truth of a reset, so it is committed before object storage is " +
      "touched. A bucket that cannot be reached therefore has to surface in the report as an error while " +
      "the environment stays usable - throwing here would tell the operator the reset failed even though " +
      "the data is already gone and the administrator already exists.",
    preconditions:
      "`ADMIN_EMAIL` and `ADMIN_PASSWORD` set, with a storage stub whose `deleteAll` rejects with " +
      "`Bucket unreachable`.",
    steps: [
      {
        action: "Call `reset({ purgeFiles: true })`.",
        expected:
          "The call resolves, `report.files` is `{ deleted: 0, failed: 0, error: \"Bucket unreachable\" }` " +
          "and the administrator is still created.",
      },
    ],
    postconditions: "The database contains only the freshly created administrator account.",
  },
  {
    key: "devtools.users.create-normalizes",
    suite: usersSuite,
    title: "creates a test account with a normalized email and revokes its sign-up session",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Test accounts are created through the same sign-up Better Auth uses, so a developer does not end up " +
      "with a password hash produced by a different code path. The email is trimmed and lowercased before " +
      "the call - otherwise `New@Example.Test` and `new@example.test` would be two logins for one person - " +
      "and the session the sign-up opens is withdrawn, because the tool must not sign itself in.",
    preconditions:
      "A fake database whose `signUpEmail` mock writes the user, its credential account and a session.",
    steps: [
      {
        action: "Call `createUser(EXECUTOR, \" New.Executor@Example.Test \", \"executor-password\")`.",
        expected: "The returned id belongs to a user stored with `new.executor@example.test`.",
      },
      {
        action: "Inspect the stored user.",
        expected:
          "The email is normalized, the name is the local part of it and the role is `EXECUTOR`.",
      },
      {
        action: "Inspect the sessions.",
        expected: "No session is left, because the sign-up session was revoked.",
      },
    ],
    postconditions: "The environment holds one executor account and no session.",
  },
  {
    key: "devtools.users.create-duplicate",
    suite: usersSuite,
    title: "refuses a second account for an email that is already in use",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Emails are unique, and a duplicate would either fail deep inside Better Auth or, worse, create a " +
      "second account that shares a login. The check runs against the normalized email before sign-up is " +
      "attempted, so a rejected request writes nothing at all.",
    preconditions: "An existing account for `taken@example.test`.",
    steps: [
      {
        action: "Call `createUser(CUSTOMER, \" TAKEN@Example.Test \", \"customer-password\")`.",
        expected: "The call rejects with `ConflictException` before sign-up is attempted.",
      },
      {
        action: "Inspect the users.",
        expected: "Only the pre-existing account is stored.",
      },
    ],
  },
  {
    key: "devtools.users.create-compensates",
    suite: usersSuite,
    title: "removes the account again when the role cannot be applied",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Sign-up and the role assignment are two writes, so the second one can fail after the account exists. " +
      "Leaving that half-created customer behind would hand out a login with the wrong role - worse than a " +
      "refused request - so the service deletes the account it just created and lets the error through.",
    preconditions:
      "A fake database whose `user.update` fails, with a `signUpEmail` mock that writes the user, its " +
      "credential account and a session.",
    steps: [
      {
        action: "Call `createUser(EXECUTOR, \"new.executor@example.test\", \"executor-password\")`.",
        expected: "The call rejects with the database error.",
      },
      {
        action: "Inspect the users, accounts and sessions.",
        expected: "All three tables are empty, so no half-created login survives.",
      },
    ],
  },
  {
    key: "devtools.users.list",
    suite: usersSuite,
    title: "lists the accounts of one role in creation order",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The list feeds the developer's account picker, so it filters on exactly one role and returns " +
      "accounts oldest first. Only the identity and state fields are selected: the payload must not carry " +
      "password hashes or other credential columns to a page that merely lists people.",
    preconditions:
      "A fake database with two executors, one retired executor and one customer, seeded in mixed order.",
    steps: [
      {
        action: "Call `listUsers(EXECUTOR)`.",
        expected:
          "Only the three executors come back, ordered by creation date, including the inactive one.",
      },
      {
        action: "Inspect the fields of a returned account.",
        expected:
          "Exactly `id`, `name`, `email`, `role`, `isActive` and `createdAt` are present.",
      },
    ],
  },

  {
    key: "devtools.users.update-email",
    suite: usersSuite,
    title: "normalizes a new email, unverifies it and ends the sessions",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "A changed email is a new, unproven address: it is normalized like every other email in the system, " +
      "marked unverified, and the sessions opened under the old address are ended so a link sent to the " +
      "previous owner cannot be used against the account. The credential account itself is untouched.",
    preconditions:
      "A fake database with two users, a credential account and a session for the updated one.",
    steps: [
      {
        action: "Call `updateUser(\"user-1\", { email: \" Changed@Example.Test \" })`.",
        expected:
          "The stored email becomes `changed@example.test` and `emailVerified` turns false.",
      },
      {
        action: "Inspect the sessions.",
        expected: "The session of `user-1` is gone while the session of `user-2` survives.",
      },
      {
        action: "Inspect the returned account.",
        expected: "It reports the new email and the unchanged role.",
      },
    ],
  },
  {
    key: "devtools.users.update-password",
    suite: usersSuite,
    title: "replaces the stored password hash and ends the sessions, keeping the email verified",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The password change has to write a hash the sign-in path can verify, and it must not leave a session " +
      "opened with the old password alive - otherwise resetting a leaked password would not lock the thief " +
      "out. The email, and with it its verified state, is not part of this write.",
    preconditions:
      "A fake database with a verified user, its credential account holding the hash of `old-password`, " +
      "and one session.",
    steps: [
      {
        action: "Call `updateUser(\"user-1\", { password: \"new-password-123\" })`.",
        expected:
          "The stored hash verifies against `new-password-123` and no longer against `old-password`.",
      },
      {
        action: "Inspect the user and the sessions.",
        expected: "The email stays verified and the session is gone.",
      },
    ],
  },
  {
    key: "devtools.users.update-without-credential",
    suite: usersSuite,
    title: "refuses a password change for an account without a credential provider",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "An account created through an external identity provider has no password row to replace. Creating " +
      "one would silently turn a provider-only login into a password login, so the request is refused and " +
      "the existing account and sessions stay as they are.",
    preconditions: "A fake database with a user whose only account is a `google` provider row.",
    steps: [
      {
        action: "Call `updateUser(\"user-1\", { password: \"new-password-123\" })`.",
        expected: "The call rejects with `BadRequestException`.",
      },
      {
        action: "Inspect the account and the sessions.",
        expected: "The provider row has no password and the session is still there.",
      },
    ],
  },
  {
    key: "devtools.users.update-rejects",
    suite: usersSuite,
    title: "refuses an empty patch, an unknown user and an email that is already taken",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Three requests have to fail without side effects: a patch that names no field would issue an empty " +
      "update, an unknown id must not read as success, and an email that belongs to somebody else cannot be " +
      "claimed - the unique constraint inside the transaction has to become a conflict, leaving the account " +
      "as it was.",
    preconditions:
      "A fake database with two users and a unique email constraint enforced by the fake.",
    steps: [
      {
        action: "Call `updateUser(\"user-1\", {})`.",
        expected: "The call rejects with `BadRequestException`.",
      },
      {
        action: "Call `updateUser(\"user-missing\", { isActive: false })`.",
        expected: "The call rejects with `NotFoundException`.",
      },
      {
        action: "Call `updateUser(\"user-1\", { email: \"SECOND@example.test\" })`.",
        expected:
          "The call rejects with `ConflictException` and both users keep their original emails.",
      },
    ],
  },

  {
    key: "devtools.validation.reset-confirmation",
    suite: validationSuite,
    title: "accepts a reset only with the confirmation phrase",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "One request empties the whole environment, so the body has to prove the intent: `confirm` must be " +
      "exactly `reset-all-data`, which a Swagger click or a reused curl history cannot supply by accident. " +
      "`purgeFiles` stays optional because keeping the files is the safer default when it is omitted.",
    preconditions: "DevTools are enabled and the caller holds the API key.",
    steps: [
      {
        action: "Validate `confirm: \"reset-all-data\"`, then `confirm: \"reset\"`.",
        expected: "The exact phrase passes; any other value reports an error for `confirm`.",
      },
      {
        action: "Validate `purgeFiles: \"yes\"`, then `purgeFiles: false` and an omitted `purgeFiles`.",
        expected: "The string reports an error for `purgeFiles`; the boolean and the omitted field pass.",
      },
    ],
  },
  {
    key: "devtools.validation.create-user",
    suite: validationSuite,
    title: "validates the role, email and password of a test account",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Development accounts are created straight into the database with a chosen role, so the role has to " +
      "match the enum exactly - `customer` in lowercase would silently become an account without access. " +
      "The password boundary matters because the same rule protects every sign-in path.",
    steps: [
      {
        action: "Validate a customer account with an email and an eight-character password.",
        expected: "The payload passes.",
      },
      {
        action: "Validate `role: \"customer\"`, a seven-character password and `email: \"not-an-email\"`.",
        expected: "Each payload reports an error for `role`, `password` and `email` respectively.",
      },
    ],
  },
  {
    key: "devtools.seed.imports-fixture",
    suite: seedImportSuite,
    title: "imports the fixture with credential accounts, status history and invoices",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The seed is what a developer demos and a reviewer clicks through, so it has to be a usable " +
      "environment rather than rows in tables: every fixture user can sign in with the seed password, " +
      "every order carries the status history it claims, assigned orders carry the assignment behind their " +
      "status, and the invoiced order carries its invoice. The fixture file is read as it is, which keeps " +
      "the case honest when the fixture changes.",
    preconditions:
      "`DEVTOOLS_SEED_PASSWORD=\"seed-password-123\"` and an empty fake database.",
    steps: [
      {
        action: "Call `seed()`.",
        expected:
          "The report names the fixture version, every fixture user with its email, and the number of " +
          "imported orders.",
      },
      {
        action: "Inspect the users and their accounts.",
        expected:
          "Each user is stored verified with its fixture email and role, the executor with its hourly " +
          "rate, and each has a credential account whose hash verifies against the seed password.",
      },
      {
        action: "Inspect the categories and orders.",
        expected:
          "Both categories were created by the fixture administrator, every order carries its fixture " +
          "status with a single history row starting from nothing, and the four assigned orders carry an " +
          "active assignment created by the administrator.",
      },
      {
        action: "Inspect the comments and the invoice.",
        expected:
          "All fixture comments are present, and the invoice keeps its number, `ISSUED` status, decimal " +
          "hours and amount, and no payment date.",
      },
    ],
    postconditions: "The environment matches the fixture and can be signed into with the seed password.",
  },
  {
    key: "devtools.seed.rejects-email-conflict",
    suite: seedImportSuite,
    title: "refuses to import when a fixture email belongs to another account",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "A seed run replaces its own rows, but it must never overwrite an account somebody created by hand: " +
      "the same email under a different id means the fixture would collide with real data. The conflict is " +
      "reported before the transaction opens and names the offending address, so nothing is written.",
    preconditions:
      "A fake database holding an account with id `someone-else` that uses `devtools.customer@example.test`.",
    steps: [
      {
        action: "Call `seed()`.",
        expected: "The call rejects with `ConflictException` naming that email address.",
      },
      {
        action: "Inspect the users, orders and categories.",
        expected: "Only the pre-existing account is stored; no fixture row was created.",
      },
    ],
  },
  {
    key: "devtools.seed.requires-password",
    suite: seedImportSuite,
    title: "refuses to seed without a seed password of at least eight characters",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The seed password is the only credential a reviewer needs, so a missing or too short value would " +
      "produce accounts nobody can sign into - or accounts protected by a password that does not meet the " +
      "rule the sign-up path enforces. The check runs before anything is written.",
    preconditions: "`DEVTOOLS_SEED_PASSWORD` unset, then set to `short`.",
    steps: [
      {
        action: "Call `seed()` with the variable unset.",
        expected: "The call rejects with `BadRequestException`.",
      },
      {
        action: "Call `seed()` with `DEVTOOLS_SEED_PASSWORD=\"short\"`.",
        expected: "The call rejects with `BadRequestException` and no user is created.",
      },
    ],
  },
  {
    key: "devtools.seed.replaces-previous",
    suite: seedImportSuite,
    title: "re-seeds over its own rows instead of failing on them",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "A developer runs the seed again after changing the fixture or after breaking the demo data, so a " +
      "second run has to converge instead of failing on the unique ids it created itself. It removes its " +
      "own records first, which is why two runs leave exactly one copy of every fixture row.",
    preconditions: "An empty fake database and `DEVTOOLS_SEED_PASSWORD=\"seed-password-123\"`.",
    steps: [
      {
        action: "Call `seed()` twice.",
        expected: "Both calls succeed and report the same number of orders.",
      },
      {
        action: "Inspect the tables.",
        expected:
          "Users, accounts, orders, status history rows and invoices each appear exactly as often as in " +
          "the fixture, with no duplicates.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
