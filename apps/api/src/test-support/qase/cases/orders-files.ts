import type { QaseCase } from "../types.js";

const filesSuite = ["Orders", "Files"] as const;

export const ordersFilesCases = [
  {
    key: "orders.files.requires-file",
    suite: filesSuite,
    title: "refuses an upload without a file",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The upload route runs for any multipart request, including one where the browser posted no file, for " +
      "example after the user cleared the input. Refusing it with a client error keeps an empty attachment " +
      "row - and an empty object in the bucket - from appearing in the order.",
    steps: [
      {
        action: "Call `upload` with `file: undefined`.",
        expected:
          "The service throws `BadRequestException(\"A file is required\")` before checking access or " +
          "touching the storage.",
      },
    ],
  },
  {
    key: "orders.files.rejects-oversized-file",
    suite: filesSuite,
    title: "refuses a file above the 1 MB limit",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Attachments are photos of damaged parts, not archives, so the API caps them at 1 MB. The check has " +
      "to happen before the object is stored: an oversized upload that is written first and rejected later " +
      "still costs the bucket space and the bandwidth of the transfer.",
    steps: [
      {
        action: "Call `upload` with a file of 1 048 577 bytes.",
        expected:
          "The service throws `BadRequestException(\"Files may not exceed 1 MB\")` and the storage " +
          "receives no `put`.",
      },
    ],
  },
  {
    key: "orders.files.accepts-limit-size",
    suite: filesSuite,
    title: "accepts a file of exactly the 1 MB limit",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The limit is inclusive, so a file of exactly 1 048 576 bytes must go through. An off-by-one that " +
      "rejected it would be invisible in manual testing - nobody chooses a file by its byte count - and " +
      "would surface as a complaint that a photo \"sometimes\" cannot be attached.",
    steps: [
      {
        action: "Call `upload` with a file of 1 048 576 bytes for an order the actor may upload to.",
        expected: "The object is stored and the attachment row is created.",
      },
    ],
  },
  {
    key: "orders.files.checks-upload-access-first",
    suite: filesSuite,
    title: "refuses an upload before it reaches the storage",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Upload permission is narrower than read permission - a customer may attach only to their own order " +
      "while it is still new - so the access check has to gate the write itself. A guard that ran after " +
      "the upload would let any signed-in user write objects into the bucket under an order they cannot " +
      "see, which is both a storage cost and an information leak.",
    preconditions: "The order service refuses upload access for the acting user.",
    steps: [
      {
        action: "Call `upload` with a valid file.",
        expected:
          "The `ForbiddenException` from the access check reaches the caller, and neither `createObjectKey` " +
          "nor `put` runs.",
      },
    ],
  },
  {
    key: "orders.files.removes-orphan-on-failure",
    suite: filesSuite,
    title: "removes the stored object when the record cannot be saved",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The object is written before the row that points at it, because an object without a row is " +
      "invisible but a row without an object would break every download. When the insert then fails - a " +
      "dropped connection, a constraint - the service compensates by deleting the object, so a failed " +
      "upload leaves no storage behind and the error still reaches the client.",
    preconditions: "The attachment insert rejects.",
    steps: [
      {
        action: "Call `upload` with a valid file and a successful storage write.",
        expected: "The object key is deleted from the storage and the original error is rethrown.",
      },
    ],
  },
  {
    key: "orders.files.sanitizes-uploaded-name",
    suite: filesSuite,
    title: "stores a safe, bounded file name",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The name comes from the client, so it can carry a path traversal, control characters or several " +
      "hundred bytes of noise. The row keeps only the base name with control characters stripped and a " +
      "255-byte cap, and a name that normalises to nothing falls back to `attachment`: the value travels " +
      "back in the `Content-Disposition` header of every download.",
    steps: [
      {
        action: "Call `upload` with `originalname` set to `..\\..\\etc/passwd\\u0000.png`.",
        expected: "The row stores `filename: \"passwd.png\"`.",
      },
      {
        action: "Call `upload` with a name of only spaces.",
        expected: "The row stores `filename: \"attachment\"`.",
      },
      {
        action: "Call `upload` with a 300-character name.",
        expected: "The stored name is cut to 255 characters.",
      },
    ],
  },
  {
    key: "orders.files.stores-declared-metadata",
    suite: filesSuite,
    title: "records the uploader, size and object key",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The attachment row is the only place that ties an object back to the order and to the person who " +
      "sent it, which is what the order page and the audit trail render. It also carries the declared " +
      "content type, and a file with no type must be stored as a null type instead of the string " +
      "`\"undefined\"`, which would be served back as a broken `Content-Type` header.",
    steps: [
      {
        action: "Call `upload` with a file of 1 024 bytes and an empty `mimetype`.",
        expected:
          "The stored attachment row carries the order id, the actor as `uploadedById`, the generated " +
          "object key, `sizeBytes: 1024` and `contentType: null`.",
      },
    ],
  },
  {
    key: "orders.files.scopes-download-to-order",
    suite: filesSuite,
    title: "answers not found for an attachment of another order",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "An attachment id is a UUID, and guessing one is exactly the kind of thing the read check has to " +
      "survive: access is proved for the order in the URL, so the lookup must also constrain the order. " +
      "Looking the row up by id alone would hand the files of any readable order to whoever knows an id, " +
      "and `404` rather than `403` avoids confirming that the attachment exists.",
    preconditions: "The actor may read the order in the URL, and the attachment belongs to another order.",
    steps: [
      {
        action: "Call `download` with an attachment id of a different order.",
        expected:
          "The attachment row of the other order stays invisible: the call answers " +
          "`NotFoundException` and the storage is never read.",
      },
    ],
  },
  {
    key: "orders.files.download-falls-back-to-stored-type",
    suite: filesSuite,
    title: "falls back to the stored content type of the object",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Older rows can carry a null content type, and the browser needs one to render or download the file " +
      "correctly. The service therefore prefers the stored object type and only then falls back to " +
      "`application/octet-stream`, so a photo keeps being served as an image after a schema change.",
    steps: [
      {
        action: "Call `download` for a row without `contentType` whose object reports `image/png`.",
        expected: "The result carries `contentType: \"image/png\"` and the stored file name.",
      },
      {
        action: "Call `download` for a row and an object that both lack a content type.",
        expected: "The result carries `contentType: \"application/octet-stream\"`.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
