import type { QaseCase } from "../types.js";

const objectsSuite = ["Storage", "Objects"] as const;

/**
 * The SeaweedFS contract. The suite replaces the S3 SDK with an in-memory bucket,
 * so every case here describes what the service leaves in the bucket - the stored
 * bytes, the stored content type, the keys that survive a purge - rather than the
 * command objects it sends.
 */
export const storageCases = [
  {
    key: "storage.objects.namespace",
    suite: objectsSuite,
    title: "namespaces a new object under the order that owns it",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Attachment keys are derived from the order so that a bucket listing stays readable and a stored " +
      "file can be traced back to its order without consulting the database. The random tail keeps two " +
      "uploads with the same name in one order apart, because the original filename never reaches the key.",
    steps: [
      {
        action: "Call `createObjectKey(\"order-1\")` twice and `createObjectKey(\"order-2\")` once.",
        expected:
          "Both order-1 keys match `orders/order-1/<uuid>` and differ from each other; the order-2 key " +
          "starts with `orders/order-2/`.",
      },
    ],
  },
  {
    key: "storage.objects.put",
    suite: objectsSuite,
    title: "stores an upload with its length and content type",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The browser-supplied MIME type is stored with the object, because the download endpoint returns " +
      "the content type from the bucket instead of guessing it from the extension. `ContentLength` is " +
      "passed explicitly so SeaweedFS never has to buffer the stream to learn its size.",
    steps: [
      {
        action: "Call `put` with a buffer, its size and `image/png`.",
        expected:
          "The bucket holds one object under that key whose bytes are the uploaded buffer and whose " +
          "content type is `image/png`.",
      },
    ],
  },
  {
    key: "storage.objects.put.default-type",
    suite: objectsSuite,
    title: "falls back to a binary content type for untyped uploads",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Clients may upload without a MIME type, and an empty `ContentType` makes the download endpoint " +
      "answer with a header the browser cannot interpret, which turns a preview into a download. The " +
      "service therefore never sends an empty type to the bucket.",
    steps: [
      {
        action: "Call `put` with `mimetype: \"\"`.",
        expected: "The object is stored with `application/octet-stream` as its content type.",
      },
    ],
  },
  {
    key: "storage.objects.get",
    suite: objectsSuite,
    title: "returns the stored bytes together with their content type",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The download endpoint streams exactly what is stored and forwards the stored content type, so a " +
      "receipt opens as an image or a PDF instead of a generic file. The service reads the object into a " +
      "buffer, which is acceptable because uploads are capped at 1 MB.",
    steps: [
      {
        action: "Call `get` for a stored key while the bucket holds three bytes with `image/png`.",
        expected:
          "The result holds a buffer with those bytes and `contentType: image/png`, so a download " +
          "reproduces what was uploaded.",
      },
    ],
  },
  {
    key: "storage.objects.get.empty",
    suite: objectsSuite,
    title: "fails loudly when the bucket answers without a body",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "A missing body means the row and the bucket disagree, for example after a manual purge. Returning " +
      "an empty buffer would hand the customer a zero-byte file, so the service raises an error that names " +
      "the key and leaves a trace for the operator.",
    steps: [
      {
        action: "Call `get` while the bucket answers without a body.",
        expected: "The promise rejects with a message that contains the requested key.",
      },
    ],
  },
  {
    key: "storage.objects.delete",
    suite: objectsSuite,
    title: "deletes one object by key",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Removing an attachment has to remove the object as well, otherwise the bucket grows with files " +
      "that no row points at. The key comes from the attachment row, so exactly that object disappears " +
      "while its neighbours stay.",
    steps: [
      {
        action: "Call `delete` for one of two stored keys.",
        expected: "The bucket no longer holds that object and still holds the other one.",
      },
    ],
  },
  {
    key: "storage.objects.purge.pages",
    suite: objectsSuite,
    title: "purges the bucket page by page and counts every deletion",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "destructive",
    description:
      "A reset has to empty the bucket, including files whose rows were already gone, and the S3 listing " +
      "returns at most 1000 keys per page. Stopping after the first page would leave objects that no later " +
      "reset can attribute, and a wrong count would hide that from the operator.",
    steps: [
      {
        action:
          "Call `deleteAll` while the bucket holds three objects and returns at most two keys per page.",
        expected:
          "The purge continues past the first page, the report counts all three deletions and the bucket " +
          "is empty afterwards.",
      },
    ],
  },
  {
    key: "storage.objects.purge.failures",
    suite: objectsSuite,
    title: "counts failed deletions instead of aborting the purge",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The database is already empty when the bucket purge runs, so throwing here would stop the reset " +
      "half-way and lose the report. Per-object errors are counted and returned instead, which lets the " +
      "caller tell the operator that some files survived.",
    steps: [
      {
        action: "Call `deleteAll` while the bucket deletes one key and refuses two others.",
        expected:
          "The promise resolves with `{ deleted: 1, failed: 2 }` and the two refused objects are still " +
          "in the bucket, so the operator can remove them by hand.",
      },
    ],
  },
  {
    key: "storage.objects.config-lazy",
    suite: objectsSuite,
    title: "reads the bucket settings on the first call instead of at construction",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Constructing the service used to read `S3_*` and build the S3 client, so every module that only " +
      "imported it needed SeaweedFS settings, and the offline unit suite had to invent placeholders for " +
      "them. Reading the settings on the first call keeps construction free - while a deployment without " +
      "`S3_BUCKET` must still fail loudly instead of storing nothing.",
    preconditions: "`S3_*` configured, then `S3_BUCKET` removed after the service is created.",
    steps: [
      {
        action: "Create the service without any `S3_*` setting and call `put`.",
        expected: "The call rejects with `S3_BUCKET is required`.",
      },
      {
        action: "Restore `S3_BUCKET` and call `put` again on the same instance.",
        expected: "The object is stored, because the settings are read when they are first needed.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
