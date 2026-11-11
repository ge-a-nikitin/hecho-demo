import type { QaseCase } from "../types.js";

const guardSuite = ["DevTools", "Access guard"] as const;
const seedSuite = ["DevTools", "Seed cleanup"] as const;
const resetSuite = ["DevTools", "Reset"] as const;
const validationSuite = ["DevTools", "Request validation"] as const;

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
      "otherwise block the invoice delete.",
    preconditions: "A transaction stub that records the order of every `deleteMany` call.",
    steps: [
      {
        action: "Call `clearSeed` on a database containing a seeded order with issued and paid invoices.",
        expected:
          "Deletes run in the order `invoice.findMany`, `invoicePaymentReport.deleteMany`, " +
          "`invoice.deleteMany`, `workOrder.deleteMany`, `category.deleteMany`, `session.deleteMany`, " +
          "`user.deleteMany`.",
      },
      {
        action: "Inspect the invoice IDs used by the two invoice deletes.",
        expected:
          "Both the seeded invoices and the invoice created during testing are deleted, together with all " +
          "of their payment reports.",
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
    preconditions: "A transaction stub whose `$transaction` throws a Prisma `P2003` error.",
    steps: [
      {
        action: "Call `clearSeed`.",
        expected: "The call rejects with `ConflictException`.",
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
      "`ADMIN_EMAIL=\" Admin@Example.Test \"`, `ADMIN_PASSWORD=\"reset-password-123\"` and a stubbed " +
      "transaction that returns fixed delete counts.",
    steps: [
      {
        action: "Call `reset({ purgeFiles: true })`.",
        expected:
          "Deletes run in the order `invoicePaymentReport`, `invoice`, `workOrder`, `category`, `session`, " +
          "`verification`, `user`, `invoiceSequence`, then the administrator is created with its credential " +
          "account.",
      },
      {
        action: "Inspect the recreated administrator.",
        expected:
          "The email is normalized to `admin@example.test`, the role is `ADMIN`, the account is active, the " +
          "credential `accountId` matches the user and the stored password is a hash, not the raw value.",
      },
      {
        action: "Inspect the returned report.",
        expected:
          "It contains the per-table delete counts, the new administrator ID and email, and the file purge " +
          "result `{ deleted: 12, failed: 0 }` from a single purge call.",
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
] as const satisfies readonly QaseCase[];
