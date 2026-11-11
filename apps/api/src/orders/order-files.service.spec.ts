import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { UserRole } from "../generated/prisma/enums.js";
import type { ObjectStorageService } from "../storage/object-storage.service.js";
import { createFakeDatabase, type FakeDatabaseOptions } from "../test-support/fake-database.js";
import { qc } from "../test-support/qase-case.js";
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

      const stored = await service.upload(orderId, file({ size: 1_048_576 }), actor);

      expect(stored).toMatchObject({ orderId, sizeBytes: 1_048_576 });
      expect(put).toHaveBeenCalledTimes(1);
      expect(db.rows("orderAttachment")).toHaveLength(1);
    });

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

    it(qc("orders.files.stores-declared-metadata", "records the uploader, size and object key"), async () => {
      const { db, service } = serviceWith();

      await service.upload(orderId, file({ mimetype: "", size: 1_024 }), actor);

      expect(db.rows("orderAttachment")).toEqual([
        {
          id: expect.any(String),
          orderId,
          uploadedById: actor.id,
          objectKey,
          filename: "photo.png",
          contentType: null,
          sizeBytes: 1_024,
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
        "orders.files.download-falls-back-to-stored-type",
        "falls back to the stored content type of the object",
      ),
      async () => {
        const { service } = serviceWith({
          orderAttachment: [
            { id: "attachment-1", orderId, objectKey, filename: "photo.png", contentType: null },
            { id: "attachment-3", orderId, objectKey: "orders/order-1/key-3", filename: "photo.png", contentType: null },
          ],
        });
        getObject.mockResolvedValue({ bytes: Buffer.from("data"), contentType: "image/png" });

        await expect(service.download(orderId, "attachment-1", actor)).resolves.toEqual({
          bytes: Buffer.from("data"),
          filename: "photo.png",
          contentType: "image/png",
        });

        getObject.mockResolvedValue({ bytes: Buffer.from("data"), contentType: undefined });
        await expect(service.download(orderId, "attachment-3", actor)).resolves.toMatchObject({
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
    buffer: Buffer.from("data"),
    originalname: "photo.png",
    mimetype: "image/png",
    size: 4,
    ...overrides,
  };
}
