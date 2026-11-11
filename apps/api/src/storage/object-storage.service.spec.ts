import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadedOrderFile } from "../orders/order-files.service.js";
import { qc } from "../test-support/qase-case.js";
import { ObjectStorageService } from "./object-storage.service.js";

/**
 * The S3 SDK is replaced by an in-memory bucket: `put` stores an object, `get`
 * reads it back, `delete` removes it and the listing answers in pages. The suite
 * therefore asserts what the service leaves in the bucket - the stored bytes, the
 * stored content type, which keys survived a purge - instead of the command
 * objects it hands to the SDK, which describe the request rather than the result.
 */
const bucket = vi.hoisted(() => ({
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  /** Keys the fake refuses to delete, the way a bucket policy would. */
  locked: new Set<string>(),
  /** Keys whose `GET` answer comes back without a body. */
  withoutBody: new Set<string>(),
  /** Objects a single listing page returns, so a case can force paging. */
  pageSize: 1000,
  /** The key order of the listing in progress, so a purge can page while deleting. */
  listing: [] as string[],
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(readonly input: Record<string, unknown>) {}
  }

  class PutObjectCommand extends Command {
    readonly kind = "put";
  }

  class GetObjectCommand extends Command {
    readonly kind = "get";
  }

  class DeleteObjectCommand extends Command {
    readonly kind = "delete";
  }

  class ListObjectsV2Command extends Command {
    readonly kind = "list";
  }

  class DeleteObjectsCommand extends Command {
    readonly kind = "deleteMany";
  }

  class S3Client {
    constructor(readonly settings: Record<string, unknown>) {}

    async send(command: Command & { readonly kind: string }): Promise<unknown> {
      const input = command.input;

      switch (command.kind) {
        case "put": {
          bucket.objects.set(String(input.Key), {
            body: input.Body as Uint8Array,
            contentType: String(input.ContentType),
          });
          return {};
        }
        case "get": {
          const key = String(input.Key);
          const stored = bucket.objects.get(key);
          if (!stored) throw new Error(`NoSuchKey: ${key}`);

          if (bucket.withoutBody.has(key)) return { ContentType: stored.contentType };

          return {
            Body: { transformToByteArray: async () => stored.body },
            ContentType: stored.contentType,
          };
        }
        case "delete": {
          bucket.objects.delete(String(input.Key));
          return {};
        }
        case "list": {
          // A real listing keeps its cursor while the caller deletes, so the fake
          // snapshots the key order when the listing starts and pages through it.
          if (input.ContinuationToken === undefined) bucket.listing = [...bucket.objects.keys()];

          const start = input.ContinuationToken === undefined ? 0 : Number(input.ContinuationToken);
          const end = Math.min(start + bucket.pageSize, bucket.listing.length);

          return {
            Contents: bucket.listing.slice(start, end).map((Key) => ({ Key })),
            IsTruncated: end < bucket.listing.length,
            NextContinuationToken: end < bucket.listing.length ? String(end) : undefined,
          };
        }
        case "deleteMany": {
          const requested = (input.Delete as { Objects: { Key: string }[] }).Objects;
          const deleted: { Key: string }[] = [];
          const errors: { Key: string; Code: string }[] = [];

          for (const { Key } of requested) {
            if (bucket.locked.has(Key)) {
              errors.push({ Key, Code: "AccessDenied" });
              continue;
            }
            bucket.objects.delete(Key);
            deleted.push({ Key });
          }

          return { Deleted: deleted, Errors: errors };
        }
        default:
          throw new Error(`The fake bucket does not support ${command.kind}`);
      }
    }
  }

  return {
    S3Client,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
  };
});

/** Settings the service reads on its first call rather than at construction. */
const storageSettings = {
  S3_ENDPOINT: "http://127.0.0.1:6203",
  S3_ACCESS_KEY: "unit-test-access-key",
  S3_SECRET_KEY: "unit-test-secret-key",
  S3_BUCKET: "unit-test-bucket",
};

describe("Storage", () => {
  beforeEach(() => {
    bucket.objects.clear();
    bucket.locked.clear();
    bucket.withoutBody.clear();
    bucket.pageSize = 1000;
    bucket.listing = [];
    Object.assign(process.env, storageSettings);
  });

  describe("Objects", () => {
    it(qc("storage.objects.namespace", "namespaces a new object under the order that owns it"), () => {
      const service = new ObjectStorageService();

      const first = service.createObjectKey("order-1");
      const second = service.createObjectKey("order-1");
      const otherOrder = service.createObjectKey("order-2");

      expect(first).toMatch(/^orders\/order-1\/[0-9a-f-]{36}$/u);
      expect(second).not.toBe(first);
      expect(otherOrder).toMatch(/^orders\/order-2\//u);
    });

    it(qc("storage.objects.put", "stores an upload with its length and content type"), async () => {
      const service = new ObjectStorageService();
      const file = upload();

      await service.put("orders/order-1/key-1", file);

      expect(bucket.objects.get("orders/order-1/key-1")).toEqual({
        body: file.buffer,
        contentType: "image/png",
      });
    });

    it(
      qc("storage.objects.put.default-type", "falls back to a binary content type for untyped uploads"),
      async () => {
        const service = new ObjectStorageService();

        await service.put("orders/order-1/key-1", upload({ mimetype: "" }));

        expect(bucket.objects.get("orders/order-1/key-1")?.contentType).toBe(
          "application/octet-stream",
        );
      },
    );

    it(
      qc("storage.objects.get", "returns the stored bytes together with their content type"),
      async () => {
        storedObject("orders/order-1/key-1", new Uint8Array([1, 2, 3]), "image/png");
        const service = new ObjectStorageService();

        const object = await service.get("orders/order-1/key-1");

        expect(object.bytes).toEqual(Buffer.from([1, 2, 3]));
        expect(object.contentType).toBe("image/png");
      },
    );

    it(
      qc("storage.objects.get.empty", "fails loudly when the bucket answers without a body"),
      async () => {
        storedObject("orders/order-1/missing");
        bucket.withoutBody.add("orders/order-1/missing");
        const service = new ObjectStorageService();

        await expect(service.get("orders/order-1/missing")).rejects.toThrow(
          /Object storage returned an empty body for orders\/order-1\/missing/u,
        );
      },
    );

    it(qc("storage.objects.delete", "deletes one object by key"), async () => {
      storedObject("orders/order-1/key-1");
      storedObject("orders/order-1/key-2");
      const service = new ObjectStorageService();

      await service.delete("orders/order-1/key-1");

      expect([...bucket.objects.keys()]).toEqual(["orders/order-1/key-2"]);
    });

    it(
      qc("storage.objects.purge.pages", "purges the bucket page by page and counts every deletion"),
      async () => {
        storedObject("orders/order-1/a");
        storedObject("orders/order-1/b");
        storedObject("orders/order-2/c");
        bucket.pageSize = 2;
        const service = new ObjectStorageService();

        const report = await service.deleteAll();

        expect(report).toEqual({ deleted: 3, failed: 0 });
        expect([...bucket.objects.keys()]).toEqual([]);
      },
    );

    it(
      qc("storage.objects.purge.failures", "counts failed deletions instead of aborting the purge"),
      async () => {
        storedObject("orders/order-1/a");
        storedObject("orders/order-1/b");
        storedObject("orders/order-1/c");
        bucket.locked.add("orders/order-1/b");
        bucket.locked.add("orders/order-1/c");
        const service = new ObjectStorageService();

        const report = await service.deleteAll();

        expect(report).toEqual({ deleted: 1, failed: 2 });
        expect([...bucket.objects.keys()]).toEqual(["orders/order-1/b", "orders/order-1/c"]);
      },
    );

    it(
      qc(
        "storage.objects.config-lazy",
        "reads the bucket settings on the first call instead of at construction",
      ),
      async () => {
        const service = new ObjectStorageService();
        const previous = process.env.S3_BUCKET;
        delete process.env.S3_BUCKET;

        try {
          await expect(service.put("orders/order-1/key-1", upload())).rejects.toThrow(
            "S3_BUCKET is required",
          );
        } finally {
          process.env.S3_BUCKET = previous;
        }

        await service.put("orders/order-1/key-1", upload());

        expect(bucket.objects.has("orders/order-1/key-1")).toBe(true);
      },
    );

    /* MORE_CASES */
  });
});

function upload(overrides: Partial<UploadedOrderFile> = {}): UploadedOrderFile {
  const buffer = Buffer.from("invoice scan");

  return {
    buffer,
    originalname: "scan.png",
    size: buffer.length,
    mimetype: "image/png",
    ...overrides,
  } as UploadedOrderFile;
}

/** Seeds an object the way an earlier upload would have left it. */
function storedObject(key: string, body = new Uint8Array([1, 2, 3]), contentType = "image/png") {
  bucket.objects.set(key, { body, contentType });
}
