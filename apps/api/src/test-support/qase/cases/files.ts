import type { QaseCase } from "../types.js";

const contentTypeSuite = ["Files", "Content type"] as const;

/**
 * The stored type of an upload decides what the download claims to be, and the
 * request carries a type the caller writes. The sniffer is the trusted half of
 * that contract, so its cases pin the accepted formats and the payloads that
 * must never fit them.
 */
export const filesCases = [
  {
    key: "files.signature.detected-types",
    suite: contentTypeSuite,
    title: "recognises the accepted formats by their signature",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The API used to store the `Content-Type` of the multipart part and hand it back on download, which " +
      "let a caller choose what the product says a file is. The type now comes from the bytes, so this case " +
      "pins the allowlist - the photos, drawings and PDF documents the Swagger text offers - and the exact " +
      "wording the refusal uses.",
    steps: [
      {
        action: "Detect the type of a PNG, a JPEG, a GIF, a WebP and a PDF.",
        expected: "Each call answers with its own media type.",
      },
      {
        action: "Read the documented allowlist.",
        expected: "It reads `PNG, JPEG, GIF, WebP and PDF`.",
      },
    ],
  },
  {
    key: "files.signature.rejects-unknown",
    suite: contentTypeSuite,
    title: "refuses a file whose bytes are not an accepted format",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "A file is refused by its content, never by its name: the dangerous payloads are the ones a caller " +
      "would dress up as a photo, so the case covers a script, a Windows executable, an archive, an empty " +
      "file, a signature cut in the middle and a RIFF container that is a WAV rather than a WebP. Returning " +
      "no type is what makes the upload answer 415 instead of storing the file.",
    steps: [
      {
        action: "Detect the type of an HTML document, an `MZ` executable, a ZIP archive and an empty buffer.",
        expected: "Every call answers `undefined`.",
      },
      {
        action: "Detect the type of a PNG signature truncated to four bytes and of a `RIFF`/`WAVE` file.",
        expected: "Both answer `undefined`.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
