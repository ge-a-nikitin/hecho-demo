import { describe, expect, it, vi } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { ObjectStorageService } from "./object-storage.service.js";

/**
 * The S3 SDK is replaced by a fake that records the commands it receives, so the
 * suite stays offline and still asserts the contract the service has with
 * SeaweedFS: bucket, keys, paging and error counting.
 */
const sdk = vi.hoisted(() => ({
  clients: [] as { settings: Record<string, unknown>; send: ReturnType<typeof vi.fn> }[],
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(readonly input: Record<string, unknown>) {}
  }

  class S3Client {
    readonly send = vi.fn();

    constructor(readonly settings: Record<string, unknown>) {
      sdk.clients.push(this);
    }
  }

  return {
    S3Client,
    DeleteObjectCommand: Command,
    DeleteObjectsCommand: Command,
    GetObjectCommand: Command,
    ListObjectsV2Command: Command,
    PutObjectCommand: Command,
  };
});

describe("Storage", () => {
  describe("Objects", () => {
    it(qc("storage.objects.namespace", "namespaces a new object under the order that owns it"), () => {
      const { service } = storageService();

      const first = service.createObjectKey("order-1");
      const second = service.createObjectKey("order-1");
      const otherOrder = service.createObjectKey("order-2");

      expect(first).toMatch(/^orders\/order-1\/[0-9a-f-]{36}$/u);
      expect(second).not.toBe(first);
      expect(otherOrder).toMatch(/^orders\/order-2\//u);
    });

    it(qc("storage.objects.put", "stores an upload with its length and content type"), async () => {
      const { service, sent } = storageService();
      const body = Buffer.from("invoice scan");

      await service.put("orders/order-1/key-1", {
        buffer: body,
        originalname: "scan.png",
        size: body.length,
        mimetype: "image/png",
      });

      expect(sent(0)).toEqual({
        Bucket: "unit-test-bucket",
        Key: "orders/order-1/key-1",
        Body: body,
        ContentLength: body.length,
        ContentType: "image/png",
      });
    });

    it(
      qc("storage.objects.put.default-type", "falls back to a binary content type for untyped uploads"),
      async () => {
        const { service, sent } = storageService();

        await service.put("orders/order-1/key-1", {
          buffer: Buffer.from("scan"),
          originalname: "scan",
          size: 4,
          mimetype: "",
        });

        expect(sent(0).ContentType).toBe("application/octet-stream");
      },
    );

    it(qc("storage.objects.get", "returns the stored bytes together with their content type"), async () => {
      const { service, client } = storageService();
      client.send.mockResolvedValueOnce({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
        ContentType: "image/png",
      });

      const object = await service.get("orders/order-1/key-1");

      expect(object.bytes).toEqual(Buffer.from([1, 2, 3]));
      expect(object.contentType).toBe("image/png");
      expect(client.send.mock.calls[0]?.[0]).toMatchObject({
        input: { Bucket: "unit-test-bucket", Key: "orders/order-1/key-1" },
      });
    });

    it(qc("storage.objects.get.empty", "fails loudly when the bucket answers without a body"), async () => {
      const { service, client } = storageService();
      client.send.mockResolvedValueOnce({ ContentType: "image/png" });

      await expect(service.get("orders/order-1/missing")).rejects.toThrow(
        /Object storage returned an empty body for orders\/order-1\/missing/u,
      );
    });

    it(qc("storage.objects.delete", "deletes one object by key"), async () => {
      const { service, sent } = storageService();

      await service.delete("orders/order-1/key-1");

      expect(sent(0)).toEqual({ Bucket: "unit-test-bucket", Key: "orders/order-1/key-1" });
    });

    it(
      qc("storage.objects.purge.pages", "purges the bucket page by page and counts every deletion"),
      async () => {
        const { service, client } = storageService();
        client.send
          .mockResolvedValueOnce({
            Contents: [{ Key: "orders/order-1/a" }, { Key: "orders/order-1/b" }, {}],
            IsTruncated: true,
            NextContinuationToken: "page-2",
          })
          .mockResolvedValueOnce({
            Deleted: [{ Key: "orders/order-1/a" }, { Key: "orders/order-1/b" }],
          })
          .mockResolvedValueOnce({ Contents: [{ Key: "orders/order-2/c" }], IsTruncated: false })
          .mockResolvedValueOnce({ Deleted: [{ Key: "orders/order-2/c" }] });

        const report = await service.deleteAll();

        expect(report).toEqual({ deleted: 3, failed: 0 });
        expect(client.send.mock.calls[0]?.[0]).toMatchObject({
          input: { Bucket: "unit-test-bucket", MaxKeys: 1000, ContinuationToken: undefined },
        });
        expect(client.send.mock.calls[1]?.[0]).toMatchObject({
          input: {
            Bucket: "unit-test-bucket",
            Delete: {
              Objects: [{ Key: "orders/order-1/a" }, { Key: "orders/order-1/b" }],
              Quiet: false,
            },
          },
        });
        expect(client.send.mock.calls[2]?.[0]).toMatchObject({
          input: { ContinuationToken: "page-2" },
        });
        expect(client.send).toHaveBeenCalledTimes(4);
      },
    );

    it(
      qc("storage.objects.purge.failures", "counts failed deletions instead of aborting the purge"),
      async () => {
        const { service, client } = storageService();
        client.send
          .mockResolvedValueOnce({ Contents: [{ Key: "orders/order-1/a" }], IsTruncated: false })
          .mockResolvedValueOnce({
            Deleted: [{ Key: "orders/order-1/a" }],
            Errors: [
              { Key: "orders/order-1/b", Code: "AccessDenied" },
              { Key: "orders/order-1/c", Code: "AccessDenied" },
            ],
          });

        const report = await service.deleteAll();

        expect(report).toEqual({ deleted: 1, failed: 2 });
      },
    );
  });
});

function storageService(): {
  service: ObjectStorageService;
  client: { settings: Record<string, unknown>; send: ReturnType<typeof vi.fn> };
  sent: (call: number) => Record<string, unknown>;
} {
  const service = new ObjectStorageService();
  const client = sdk.clients.at(-1);
  if (!client) throw new Error("ObjectStorageService did not create an S3 client");

  return {
    service,
    client,
    sent: (call) => (client.send.mock.calls[call]?.[0] as { input: Record<string, unknown> }).input,
  };
}
