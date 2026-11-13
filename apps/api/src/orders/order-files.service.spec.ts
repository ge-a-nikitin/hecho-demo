import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { UserRole } from "../generated/prisma/enums.js";
import type { ObjectStorageService } from "../storage/object-storage.service.js";
import { createFakeDatabase, type FakeDatabaseOptions } from "../test-support/fake-database.js";
import { qc } from "../test-support/qase-case.js";
import { withEnv } from "../test-support/with-env.js";
import { OrderFilesService, type UploadedOrderFile } from "./order-files.service.js";
import type { OrdersService } from "./orders.service.js";

const orderId = "order-1";
const objectKey = "orders/order-1/key-1";
const actor = { id: "user-1", role: UserRole.CUSTOMER };

describe("Orders", () => {
  describe("Files", () => {
    beforeEach(() => {
      createObjectKey.mockClear();
      put.mockClear();
      remove.mockClear();
      getObject.mockClear();
      requireUploadAccess.mockClear();
      requireReadAccess.mockClear();
      requireUploadAccess.mockResolvedValue(undefined);
      requireReadAccess.mockResolvedValue(undefined);
    });

    it(qc("orders.files.requires-file", "refuses an upload without a file"), async () => {
      const { db, service } = serviceWith();

      await expect(service.upload(orderId, undefined, actor)).rejects.toThrow(
        new BadRequestException("A file is required"),
      );

      expect(requireUploadAccess).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
      expect(db.rows("orderAttachment")).toEqual([]);
    });

    it(qc("orders.files.rejects-oversized-file", "refuses a file above the 1 MB limit"), async () => {
      const { db, service } = serviceWith();

      await expect(service.upload(orderId, file({ size: 1_048_577 }), actor)).rejects.toThrow(
        new BadRequestException("Files may not exceed 1 MB"),
      );

      expect(put).not.toHaveBeenCalled();
      expect(db.rows("orderAttachment")).toEqual([]);
    });

    it(qc("orders.files.accepts-limit-size", "accepts a file of exactly the 1 MB limit"), async () => {
      const { db, service } = serviceWith();

      const stored = await service.upload(
        orderId,
        file({ buffer: pngOfSize(1_048_576), size: 1_048_576 }),
        actor,
      );

      expect(stored).toMatchObject({ orderId, sizeBytes: 1_048_576 });
      expect(put).toHaveBeenCalledTimes(1);
      expect(db.rows("orderAttachment")).toHaveLength(1);
    });

    it(
      qc("orders.files.rejects-attachment-over-quota", "refuses an attachment above the quota of the order"),
      async () => {
        const { db, service } = await withEnv({ ORDER_ATTACHMENT_LIMIT: "2" }, () =>
          serviceWith({
            orderAttachment: [
              attachment({ id: "attachment-1", uploadedById: "user-2" }),
              attachment({ id: "attachment-2", uploadedById: "user-2" }),
            ],
          }),
        );

        await expect(service.upload(orderId, file(), actor)).rejects.toThrow(
          new ConflictException("An order may hold at most 2 attachments"),
        );

        expect(createObjectKey).not.toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
        expect(db.rows("orderAttachment")).toHaveLength(2);
      },
    );

    it(
      qc("orders.files.rejects-daily-upload-quota", "refuses an upload above the daily quota of the account"),
      async () => {
        const { db, service } = await withEnv({ ORDER_ATTACHMENT_DAILY_LIMIT: "2" }, () =>
          serviceWith({
            orderAttachment: [
              attachment({ id: "attachment-1", orderId: "order-2", objectKey: "orders/order-2/key-1" }),
              attachment({
                id: "attachment-2",
                orderId: "order-3",
                objectKey: "orders/order-3/key-2",
                createdAt: hoursAgo(1),
              }),
            ],
          }),
        );

        await expect(service.upload(orderId, file(), actor)).rejects.toThrow(
          new ConflictException("An account may upload at most 2 attachments a day"),
        );

        expect(put).not.toHaveBeenCalled();
        expect(db.rows("orderAttachment")).toHaveLength(2);
      },
    );

    it(
      qc("orders.files.counts-only-the-last-day", "does not count the uploads of earlier days"),
      async () => {
        const { db, service } = await withEnv({ ORDER_ATTACHMENT_DAILY_LIMIT: "2" }, () =>
          serviceWith({
            orderAttachment: [
              attachment({
                id: "attachment-1",
                orderId: "order-2",
                objectKey: "orders/order-2/key-1",
                createdAt: hoursAgo(25),
              }),
              attachment({
                id: "attachment-2",
                orderId: "order-3",
                objectKey: "orders/order-3/key-2",
                createdAt: hoursAgo(30),
              }),
            ],
          }),
        );

        const stored = await service.upload(orderId, file(), actor);

        expect(stored).toMatchObject({ orderId });
        expect(put).toHaveBeenCalledTimes(1);
        expect(db.rows("orderAttachment")).toHaveLength(3);
      },
    );

    it(
      qc("orders.files.checks-upload-access-first", "refuses an upload before it reaches the storage"),
      async () => {
        const { db, service } = serviceWith();
        requireUploadAccess.mockRejectedValue(
          new ForbiddenException("You cannot upload files to this order"),
        );

        await expect(service.upload(orderId, file(), actor)).rejects.toThrow(ForbiddenException);

        expect(createObjectKey).not.toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
        expect(db.rows("orderAttachment")).toEqual([]);
      },
    );

    it(
      qc(
        "orders.files.removes-orphan-on-failure",
        "removes the stored object when the record cannot be saved",
      ),
      async () => {
        const { db, service } = serviceWith(
          {},
          { failOn: { table: "orderAttachment", operation: "create" } },
        );

        await expect(service.upload(orderId, file(), actor)).rejects.toThrow(
          /rejected orderAttachment\.create/u,
        );

        expect(remove).toHaveBeenCalledWith(objectKey);
        expect(db.rows("orderAttachment")).toEqual([]);
      },
    );

    it(qc("orders.files.sanitizes-uploaded-name", "stores a safe, bounded file name"), async () => {
      const { db, service } = serviceWith();

      await service.upload(orderId, file({ originalname: "..\\..\\etc/passwd\u0000.png" }), actor);
      await service.upload(orderId, file({ originalname: "   " }), actor);
      await service.upload(orderId, file({ originalname: "a".repeat(300) }), actor);

      expect(db.rows("orderAttachment").map((row) => row.filename)).toEqual([
        "passwd.png",
        "attachment",
        "a".repeat(255),
      ]);
    });

    it(qc("orders.files.stores-upload-metadata", "records the uploader, size, object key and detected type"), async () => {
      const { db, service } = serviceWith();

      await service.upload(orderId, file({ mimetype: "", size: 1_024 }), actor);

      expect(db.rows("orderAttachment")).toEqual([
        {
          id: expect.any(String),
          orderId,
          uploadedById: actor.id,
          objectKey,
          filename: "photo.png",
          // An empty declared type no longer reaches the row: the bytes decide.
          contentType: "image/png",
          sizeBytes: 1_024,
          createdAt: expect.any(Date),
        },
      ]);
    });

    it(
      qc("orders.files.scopes-download-to-order", "answers not found for an attachment of another order"),
      async () => {
        const { service } = serviceWith({
          orderAttachment: [
            { id: "attachment-2", orderId: "order-2", objectKey, filename: "photo.png" },
          ],
        });

        await expect(service.download(orderId, "attachment-2", actor)).rejects.toThrow(
          NotFoundException,
        );

        expect(getObject).not.toHaveBeenCalled();
      },
    );

    it(
      qc(
        "orders.files.rejects-executable-type",
        "refuses a file that is not an image or a PDF whatever type the request declares",
      ),
      async () => {
        const { db, service } = serviceWith();

        await expect(
          service.upload(
            orderId,
            file({
              buffer: Buffer.from("<html><script>alert(1)</script></html>"),
              originalname: "photo.png",
              mimetype: "image/png",
            }),
            actor,
          ),
        ).rejects.toThrow(UnsupportedMediaTypeException);

        expect(createObjectKey).not.toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
        expect(db.rows("orderAttachment")).toEqual([]);
      },
    );

    it(
      qc(
        "orders.files.stores-detected-type",
        "stores the type detected from the bytes instead of the declared one",
      ),
      async () => {
        const { db, service } = serviceWith();

        await service.upload(
          orderId,
          file({
            buffer: pngBytes(),
            originalname: "scan",
            mimetype: "text/html",
          }),
          actor,
        );

        expect(db.rows("orderAttachment")).toEqual([
          expect.objectContaining({ filename: "scan", contentType: "image/png" }),
        ]);
        // The bucket metadata carries the same type, so a future direct read of
        // the object cannot report what the caller claimed either.
        expect(put).toHaveBeenCalledWith(objectKey, expect.objectContaining({ mimetype: "image/png" }));
      },
    );

    it(
      qc("orders.files.download-serves-neutral-type", "serves every download as a neutral binary stream"),
      async () => {
        const { service } = serviceWith({
          orderAttachment: [
            { id: "attachment-1", orderId, objectKey, filename: "photo.png", contentType: "image/png" },
          ],
        });
        getObject.mockResolvedValue({ bytes: Buffer.from("data"), contentType: "image/png" });

        await expect(service.download(orderId, "attachment-1", actor)).resolves.toEqual({
          bytes: Buffer.from("data"),
          filename: "photo.png",
          contentType: "application/octet-stream",
        });
      },
    );
  });
});

const createObjectKey = vi.fn(() => objectKey);
const put = vi.fn();
const remove = vi.fn();
const getObject = vi.fn();
const requireUploadAccess = vi.fn();
const requireReadAccess = vi.fn();

function serviceWith(
  seed: Parameters<typeof createFakeDatabase>[0] = {},
  options: FakeDatabaseOptions = {},
): { db: ReturnType<typeof createFakeDatabase>; service: OrderFilesService } {
  const db = createFakeDatabase(seed, options);

  return {
    db,
    service: new OrderFilesService(
      db.prisma as unknown as PrismaService,
      { createObjectKey, put, delete: remove, get: getObject } as unknown as ObjectStorageService,
      {
        requireAttachmentUploadAccess: requireUploadAccess,
        requireAttachmentReadAccess: requireReadAccess,
      } as unknown as OrdersService,
    ),
  };
}

function file(overrides: Partial<UploadedOrderFile> = {}): UploadedOrderFile {
  return {
    buffer: pngBytes(),
    originalname: "photo.png",
    mimetype: "image/png",
    size: pngBytes().length,
    ...overrides,
  };
}

/** The smallest valid PNG: what the sniffer needs is the signature, and this has it. */
function pngBytes(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
}

/** A PNG padded to an exact byte count, for the size boundary. */
function pngOfSize(bytes: number): Buffer {
  return Buffer.concat([pngBytes(), Buffer.alloc(bytes - pngBytes().length)]);
}

function attachment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "attachment-1",
    orderId,
    uploadedById: actor.id,
    objectKey,
    filename: "photo.png",
    contentType: "image/png",
    sizeBytes: 4,
    createdAt: new Date(),
    ...overrides,
  };
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1_000);
}
