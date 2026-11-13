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
    key: "orders.files.stores-upload-metadata",
    suite: filesSuite,
    title: "records the uploader, size, object key and detected type",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The attachment row is the only place that ties an object back to the order and to the person who " +
      "sent it, which is what the order page and the audit trail render. Its content type no longer comes " +
      "from the request: an upload that declares nothing - or the wrong thing - is stored with the type its " +
      "bytes prove, so the row never carries a null or a caller-chosen value.",
    steps: [
      {
        action: "Call `upload` with a PNG of 1 024 bytes and an empty `mimetype`.",
        expected:
          "The stored attachment row carries the order id, the actor as `uploadedById`, the generated " +
          "object key, `sizeBytes: 1024` and `contentType: \"image/png\"`.",
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
    key: "orders.files.rejects-executable-type",
    suite: filesSuite,
    title: "refuses a file that is not an image or a PDF whatever type the request declares",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "The request chooses the multipart `Content-Type`, so a caller could upload a page or a script and " +
      "call it `image/png`. Today every download is an attachment, so the header only picks the program the " +
      "browser opens - but the same value turns executable as soon as an inline preview exists. The bytes " +
      "therefore decide: an unaccepted signature is refused with `415` before the object key is even made, " +
      "so nothing lands in the bucket and nothing is recorded in the order.",
    preconditions: "The actor may upload to the order.",
    steps: [
      {
        action: "Upload an HTML document named `photo.png` with the declared type `image/png`.",
        expected:
          "The call answers `UnsupportedMediaTypeException`, the storage receives neither an object key nor " +
          "a `put`, and the order keeps no attachment rows.",
      },
    ],
  },
  {
    key: "orders.files.stores-detected-type",
    suite: filesSuite,
    title: "stores the type detected from the bytes instead of the declared one",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "A file that is acceptable should be stored with the type it actually is, not with the declaration " +
      "that accompanied it. The row and the bucket metadata both carry the detected type, so neither a " +
      "later read of the database nor a direct read of the object can report what the caller claimed.",
    steps: [
      {
        action: "Upload a PNG that declares `text/html`.",
        expected:
          "The attachment row stores `contentType: \"image/png\"`, and the object is written with the same type.",
      },
    ],
  },
  {
    key: "orders.files.download-serves-neutral-type",
    suite: filesSuite,
    title: "serves every download as a neutral binary stream",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The stored type describes the object for the product, not for the browser. Serving the download as " +
      "`application/octet-stream` - together with the attachment disposition the controller already sets - " +
      "means a caller cannot make the API answer with a type the browser would render in the application " +
      "origin, whatever the row or the bucket says.",
    steps: [
      {
        action: "Download an attachment whose row and object both report `image/png`.",
        expected: "The result carries `contentType: \"application/octet-stream\"` and the stored file name.",
      },
    ],
  },
  {
    key: "orders.files.rejects-attachment-over-quota",
    suite: filesSuite,
    title: "refuses an attachment above the quota of the order",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "The 1 MB cap bounds a single file, not the account behind it: registration is open, so without a " +
      "per-order quota one customer can put thousands of files into the volume that holds the database. The " +
      "count runs before the object is written, so a refused upload costs neither disk nor the bandwidth of " +
      "the transfer.",
    preconditions: "`ORDER_ATTACHMENT_LIMIT` is 2 and the order already holds two attachments.",
    steps: [
      {
        action: "Upload a third attachment to that order.",
        expected:
          "The call answers `ConflictException`, the storage receives no `put` and the order keeps two rows.",
      },
    ],
  },
  {
    key: "orders.files.rejects-daily-upload-quota",
    suite: filesSuite,
    title: "refuses an upload above the daily quota of the account",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Spreading the uploads over many orders would defeat a per-order quota, so the account itself has a " +
      "daily budget. It is counted over a rolling day rather than a calendar one, which stops an account " +
      "from sending two batches back to back around midnight.",
    preconditions: "`ORDER_ATTACHMENT_DAILY_LIMIT` is 2 and the account uploaded two files an hour ago.",
    steps: [
      {
        action: "Upload another file to a fresh order.",
        expected:
          "The call answers `ConflictException`, the storage receives no `put` and the two earlier rows stay.",
      },
    ],
  },
  {
    key: "orders.files.counts-only-the-last-day",
    suite: filesSuite,
    title: "does not count the uploads of earlier days",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "A daily quota that never forgets would lock a long-running account out of the product. The window is " +
      "the last 24 hours, so an account with two uploads from yesterday is free to send the next one today.",
    preconditions: "`ORDER_ATTACHMENT_DAILY_LIMIT` is 2 and both earlier uploads are older than a day.",
    steps: [
      {
        action: "Upload a file today.",
        expected: "The object is stored and the order gains the attachment.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
