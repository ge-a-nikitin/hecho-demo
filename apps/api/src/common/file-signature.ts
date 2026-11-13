/**
 * The type of an uploaded file, read from its bytes instead of the request.
 *
 * A multipart part carries a `Content-Type` that the caller chooses, and the API
 * used to store that value and hand it back as the type of the download. Every
 * download is an attachment today, so the header only decides which program the
 * browser opens the file with - but the same value becomes executable the moment
 * an inline preview exists. Only the formats the product offers are accepted
 * here: photos, drawings and PDF documents, recognised by their signature.
 */

export interface DetectedFileType {
  readonly contentType: string;
  /** Human-readable name for the refusal message and the documentation. */
  readonly label: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const SIGNATURES: readonly { type: DetectedFileType; matches: (bytes: Buffer) => boolean }[] = [
  {
    type: { contentType: "image/png", label: "PNG" },
    matches: (bytes) => hasBytes(bytes, 0, PNG_SIGNATURE),
  },
  {
    type: { contentType: "image/jpeg", label: "JPEG" },
    matches: (bytes) => hasBytes(bytes, 0, [0xff, 0xd8, 0xff]),
  },
  {
    // "GIF87a" and "GIF89a" share the four-byte prefix.
    type: { contentType: "image/gif", label: "GIF" },
    matches: (bytes) => asciiAt(bytes, 0, 4) === "GIF8",
  },
  {
    // A WebP file is a RIFF container whose form type says WEBP.
    type: { contentType: "image/webp", label: "WebP" },
    matches: (bytes) => asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP",
  },
  {
    type: { contentType: "application/pdf", label: "PDF" },
    matches: (bytes) => asciiAt(bytes, 0, 4) === "%PDF",
  },
];

/** Reads the signature; `undefined` means the file is not one of the accepted types. */
export function detectFileType(bytes: Buffer): DetectedFileType | undefined {
  return SIGNATURES.find((signature) => signature.matches(bytes))?.type;
}

const LABELS = SIGNATURES.map((signature) => signature.type.label);

/** The allowlist as the sentences that document and refuse an upload spell it. */
export const ACCEPTED_FILE_TYPES = `${LABELS.slice(0, -1).join(", ")} and ${LABELS.at(-1)}`;

function hasBytes(bytes: Buffer, offset: number, expected: readonly number[]): boolean {
  return bytes.length >= offset + expected.length && bytes.subarray(offset, offset + expected.length).equals(Buffer.from(expected));
}

function asciiAt(bytes: Buffer, offset: number, length: number): string {
  if (bytes.length < offset + length) return "";

  return bytes.subarray(offset, offset + length).toString("latin1");
}
