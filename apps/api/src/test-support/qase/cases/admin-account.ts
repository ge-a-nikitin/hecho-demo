import type { QaseCase } from "../types.js";

const provisioningSuite = ["Auth", "Administrator provisioning"] as const;
const credentialsSuite = ["Auth", "Administrator credentials"] as const;

/**
 * Every deployment runs the provisioning step with `ADMIN_EMAIL` and
 * `ADMIN_PASSWORD` from the environment, so these cases guard the account the
 * whole demo signs in with: a regression here either locks the operator out or
 * quietly rewrites somebody else's account.
 */
export const adminAccountCases = [
  {
    key: "auth.admin-account.creates-missing-administrator",
    suite: provisioningSuite,
    title: "creates the administrator with a credential account when none exists",
    severity: "blocker",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "A fresh database has no account to sign in with, so the first deployment has to create " +
      "one from the environment. The case pins the shape of that row: the `ADMIN` role, a " +
      "verified and active account, and a `credential` account whose hash really answers to " +
      "`ADMIN_PASSWORD`. Without the credential row Better Auth finds the user but has nothing to " +
      "compare the password against, and sign-in fails while the database looks populated.",
    preconditions: "An empty database and `ADMIN_EMAIL` plus `ADMIN_PASSWORD` in the environment.",
    steps: [
      {
        action: "Run the provisioning with `ADMIN_EMAIL=admin@example.test` on an empty database.",
        expected: "One user is created with the `ADMIN` role, `emailVerified` and `isActive` set.",
      },
      {
        action: "Read the account rows of the new user.",
        expected:
          "A single `credential` account holds a hash that `verifyPassword` accepts for the " +
          "environment password.",
      },
    ],
  },
  {
    key: "auth.admin-account.renames-the-single-administrator",
    suite: provisioningSuite,
    title: "moves a new ADMIN_EMAIL onto the existing administrator and keeps its id",
    severity: "blocker",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Rotating `ADMIN_EMAIL` is the reason the provisioning runs on every deployment, and the " +
      "cheap way to implement it - delete the old administrator and insert a new one - would " +
      "fail: categories, status history, invoices and payment reports reference the user with " +
      "`RESTRICT`, and the administrator's own history would be lost. The case therefore pins " +
      "the rename: the row keeps its id, only the email changes, the password follows the " +
      "environment and the sessions of that user are revoked while every other session survives.",
    preconditions:
      "One administrator `old@example.test` with a credential account and a session, one customer " +
      "with its own session.",
    steps: [
      {
        action: "Run the provisioning with `ADMIN_EMAIL=moved@example.test` and a new password.",
        expected: "The outcome reports an update and names `old@example.test` as the previous email.",
      },
      {
        action: "Compare the user rows before and after.",
        expected:
          "The same user id now holds the new email, and no second administrator appeared.",
      },
      {
        action: "Read the sessions of that user and of the customer.",
        expected:
          "The administrator's sessions are gone because its credentials changed, the customer's " +
          "session is untouched.",
      },
      {
        action: "Verify the stored hash against the new password.",
        expected: "`verifyPassword` accepts the new password.",
      },
    ],
  },
  {
    key: "auth.admin-account.leaves-a-matching-administrator-alone",
    suite: provisioningSuite,
    title: "writes nothing when the stored password already matches ADMIN_PASSWORD",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "regression",
    behavior: "positive",
    description:
      "The provisioning runs on every deployment, including deployments that only ship frontend " +
      "code. Re-hashing the same password would be invisible in the database but would revoke the " +
      "sessions of an administrator who did nothing wrong, so an unchanged password must leave " +
      "both the hash and the sessions as they were. The case compares the stored hash by value " +
      "instead of only checking that the password still verifies, which would also pass after a " +
      "rewrite.",
    preconditions: "An administrator whose stored hash answers to the current `ADMIN_PASSWORD`.",
    steps: [
      {
        action: "Run the provisioning with the same credentials.",
        expected: "The outcome reports that nothing changed.",
      },
      {
        action: "Read the credential account and the sessions.",
        expected: "The hash string is byte-identical and the sessions still exist.",
      },
    ],
  },
  {
    key: "auth.admin-account.replaces-a-stale-password",
    suite: provisioningSuite,
    title: "rewrites the password of a disabled administrator and revokes its sessions",
    severity: "blocker",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Changing `ADMIN_PASSWORD` in the secrets is the recovery path for a lost or leaked " +
      "administrator password, so the stored hash has to follow the environment. The same case " +
      "covers the other half of that recovery: an administrator may have been left inactive or " +
      "unverified by an earlier mistake, and the API answers `401` to every request of such an " +
      "account, which the sign-in form shows as a wrong password. Sessions are revoked because a " +
      "password change has to invalidate any token an attacker may hold.",
    preconditions:
      "An inactive, unverified administrator whose stored hash belongs to an old password, with one " +
      "administrator session and one customer session.",
    steps: [
      {
        action: "Run the provisioning with a new `ADMIN_PASSWORD`.",
        expected: "The outcome reports an update with a password change and no email change.",
      },
      {
        action: "Verify the stored hash against the new password and read the user row.",
        expected: "The new password verifies, and the user is active and verified again.",
      },
      {
        action: "Read the sessions.",
        expected: "The administrator's sessions are revoked, the customer's session survives.",
      },
    ],
  },
  {
    key: "auth.admin-account.attaches-a-credential-account",
    suite: provisioningSuite,
    title: "adds the credential account a password-less administrator is missing",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Better Auth keeps the password in the `account` row, not on the user, so a user with the " +
      "`ADMIN` role and no `credential` account cannot sign in at all and the deployment looks " +
      "successful while the demo stays locked. The provisioning therefore has to notice the " +
      "missing row and add it, and it must revoke the sessions of that user because a credential " +
      "was just introduced.",
    preconditions: "An administrator row without any account row and one session of that user.",
    steps: [
      {
        action: "Run the provisioning.",
        expected: "The outcome reports an update with a password change.",
      },
      {
        action: "Read the account rows and the sessions of the administrator.",
        expected:
          "A `credential` account now holds a hash that answers to `ADMIN_PASSWORD`, and the " +
          "sessions are gone.",
      },
    ],
  },
  {
    key: "auth.admin-account.refuses-a-taken-email",
    suite: provisioningSuite,
    title: "stops instead of promoting an account that already owns ADMIN_EMAIL",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Registration is open, so a visitor can take any email that is still free - including the " +
      "one an operator is about to put into `ADMIN_EMAIL`. Promoting that row would hand an " +
      "existing account the `ADMIN` role and the environment password, and reusing the row would " +
      "leave the person's own history under an administrator. The case pins the refusal: the " +
      "provisioning stops with a message naming the account, and nothing about it changes.",
    preconditions: "A `CUSTOMER` account that already holds the configured `ADMIN_EMAIL`.",
    steps: [
      {
        action: "Run the provisioning with that email.",
        expected:
          "It throws `The account <email> already exists and is not an administrator`.",
      },
      {
        action: "Read the user and account rows.",
        expected:
          "The account keeps its `CUSTOMER` role, no second user appears and no credential account " +
          "was written.",
      },
    ],
  },
  {
    key: "auth.admin-account.refuses-ambiguous-administrators",
    suite: provisioningSuite,
    title: "names the competing administrators instead of renaming one of them",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The demo is built around a single administrator, but the devtools and the seed fixtures can " +
      "leave several. Renaming the first one the database happens to return would silently choose " +
      "an account and hide the inconsistency, so the provisioning refuses and lists the candidates " +
      "for the operator to resolve.",
    preconditions: "Two administrators, neither of them holding the configured `ADMIN_EMAIL`.",
    steps: [
      {
        action: "Run the provisioning with a third email.",
        expected: "It throws a message that lists both existing administrator emails.",
      },
      {
        action: "Read the user rows.",
        expected: "Both administrators keep their emails; nothing was renamed or created.",
      },
    ],
  },
  {
    key: "auth.admin-credentials.normalises-the-email",
    suite: credentialsSuite,
    title: "lower-cases and trims ADMIN_EMAIL before it reaches the database",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The sign-in form trims the address a person types but does not change its case, while the " +
      "provisioning and the reset store and compare `ADMIN_EMAIL` in lower case. A secret written " +
      "with a capital letter or a trailing space from a copy-paste would therefore create an " +
      "administrator nobody can sign in as, so the environment value is normalised before any " +
      "query uses it.",
    preconditions: "`ADMIN_EMAIL` with surrounding spaces and a capital letter, and a password.",
    steps: [
      {
        action: "Read the credentials from that environment.",
        expected: "The address comes back trimmed and lower-cased.",
      },
    ],
  },
  {
    key: "auth.admin-credentials.refuses-a-short-password",
    suite: credentialsSuite,
    title: "rejects ADMIN_PASSWORD below the length Better Auth accepts",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Better Auth refuses passwords shorter than eight characters when it creates a credential. " +
      "Without an explicit check the provisioning would write the account and the failure would " +
      "only appear at sign-in, where it reads as a wrong password rather than as a secret that is " +
      "too short. The case pins the early, explicit refusal.",
    preconditions: "`ADMIN_EMAIL` set and `ADMIN_PASSWORD=short`.",
    steps: [
      {
        action: "Read the credentials from that environment.",
        expected:
          "It throws `ADMIN_PASSWORD must be at least 8 characters` before any database write.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
