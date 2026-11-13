import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { ACCEPTED_FILE_TYPES, detectFileType } from "./file-signature.js";

/**
 * The stored content type decides what the download claims to be, and the request
 * decides nothing: the multipart `Content-Type` is whatever the caller writes.
 * The sniffer is the trusted half of that contract, so its allowlist has to be
 * exactly the formats the product offers and its refusals have to cover the
 * payloads that would matter - a script, an archive and a truncated header.
 */
describe("Files", () => {
  describe("Content type", () => {
    it(
      qc("files.signature.detected-types", "recognises the accepted formats by their signature"),
      () => {
        expect(detectFileType(png())?.contentType).toBe("image/png");
        expect(detectFileType(jpeg())?.contentType).toBe("image/jpeg");
        expect(detectFileType(Buffer.from("GIF89a\u0001\u0000", "latin1"))?.contentType).toBe(
          "image/gif",
        );
        expect(detectFileType(webp())?.contentType).toBe("image/webp");
        expect(detectFileType(pdf())?.contentType).toBe("application/pdf");
        expect(ACCEPTED_FILE_TYPES).toBe("PNG, JPEG, GIF, WebP and PDF");
      },
    );

    it(
      qc("files.signature.rejects-unknown", "refuses a file whose bytes are not an accepted format"),
      () => {
        const refused = [
          Buffer.from("<html><script>alert(1)</script></html>"),
          // "MZ" is the start of a Windows executable.
          Buffer.from("MZ\u0090\u0000\u0003", "latin1"),
          Buffer.from("PK\u0003\u0004", "latin1"),
          Buffer.from(""),
          // A PNG signature cut in the middle must not be accepted either.
          png().subarray(0, 4),
          // RIFF alone is a WAV as easily as a WebP.
          Buffer.from("RIFF\u0024\u0000\u0000\u0000WAVE", "latin1"),
        ];

        for (const bytes of refused) {
          expect(detectFileType(bytes), JSON.stringify(bytes.toString("latin1"))).toBeUndefined();
        }
      },
    );
  });
});

function png(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
}

function jpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function webp(): Buffer {
  return Buffer.from("RIFF\u0024\u0000\u0000\u0000WEBPVP8 ", "latin1");
}

function pdf(): Buffer {
  return Buffer.from("%PDF-1.7\n1 0 obj\n", "latin1");
}
