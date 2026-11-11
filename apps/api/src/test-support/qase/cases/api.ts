import type { QaseCase } from "../types.js";

const errorSuite = ["API", "Error responses"] as const;
const documentationSuite = ["API", "Documentation"] as const;

export const apiCases = [
  {
    key: "api.error-responses.validation-code",
    suite: errorSuite,
    title: "adds a stable code and preserves validation messages",
    severity: "normal",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Every error the API returns carries a machine-readable `code` next to the HTTP status, so clients " +
      "branch on the code instead of parsing prose. Validation failures must additionally keep the " +
      "per-field message array the DTO produced: the web form renders those messages, and collapsing them " +
      "into a single string loses which field failed.",
    steps: [
      {
        action:
          "Pass a `BadRequestException` carrying the validation messages `[\"title must be longer\"]` " +
          "through `createApiErrorResponse`.",
        expected:
          "The response is `400` with `code: \"BAD_REQUEST\"`, the original message array untouched and " +
          "`error: \"Bad Request\"`.",
      },
    ],
  },
  {
    key: "api.error-responses.forbidden-vs-not-found",
    suite: errorSuite,
    title: "distinguishes forbidden operations from missing records",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The web client reacts differently to `403` and `404`: it hides the screen on a missing record and " +
      "shows a permission notice otherwise. Mapping both onto one status - or one code - would either " +
      "leak the existence of another customer's order or hide a real permission problem.",
    steps: [
      {
        action: "Build an error response from a `ForbiddenException`.",
        expected: "The response carries `code: \"FORBIDDEN\"`.",
      },
      {
        action: "Build an error response from a `NotFoundException`.",
        expected: "The response carries `code: \"NOT_FOUND\"`, distinct from the forbidden code.",
      },
    ],
  },
  {
    key: "api.error-responses.hides-server-details",
    suite: errorSuite,
    title: "does not expose unexpected server error details",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Unexpected exceptions reach the filter with whatever text the failing layer produced, including " +
      "connection strings or SQL fragments. The client must receive a generic `500` body, and the details " +
      "must stay in the server log only - this is the last line of defence against leaking infrastructure " +
      "internals to an authenticated user.",
    steps: [
      {
        action: "Build an error response from a plain `Error(\"database credentials leaked\")`.",
        expected:
          "The response is `500` with `code: \"INTERNAL_SERVER_ERROR\"` and the fixed message " +
          "`An unexpected error occurred.`; the original text appears nowhere in the body.",
      },
    ],
  },
  {
    key: "api.error-responses.oversized-upload",
    suite: errorSuite,
    title: "converts oversized uploads into a client error",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Multer reports a rejected file with `LIMIT_FILE_SIZE`, which is not an HTTP exception. Without an " +
      "explicit mapping the upload failure surfaces as a `500` and looks like a server outage, while the " +
      "user only has to pick a smaller file.",
    steps: [
      {
        action: "Build an error response from a `MulterError` with `code: \"LIMIT_FILE_SIZE\"`.",
        expected: "The response is `413` with `code: \"PAYLOAD_TOO_LARGE\"`.",
      },
    ],
  },
  {
    key: "api.error-responses.unique-violation",
    suite: errorSuite,
    title: "maps database uniqueness violations to a conflict response",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Unique constraints are the only race-free way to enforce things like a single active category name, " +
      "so the losing request fails with Prisma `P2002`. It is a conflict the caller can resolve, not an " +
      "internal error, and the client relies on `409` to show a duplicate-name hint.",
    steps: [
      {
        action: "Build an error response from a `PrismaClientKnownRequestError` with `code: \"P2002\"`.",
        expected: "The response is `409` with `code: \"CONFLICT\"`.",
      },
    ],
  },
  {
    key: "api.documentation.hides-devtools",
    suite: documentationSuite,
    title: "removes devtools routes and schemas from the document while the feature flag is off",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The generated OpenAPI document is published at `/api/docs`. Devtools expose seeding, resetting and " +
      "impersonation, so while the flag is off the document must not advertise them even though the " +
      "controllers still exist in the bundle - a visible route invites probing.",
    steps: [
      {
        action:
          "Build a document containing `/api/orders`, `/api/devtools/users`, `/api/devtools/reset` and the " +
          "matching devtools schemas, then call `hideDisabledDevTools(document, false)`.",
        expected: "Only `/api/orders` and `CreateOrderDto` remain; every devtools path and schema is gone.",
      },
    ],
  },
  {
    key: "api.documentation.keeps-devtools",
    suite: documentationSuite,
    title: "keeps the devtools routes and schemas once the feature flag is on",
    severity: "normal",
    priority: "low",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The same filter must be a no-op for local and staging environments, where the devtools routes are " +
      "documented on purpose. This case is the counterpart of the hiding one: it proves the filter reads " +
      "the flag instead of stripping devtools unconditionally.",
    steps: [
      {
        action: "Call `hideDisabledDevTools(document, true)` on the same fixture.",
        expected: "All three paths and all three schemas are still present, in their original order.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
